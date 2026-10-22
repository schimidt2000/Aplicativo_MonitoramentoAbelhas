/**
 * A máquina de estados da conversa com a placa (feature 005, FR-001 a FR-011),
 * pura: sem porta, sem relógio. Cada transição, cada ERROR:* e cada prazo.
 */
import { describe, expect, it } from 'vitest';
import {
  CONFIG_PADRAO, estadoInicial, passo, type Acao, type DesfechoDaSessao, type EstadoDoProtocolo,
  type Evento,
} from '@/core/cabo/protocolo';
import { ERROS_DA_PLACA, lerLinhaDaPlaca, normalizarMac } from '@/core/cabo/linhas';
import { crc32, crcEmHex } from '@/core/cabo/crc32';
import {
  estadoInicialPlacaNova, passoPlacaNova, type EventoPlacaNova,
} from '@/core/cabo/placaNova';

const ARQUIVO = Uint8Array.from([0xc0, 0x11, 0xd2, 0x6a, 0, 0, 0, 0]);
const CRC = crc32(ARQUIVO);
const FILE_INFO = `FILE_INFO:${ARQUIVO.length}:${crcEmHex(CRC)}`;

/** Um evento sem o `agora` (a conversa põe o dela). Distributivo sobre a união. */
type SemAgora = Evento extends infer E ? (E extends Evento ? Omit<E, 'agora'> : never) : never;

/** Dirige a máquina: cada evento, e devolve as ações do último passo. */
class Conversa {
  estado: EstadoDoProtocolo = estadoInicial();
  acoes: Acao[] = [];
  enviados: string[] = [];
  t = 1_000_000;

  dar(ev: SemAgora) {
    const r = passo(this.estado, { agora: this.t, ...ev } as Evento);
    this.estado = r.estado;
    this.acoes = r.acoes;
    for (const a of r.acoes) if (a.tipo === 'enviar') this.enviados.push(a.texto);
    return this;
  }
  linha(texto: string) { return this.dar({ tipo: 'linha', texto }); }
  /** Começa e deixa passar a escuta inicial: o primeiro HELLO sai. */
  abrir() {
    return this.dar({ tipo: 'comecar' }).andar(CONFIG_PADRAO.escutaInicialMs).dar({ tipo: 'prazo' });
  }
  andar(ms: number) { this.t += ms; return this; }
  get ultima(): Acao { return this.acoes[this.acoes.length - 1]; }
  get desfecho(): DesfechoDaSessao {
    const a = this.ultima;
    if (a.tipo !== 'terminar') throw new Error(`não terminou: ${a.tipo}`);
    return a.desfecho;
  }

  /** Até o ponto em que a máquina pede para gravar. */
  ateGravar(fileInfo = FILE_INFO, ready = 'READY') {
    this.abrir().linha('Handshake estabelecido!').linha(ready).linha(fileInfo);
    return this.dar({ tipo: 'bytes', dados: ARQUIVO });
  }
  /** Até o pedido de hora. */
  atePedirHora() {
    return this.ateGravar().dar({ tipo: 'gravou' }).linha('TRANSFER_OK').linha('REQUEST_TIMESTAMP');
  }
}

describe('caminho feliz', () => {
  it('HELLO → READY → GET_FILE → FILE_INFO → bytes → gravar → RECEIVED → … → SESSION_COMPLETE', () => {
    const c = new Conversa().dar({ tipo: 'comecar' });
    // Primeiro só escuta: placa nova toma a primeira linha como hora inicial.
    expect(c.acoes).toEqual([{ tipo: 'esperar-linha', ate: c.t + CONFIG_PADRAO.escutaInicialMs }]);
    c.linha('LittleFS iniciado com sucesso!');
    expect(c.enviados).toEqual([]);
    c.andar(CONFIG_PADRAO.escutaInicialMs).dar({ tipo: 'prazo' });
    expect(c.acoes).toEqual([
      { tipo: 'enviar', texto: 'HELLO\n' },
      { tipo: 'esperar-linha', ate: c.t + CONFIG_PADRAO.reenviarHelloMs },
    ]);
    c.linha('LittleFS iniciado com sucesso!').linha('READY');
    expect(c.enviados).toEqual(['HELLO\n', 'GET_FILE\n']);
    c.linha('Handshake estabelecido!');
    expect(c.ultima.tipo).toBe('esperar-linha');
    c.linha(FILE_INFO);
    expect(c.ultima).toEqual({ tipo: 'esperar-bytes', n: 8, silencioMs: CONFIG_PADRAO.silencioMaximoMs });
    c.dar({ tipo: 'bytes', dados: ARQUIVO });
    expect(c.ultima).toMatchObject({ tipo: 'gravar', arquivo: { tamanho: 8, crc: CRC, bytes: ARQUIVO } });
    // Nada foi confirmado antes da gravação.
    expect(c.enviados.some((t) => t.startsWith('RECEIVED'))).toBe(false);
    c.dar({ tipo: 'gravou' });
    expect(c.enviados[c.enviados.length - 1]).toBe(`RECEIVED:8:${crcEmHex(CRC)}\n`);
    c.linha('TRANSFER_OK').linha('REQUEST_TIMESTAMP');
    expect(c.ultima).toEqual({ tipo: 'decidir-hora' });
    c.dar({ tipo: 'hora', segundos: 1792500000 });
    expect(c.enviados[c.enviados.length - 1]).toBe('1792500000\n');
    c.linha('Timestamp recebido: 1792500000').linha('Novo arquivo de medicoes criado com sucesso!')
      .linha('SESSION_COMPLETE');
    expect(c.desfecho).toMatchObject({
      motivo: 'concluida', etapa: 'concluida', gravado: true, arquivoNaPlaca: 'apagou',
      horaEnviadaS: 1792500000, erroDaPlaca: null,
    });
  });

  it('READY com MAC e FILE_INFO com intervalo (pedidos 1 e 2)', () => {
    const c = new Conversa().ateGravar(`${FILE_INFO}:3600`, 'READY:aa-bb-cc-dd-ee-0f');
    expect(c.ultima).toMatchObject({ tipo: 'gravar', arquivo: { intervaloS: 3600, mac: 'AA:BB:CC:DD:EE:0F' } });
  });

  it('o CRC do RECEIVED vai com 8 dígitos maiúsculos', () => {
    const arquivo = Uint8Array.of(1);
    const crc = crc32(arquivo);
    const c = new Conversa().abrir().linha('READY')
      .linha(`FILE_INFO:1:${crc.toString(16)}`).dar({ tipo: 'bytes', dados: arquivo }).dar({ tipo: 'gravou' });
    expect(c.enviados[c.enviados.length - 1]).toBe(`RECEIVED:1:${crcEmHex(crc)}\n`);
    expect(crcEmHex(crc)).toMatch(/^[0-9A-F]{8}$/);
  });
});

describe('pontos de decisão', () => {
  it('nao-gravou: nenhum RECEIVED, nenhuma hora, a placa fica com o arquivo (FR-008)', () => {
    for (const motivo of ['banco', 'formato'] as const) {
      const c = new Conversa().ateGravar().dar({ tipo: 'nao-gravou', motivo });
      expect(c.desfecho).toMatchObject({
        motivo: motivo === 'banco' ? 'nao-gravou' : 'formato-desconhecido',
        gravado: false, arquivoNaPlaca: 'continua', etapa: 'gravacao',
      });
      expect(c.enviados).toEqual(['HELLO\n', 'GET_FILE\n']);
    }
  });

  it('hora implausível: não manda nada, a placa fica com o arquivo (FR-010)', () => {
    const c = new Conversa().atePedirHora().dar({ tipo: 'hora', segundos: null });
    expect(c.desfecho).toMatchObject({ motivo: 'hora-nao-enviada', gravado: true, arquivoNaPlaca: 'continua' });
    expect(c.enviados.filter((t) => /^\d+\n$/.test(t))).toEqual([]);
  });

  it('CRC diferente: avisa a placa, nada gravado (FR-004)', () => {
    const c = new Conversa().abrir().linha('READY').linha(FILE_INFO)
      .dar({ tipo: 'bytes', dados: Uint8Array.from([...ARQUIVO.subarray(0, 7), 0x01]) });
    expect(c.acoes.some((a) => a.tipo === 'gravar')).toBe(false);
    expect(c.enviados[c.enviados.length - 1]).toBe('ERROR:CHECKSUM_MISMATCH\n');
    expect(c.desfecho).toMatchObject({ motivo: 'crc-diferente', gravado: false, arquivoNaPlaca: 'continua' });
  });

  it('INV-504: em nenhum fim a placa pode ter apagado sem a sessão ter gravado', () => {
    const fins: DesfechoDaSessao[] = [];
    const prazo = (c: Conversa) => c.andar(60_000).dar({ tipo: 'prazo' }).desfecho;
    const caiu = (c: Conversa) => c.dar({ tipo: 'caiu' }).desfecho;
    for (const fim of [prazo, caiu]) {
      fins.push(fim(new Conversa().abrir()));
      fins.push(fim(new Conversa().abrir().linha('READY')));
      fins.push(fim(new Conversa().abrir().linha('READY').linha(FILE_INFO)));
      fins.push(fim(new Conversa().ateGravar().dar({ tipo: 'gravou' })));
      fins.push(fim(new Conversa().ateGravar().dar({ tipo: 'gravou' }).linha('TRANSFER_OK')));
      fins.push(fim(new Conversa().atePedirHora().dar({ tipo: 'hora', segundos: 1 })));
    }
    for (const codigo of ERROS_DA_PLACA) {
      fins.push(new Conversa().abrir().linha(`ERROR:${codigo}`).desfecho);
      fins.push(new Conversa().ateGravar().dar({ tipo: 'gravou' }).linha(`ERROR:${codigo}`).desfecho);
      fins.push(new Conversa().atePedirHora().dar({ tipo: 'hora', segundos: 1 }).linha(`ERROR:${codigo}`).desfecho);
    }
    for (const f of fins) {
      if (f.arquivoNaPlaca === 'apagou' || f.arquivoNaPlaca === 'nao-se-sabe') {
        expect(f.gravado).toBe(true);
        expect(f.horaEnviadaS).not.toBeNull();
      }
    }
    expect(fins.some((f) => f.arquivoNaPlaca === 'nao-se-sabe')).toBe(true);
  });
});

describe('prazos e reenvio do HELLO (FR-005, D-506)', () => {
  it('sem READY, reenvia HELLO a cada 4 s e desiste em 30 s', () => {
    const c = new Conversa().abrir();
    for (let i = 0; i < 7; i++) c.andar(4_000).dar({ tipo: 'prazo' });
    expect(c.enviados.filter((t) => t === 'HELLO\n')).toHaveLength(8);
    c.andar(2_000).dar({ tipo: 'prazo' });
    expect(c.desfecho).toMatchObject({ motivo: 'placa-nao-respondeu', etapa: 'handshake', arquivoNaPlaca: 'continua' });
  });

  it('a espera do READY nunca passa do limite de 30 s, contados do começo', () => {
    const c = new Conversa();
    const inicio = c.t;
    c.abrir().andar(28_000).dar({ tipo: 'prazo' });
    const a = c.ultima;
    expect(a.tipo === 'esperar-linha' && a.ate).toBe(inicio + 30_000);
  });

  it('diagnóstico não conta como resposta, e não muda o prazo da resposta', () => {
    const c = new Conversa().abrir().linha('READY');
    const a = c.ultima;
    const ate = a.tipo === 'esperar-linha' ? a.ate : 0;
    c.andar(3_000).linha('Handshake estabelecido!');
    expect(c.ultima).toEqual({ tipo: 'esperar-linha', ate });
  });

  it('cada resposta tem 10 s; o binário, 5 s de silêncio', () => {
    expect(new Conversa().abrir().linha('READY').andar(10_000).dar({ tipo: 'prazo' }).desfecho)
      .toMatchObject({ motivo: 'sem-resposta', etapa: 'pedido' });
    expect(new Conversa().abrir().linha('READY').linha(FILE_INFO).dar({ tipo: 'prazo' }).desfecho)
      .toMatchObject({ motivo: 'sem-resposta', etapa: 'arquivo', gravado: false });
    const depois = new Conversa().atePedirHora().dar({ tipo: 'hora', segundos: 5 }).dar({ tipo: 'prazo' }).desfecho;
    expect(depois).toMatchObject({ motivo: 'sem-resposta', etapa: 'hora', arquivoNaPlaca: 'nao-se-sabe' });
  });

  it('cabo puxado em cada etapa', () => {
    expect(new Conversa().abrir().dar({ tipo: 'caiu' }).desfecho)
      .toMatchObject({ motivo: 'conexao-caiu', etapa: 'handshake', arquivoNaPlaca: 'continua' });
    expect(new Conversa().abrir().linha('READY').linha(FILE_INFO).dar({ tipo: 'caiu' }).desfecho)
      .toMatchObject({ motivo: 'conexao-caiu', etapa: 'arquivo', gravado: false });
    expect(new Conversa().ateGravar().dar({ tipo: 'gravou' }).dar({ tipo: 'caiu' }).desfecho)
      .toMatchObject({ motivo: 'conexao-caiu', etapa: 'confirmacao', gravado: true, arquivoNaPlaca: 'continua' });
  });
});

describe('cada ERROR:* da placa e o que se sabe do arquivo (D-514)', () => {
  const depoisDaHora = (codigo: string) =>
    new Conversa().atePedirHora().dar({ tipo: 'hora', segundos: 7 }).linha(`ERROR:${codigo}`).desfecho;

  it('antes da hora, o arquivo continua (ou não existe)', () => {
    for (const codigo of ['BAD_COMMAND', 'FILE_OPEN_FAILED', 'FILE_SEEK_FAILED']) {
      expect(new Conversa().abrir().linha('READY').linha(`ERROR:${codigo}`).desfecho)
        .toMatchObject({ motivo: 'erro-da-placa', erroDaPlaca: codigo, arquivoNaPlaca: 'continua', gravado: false });
    }
    expect(new Conversa().abrir().linha('READY').linha('ERROR:NO_FILE').desfecho)
      .toMatchObject({ erroDaPlaca: 'NO_FILE', arquivoNaPlaca: 'sem-arquivo' });
    for (const codigo of ['SIZE_MISMATCH', 'BAD_CONFIRMATION']) {
      expect(new Conversa().ateGravar().dar({ tipo: 'gravou' }).linha(`ERROR:${codigo}`).desfecho)
        .toMatchObject({ erroDaPlaca: codigo, arquivoNaPlaca: 'continua', gravado: true });
    }
  });

  it('depois da hora: mantém, apaga, perde, ou não se sabe', () => {
    for (const codigo of ['TIMESTAMP_TIMEOUT', 'TIMESTAMP_EMPTY', 'INVALID_TIMESTAMP', 'REMOVE_TEMP_FAILED',
      'TEMP_OPEN_FAILED', 'TEMP_WRITE_FAILED', 'TEMP_VERIFY_OPEN_FAILED', 'TEMP_VERIFY_FAILED',
      'REMOVE_BACKUP_FAILED', 'OLD_FILE_RENAME_FAILED', 'NEW_FILE_RENAME_FAILED']) {
      expect(depoisDaHora(codigo)).toMatchObject({ motivo: 'erro-da-placa', erroDaPlaca: codigo, arquivoNaPlaca: 'continua' });
    }
    expect(depoisDaHora('BACKUP_CLEANUP_FAILED')).toMatchObject({ motivo: 'concluida-com-aviso', arquivoNaPlaca: 'apagou' });
    expect(depoisDaHora('FILE_RESTORE_FAILED')).toMatchObject({ motivo: 'erro-da-placa', arquivoNaPlaca: 'sem-arquivo' });
    expect(depoisDaHora('COISA_NOVA')).toMatchObject({ erroDaPlaca: 'desconhecido', arquivoNaPlaca: 'nao-se-sabe' });
  });
});

describe('protocolo desconhecido nunca é "tentado" (FR-003)', () => {
  it('linha que parece protocolo e não casa', () => {
    for (const ruim of ['FILE_INFO:abc:12', 'FILE_INFO:8', 'FILE_INFO:8:ZZ', 'FILE_INFO:8:12:0', 'FILE_INFO:8:123456789']) {
      expect(new Conversa().abrir().linha('READY').linha(ruim).desfecho)
        .toMatchObject({ motivo: 'protocolo-desconhecido', gravado: false });
    }
    expect(new Conversa().abrir().linha('READY:12').desfecho.motivo).toBe('protocolo-desconhecido');
  });

  it('ordem inesperada', () => {
    expect(new Conversa().ateGravar().dar({ tipo: 'gravou' }).linha('REQUEST_TIMESTAMP').desfecho)
      .toMatchObject({ motivo: 'protocolo-desconhecido', arquivoNaPlaca: 'continua' });
    expect(new Conversa().abrir().linha('TRANSFER_OK').desfecho.motivo).toBe('protocolo-desconhecido');
  });

  it('arquivo anunciado maior que o teto', () => {
    const c = new Conversa().abrir().linha('READY').linha(`FILE_INFO:${9 * 1024 * 1024}:00000000`);
    expect(c.desfecho.motivo).toBe('protocolo-desconhecido');
  });
});

describe('placa nova vista na coleta normal (FR-025)', () => {
  it('vista na escuta inicial: nenhum HELLO sai, a placa fica intacta', () => {
    const c = new Conversa().dar({ tipo: 'comecar' }).linha('Measurement file does not exist.');
    expect(c.desfecho).toMatchObject({ motivo: 'placa-nova', arquivoNaPlaca: 'sem-arquivo', tomouHelloComoHora: false });
    expect(c.enviados).toEqual([]);
  });

  it('vista depois do HELLO: não manda outro, e espera para ver se ela o tomou', () => {
    const c = new Conversa().abrir().linha('Aguardando timestamp inicial do dispositivo...');
    expect(c.ultima.tipo).toBe('esperar-linha');
    c.linha('Timestamp inicial recebido: 0');
    expect(c.desfecho).toMatchObject({ motivo: 'placa-nova', tomouHelloComoHora: true, arquivoNaPlaca: 'continua' });
    expect(c.enviados).toEqual(['HELLO\n']);
    // Sem a confirmação, em 2 s: não se sabe se tomou, e nenhum HELLO a mais.
    const d = new Conversa().abrir().linha('Measurement file does not exist.').andar(2_000).dar({ tipo: 'prazo' });
    expect(d.desfecho).toMatchObject({ motivo: 'placa-nova', tomouHelloComoHora: null });
    expect(d.enviados).toEqual(['HELLO\n']);
  });

  it('"Aguardando handshake USB..." na escuta: manda HELLO na hora, sem esperar o fim da escuta', () => {
    const c = new Conversa().dar({ tipo: 'comecar' }).linha('Aguardando handshake USB...');
    expect(c.enviados).toEqual(['HELLO\n']);
  });

  it('a placa tomou o HELLO como hora inicial', () => {
    const c = new Conversa().abrir().linha('Timestamp inicial recebido: 0');
    expect(c.desfecho).toMatchObject({ motivo: 'placa-nova', tomouHelloComoHora: true });
  });

  it('"Timeout aguardando handshake." encerra sem esperar mais', () => {
    expect(new Conversa().abrir().linha('Timeout aguardando handshake.').desfecho.motivo)
      .toBe('placa-nao-respondeu');
  });
});

describe('linhas da placa', () => {
  it('MAC normalizado; protocolo exato; diagnóstico com pista', () => {
    expect(normalizarMac('aa:bb:cc:dd:ee:ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizarMac('aa:bb:cc:dd:ee')).toBeNull();
    expect(lerLinhaDaPlaca('  READY\r')).toEqual({ tipo: 'ready', mac: null });
    expect(lerLinhaDaPlaca('FILE_INFO:1368:0A1B2C3D')).toEqual({ tipo: 'file-info', tamanho: 1368, crc: 0x0a1b2c3d, intervaloS: null });
    expect(lerLinhaDaPlaca('ERROR:BAD_COMMAND')).toMatchObject({ tipo: 'erro', codigo: 'BAD_COMMAND' });
    expect(lerLinhaDaPlaca('ERROR!')).toMatchObject({ tipo: 'ilegivel' });
    expect(lerLinhaDaPlaca('ERRO: Falha ao iniciar LittleFS!')).toMatchObject({ tipo: 'diagnostico', pista: null });
    expect(lerLinhaDaPlaca('Wake-up causado motivo desconhecido.')).toMatchObject({ pista: 'acordou-sem-botao' });
    expect(lerLinhaDaPlaca('Timestamp inicial recebido: 1792152000')).toMatchObject({ pista: 'hora-inicial-recebida', numero: 1792152000 });
    expect(lerLinhaDaPlaca('READYING')).toMatchObject({ tipo: 'diagnostico' });
  });
});

describe('configurar placa nova (US5)', () => {
  const dirigir = (linhas: Array<string | 'prazo'>) => {
    let e = estadoInicialPlacaNova();
    let t = 0;
    let r = passoPlacaNova(e, { tipo: 'comecar', segundos: 1792152000, agora: t });
    const enviados = r.acoes.filter((a) => a.tipo === 'enviar').map((a) => (a as { texto: string }).texto);
    e = r.estado;
    for (const l of linhas) {
      t += 1000;
      const ev: EventoPlacaNova = l === 'prazo' ? { tipo: 'prazo', agora: t } : { tipo: 'linha', texto: l, agora: t };
      r = passoPlacaNova(e, ev);
      e = r.estado;
      for (const a of r.acoes) if (a.tipo === 'enviar') enviados.push(a.texto);
    }
    const fim = r.acoes.find((a) => a.tipo === 'terminar');
    return { enviados, desfecho: fim && fim.tipo === 'terminar' ? fim.desfecho : null };
  };

  it('manda só os dígitos com LF e confirma pelo diagnóstico', () => {
    const r = dirigir(['Timestamp inicial recebido: 1792152000', 'Primeiro boot configurado!',
      'Timestamp inicial salvo com sucesso!']);
    expect(r.enviados).toEqual(['1792152000\n']);
    expect(r.desfecho).toEqual({ resultado: 'confirmada', horaEnviadaS: 1792152000, horaRecebidaS: 1792152000 });
  });

  it('sem confirmação, prova com HELLO: READY = já estava configurada', () => {
    const r = dirigir(['prazo', 'READY']);
    expect(r.enviados).toEqual(['1792152000\n', 'HELLO\n']);
    expect(r.desfecho?.resultado).toBe('ja-configurada');
    expect(dirigir(['prazo', 'prazo']).desfecho?.resultado).toBe('sem-confirmacao');
    expect(dirigir(['Aguardando handshake USB...']).desfecho?.resultado).toBe('ja-configurada');
    expect(dirigir(['ERRO: Falha ao salvar o timestamp inicial!']).desfecho?.resultado).toBe('placa-nao-salvou');
  });
});
