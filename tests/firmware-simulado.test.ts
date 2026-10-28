/**
 * A placa simulada é fiel ao teste_de_firmware.ino (commits e93f8ad e 4cc7ed8)?
 * Estes testes falam com ela "na mão", linha a linha, sem a máquina de estados
 * do app, e conferem o que o código do firmware faria. E depois a conversa do
 * app (máquina + executor) contra ela, sem banco, com o firmware atual.
 */
import { describe, expect, it } from 'vitest';
import {
  FIRMWARE_ATUAL, PlacaSimulada, TEMPOS_DE_TESTE, arquivoDaPlaca, macSimulado, strtoul,
  type OpcoesPlacaSimulada,
} from '@/transports/mock/firmware';
import { crc32, crcEmHex } from '@/core/cabo/crc32';
import { executarSessao, executarPlacaNova } from '@/core/cabo/sessao';
import { lerArquivo } from '@/core/decode/arquivo';
import type { CanalSerial } from '@/core/ports/canal';

const T0 = 1792152000;
/** A placa do firmware atual (4cc7ed8): MAC na frente, 26 + 16 × 5 = 106 bytes. */
const placa = (o: OpcoesPlacaSimulada = {}) =>
  new PlacaSimulada({ arquivo: arquivoDaPlaca(T0, 5), tempos: TEMPOS_DE_TESTE, ...o });
/** A placa do firmware de 2026-10-21 (e93f8ad): 8 + 16 × 5 = 88 bytes. */
const placaE93 = (o: OpcoesPlacaSimulada = {}) =>
  new PlacaSimulada({
    firmware: 'e93f8ad', arquivo: arquivoDaPlaca(T0, 5, 1, 'e93f8ad'), tempos: TEMPOS_DE_TESTE, ...o,
  });

/** Lê linhas até achar `alvo` (ou o prazo). Devolve as linhas vistas. */
async function ateAchar(canal: CanalSerial, alvo: (l: string) => boolean, prazo = 300): Promise<string[]> {
  const vistas: string[] = [];
  for (;;) {
    const l = await canal.lerLinha(prazo);
    vistas.push(l);
    if (alvo(l)) return vistas;
  }
}

/** HELLO, READY, GET_FILE: devolve a linha FILE_INFO. */
async function pedirArquivo(canal: CanalSerial): Promise<string> {
  await canal.escrever('HELLO\n');
  await ateAchar(canal, (l) => l === 'READY');
  await canal.escrever('GET_FILE\n');
  return (await ateAchar(canal, (l) => l.startsWith('FILE_INFO'))).pop()!;
}

describe('placa simulada: fidelidade ao .ino de e93f8ad', () => {
  it('boot pelo botão: diagnósticos na mesma serial, na ordem do código', async () => {
    const p = placaE93();
    const { canal, terminou } = p.acordar('botao');
    const vistas = await ateAchar(canal, (l) => l === 'Aguardando handshake USB...');
    expect(vistas).toEqual([
      'LittleFS iniciado com sucesso!', 'Measurement file exists.', '', '------------------',
      'Wake-up causado pelo GPIO.', 'Aguardando handshake USB...',
    ]);
    await terminou;
  });

  it('ignora linha que não é HELLO; READY e "Handshake estabelecido!"; FILE_INFO com %08lX e \\n', async () => {
    const p = placaE93();
    const { canal, terminou } = p.acordar('botao');
    await ateAchar(canal, (l) => l.startsWith('Aguardando handshake'));
    await canal.escrever('OI\nHELLO\r\n');
    expect(await canal.lerLinha(300)).toBe('READY');
    expect(await canal.lerLinha(300)).toBe('Handshake estabelecido!');
    await canal.escrever('GET_FILE\n');
    const info = await canal.lerLinha(300);
    expect(info).toBe(`FILE_INFO:88:${crcEmHex(crc32(p.arquivo!))}`);
    const bytes = await canal.lerBytes(88, 300);
    expect(bytes).toEqual(p.arquivo);
    // Minúsculas são aceitas no RECEIVED (strtoul base 16).
    await canal.escrever(`RECEIVED:88:${crcEmHex(crc32(bytes)).toLowerCase()}\n`);
    expect(await canal.lerLinha(300)).toBe('TRANSFER_OK');
    expect(await canal.lerLinha(300)).toBe('REQUEST_TIMESTAMP');
    await canal.escrever('1792500000\n');
    expect(await ateAchar(canal, (l) => l === 'SESSION_COMPLETE')).toEqual([
      'Timestamp recebido: 1792500000', 'Novo arquivo de medicoes criado com sucesso!', 'SESSION_COMPLETE',
    ]);
    await terminou;
    // Depois da conversa, com sucesso: o arquivo recomeçou com a hora e a placa mediu (id 0).
    expect(p.inicioS).toBe(1792500000);
    expect(p.medicoes).toBe(1);
    expect(p.impresso).toContain('Medida salva com ID: 0\r\n');
  });

  it('botão apertado sem coleta: desiste em 30 s e mede fora do ritmo (id seguido)', async () => {
    const p = placaE93();
    const { canal, terminou } = p.acordar('botao');
    await terminou;
    expect(p.impresso).toContain('Timeout aguardando handshake.\r\n');
    expect(p.impresso).toContain('ERRO: Falha na transferencia de arquivo.\r\n');
    expect(p.medicoes).toBe(6);
    expect(p.inicioS).toBe(T0);
    await expect(canal.escrever('HELLO\n')).rejects.toMatchObject({ code: 'connection-lost' });
  });

  it('falta de energia: ao religar mede na hora, com id seguido; o buraco não fica em lugar nenhum', async () => {
    const p = placaE93();
    await p.acordar('desconhecida').terminou;
    expect(p.impresso).toContain('Wake-up causado motivo desconhecido.\r\n');
    const a = lerArquivo('arquivo-0', p.arquivo!);
    expect(a.medicoes.map((m) => m.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('readProtocolLine: 128 caracteres sem fim de linha → ERROR:BAD_COMMAND', async () => {
    const p = placaE93();
    const { canal, terminou } = p.acordar('botao');
    await ateAchar(canal, (l) => l.startsWith('Aguardando handshake'));
    await canal.escrever('HELLO\n');
    await ateAchar(canal, (l) => l === 'Handshake estabelecido!');
    await canal.escrever(`${'X'.repeat(130)}\n`);
    expect(await ateAchar(canal, (l) => l.startsWith('ERROR:'))).toContain('ERROR:BAD_COMMAND');
    await terminou;
  });

  it('dois HELLO: o segundo vira o pedido de arquivo e dá ERROR:BAD_COMMAND (D-506)', async () => {
    const p = placaE93();
    const { canal, terminou } = p.acordar('botao');
    await canal.escrever('HELLO\nHELLO\n');
    expect(await ateAchar(canal, (l) => l.startsWith('ERROR:'))).toContain('ERROR:BAD_COMMAND');
    await terminou;
  });

  it('RECEIVED com tamanho errado → SIZE_MISMATCH; sem ":" → BAD_CONFIRMATION; CHECKSUM_MISMATCH → sem resposta', async () => {
    for (const [linha, esperado] of [
      ['RECEIVED:87:00000000', 'ERROR:SIZE_MISMATCH'],
      ['RECEIVED:88', 'ERROR:BAD_CONFIRMATION'],
      ['RECEIVED:88:DEADBEEF', 'ERROR:BAD_CONFIRMATION'],
      ['OK', 'ERROR:BAD_CONFIRMATION'],
    ] as const) {
      const p = placaE93();
      const { canal, terminou } = p.acordar('botao');
      await pedirArquivo(canal);
      await canal.lerBytes(88, 300);
      await canal.escrever(`${linha}\n`);
      expect(await ateAchar(canal, (l) => l.startsWith('ERROR:'))).toContain(esperado);
      await terminou;
      expect(p.inicioS).toBe(T0); // não apagou
    }
    const p = placaE93();
    const { canal, terminou } = p.acordar('botao');
    await pedirArquivo(canal);
    await canal.lerBytes(88, 300);
    await canal.escrever('ERROR:CHECKSUM_MISMATCH\n');
    const resto = await ateAchar(canal, (l) => l.startsWith('Entrando'), 300);
    expect(resto.some((l) => l.startsWith('ERROR:'))).toBe(false);
    await terminou;
  });

  it('hora com letra → INVALID_TIMESTAMP; sem hora → TIMESTAMP_TIMEOUT; o arquivo fica', async () => {
    for (const [hora, esperado] of [['17925x', 'ERROR:INVALID_TIMESTAMP'], [null, 'ERROR:TIMESTAMP_TIMEOUT']] as const) {
      const p = placaE93();
      const { canal, terminou } = p.acordar('botao');
      const info = await pedirArquivo(canal);
      const bytes = await canal.lerBytes(88, 300);
      await canal.escrever(`RECEIVED:88:${crcEmHex(crc32(bytes))}\n`);
      await ateAchar(canal, (l) => l === 'REQUEST_TIMESTAMP');
      if (hora !== null) await canal.escrever(`${hora}\n`);
      expect(await ateAchar(canal, (l) => l.startsWith('ERROR:'), 1000)).toContain(esperado);
      await terminou;
      expect(info).toMatch(/^FILE_INFO:88:/);
      expect(p.inicioS).toBe(T0);
      expect(p.medicoes).toBe(6);
    }
  });

  it('primeiro boot: espera a hora sem conversa; HELLO vira data 0', async () => {
    const p = new PlacaSimulada({ firmware: 'e93f8ad', arquivo: null, tempos: TEMPOS_DE_TESTE });
    const { canal, terminou } = p.acordar('desconhecida');
    expect(await ateAchar(canal, (l) => l.startsWith('Aguardando timestamp'))).toContain('Measurement file does not exist.');
    await canal.escrever('HELLO\n');
    const vistas = await ateAchar(canal, (l) => l === 'Timestamp inicial salvo com sucesso!');
    expect(vistas).toEqual(['Timestamp inicial recebido: 0', 'Primeiro boot configurado!', 'Timestamp inicial: 0',
      'Timestamp inicial salvo com sucesso!']);
    await terminou;
    expect(p.inicioS).toBe(0);
    expect(p.medicoes).toBe(1);
  });

  it('strtoul como a libc', () => {
    expect(strtoul(' 88', 10)).toEqual({ valor: 88, consumiuTudo: true });
    expect(strtoul('0x1A', 16)).toEqual({ valor: 26, consumiuTudo: true });
    expect(strtoul('88 ', 10)).toEqual({ valor: 88, consumiuTudo: false });
    expect(strtoul('abc', 10)).toEqual({ valor: 0, consumiuTudo: false });
    expect(strtoul('99999999999', 10).valor).toBe(0xffffffff);
    expect(strtoul('HELLO', 10, 64).valor).toBe(0);
  });
});

describe('placa simulada: fidelidade ao .ino de 4cc7ed8 (o atual)', () => {
  it('é o firmware que a placa simulada imita por padrão', () => {
    expect(FIRMWARE_ATUAL).toBe('4cc7ed8');
    expect(new PlacaSimulada({ tempos: TEMPOS_DE_TESTE }).formato).toBe('arquivo-1');
  });

  it('o arquivo começa com o MAC em texto, o 0x00 e a hora; FILE_INFO conta os 26 bytes', async () => {
    const p = placa();
    const a = p.arquivo!;
    expect(new TextDecoder().decode(a.subarray(0, 17))).toBe(macSimulado(1));
    expect(a[17]).toBe(0);
    expect(new DataView(a.buffer, a.byteOffset).getUint32(18, true)).toBe(T0);
    const { canal, terminou } = p.acordar('botao');
    const info = await pedirArquivo(canal);
    expect(info).toBe(`FILE_INFO:106:${crcEmHex(crc32(a))}`);
    const bytes = await canal.lerBytes(106, 300);
    expect(bytes).toEqual(a);
    await canal.escrever(`RECEIVED:106:${crcEmHex(crc32(bytes))}\n`);
    expect(await canal.lerLinha(300)).toBe('TRANSFER_OK');
    expect(await canal.lerLinha(300)).toBe('REQUEST_TIMESTAMP');
    await canal.escrever('1792500000\n');
    expect(await ateAchar(canal, (l) => l === 'SESSION_COMPLETE')).toEqual([
      'Timestamp recebido: 1792500000', `MAC da placa: ${macSimulado(1)}`,
      'Novo arquivo criado com MAC e timestamp!', 'SESSION_COMPLETE',
    ]);
    await terminou;
    expect(p.inicioS).toBe(1792500000);
    expect(p.medicoes).toBe(1);
  });

  it('getNextMeasurementId não desconta o MAC: a primeira medição do arquivo novo tem o número 1', async () => {
    const p = placa({ arquivo: arquivoDaPlaca(T0, 0) });
    await p.acordar('temporizador').terminou;
    await p.acordar('temporizador').terminou;
    expect(p.impresso).toContain('Medida salva com ID: 1\r\n');
    expect(p.impresso).toContain('Medida salva com ID: 2\r\n');
    const a = lerArquivo('arquivo-1', p.arquivo!);
    expect(a.medicoes.map((m) => m.id)).toEqual([1, 2]);
    expect(a.numeracaoComecaEm).toBe(1);
    expect(a.leituras.map((l) => l.tNode)).toEqual([0, 1]);
    expect(a.mac).toBe(macSimulado(1));
  });

  it('primeiro boot: grava o MAC e a hora; a confirmação mudou de texto', async () => {
    const p = new PlacaSimulada({ arquivo: null, tempos: TEMPOS_DE_TESTE, semente: 7 });
    const { canal, terminou } = p.acordar('desconhecida');
    await ateAchar(canal, (l) => l.startsWith('Aguardando timestamp'));
    await canal.escrever('1792152000\n');
    const vistas = await ateAchar(canal, (l) => l.startsWith('MAC e timestamp'));
    expect(vistas).toEqual(['Timestamp inicial recebido: 1792152000', 'Primeiro boot configurado!',
      'Timestamp inicial: 1792152000', `MAC da placa: ${macSimulado(7)}`, 'MAC e timestamp inicial salvos com sucesso!']);
    await terminou;
    expect(p.inicioS).toBe(1792152000);
    expect(lerArquivo('arquivo-1', p.arquivo!).medicoes.map((m) => m.id)).toEqual([1]);
  });

  it('primeiro boot sem conseguir ler o MAC: ERROR:MAC_READ_FAILED e um arquivo VAZIO fica para trás', async () => {
    const p = new PlacaSimulada({ arquivo: null, tempos: TEMPOS_DE_TESTE, falhas: { macIlegivel: true } });
    const { canal, terminou } = p.acordar('desconhecida');
    await ateAchar(canal, (l) => l.startsWith('Aguardando timestamp'));
    await canal.escrever('1792152000\n');
    expect(await ateAchar(canal, (l) => l.startsWith('ERRO: Falha ao salvar'))).toContain('ERROR:MAC_READ_FAILED');
    await terminou;
    // saveInitialTimestamp abriu o arquivo antes de ler o MAC: ele existe, vazio, e a medição não consegue o número.
    expect(p.impresso).toContain('ERRO: nao foi possivel ler o ultimo Measurement!\r\n');
    expect(p.inicioS).toBeNull();
  });

  it('troca do arquivo sem o MAC: ERROR:MAC_READ_FAILED e o arquivo antigo fica', async () => {
    for (const falhas of [{ macIlegivel: true }, { erroNaTroca: 'TEMP_MAC_WRITE_FAILED' as const }]) {
      const p = placa({ falhas });
      const { canal, terminou } = p.acordar('botao');
      await pedirArquivo(canal);
      const bytes = await canal.lerBytes(106, 300);
      await canal.escrever(`RECEIVED:106:${crcEmHex(crc32(bytes))}\n`);
      await ateAchar(canal, (l) => l === 'REQUEST_TIMESTAMP');
      await canal.escrever('1792500000\n');
      const esperado = falhas.macIlegivel ? 'ERROR:MAC_READ_FAILED' : 'ERROR:TEMP_MAC_WRITE_FAILED';
      expect(await ateAchar(canal, (l) => l.startsWith('ERROR:'), 1000)).toContain(esperado);
      await terminou;
      expect(p.inicioS).toBe(T0);
      expect(p.medicoes).toBe(6);
    }
  });

  it('o arquivo de e93f8ad não é lido como o atual (o tamanho não fecha)', () => {
    expect(() => lerArquivo('arquivo-1', arquivoDaPlaca(T0, 5, 1, 'e93f8ad'))).toThrow(/tamanho-nao-multiplo/);
  });
});

describe('a conversa do app contra a placa simulada (sem banco)', () => {
  const gravarSempre = { gravar: async () => ({ ok: true as const }), horaParaEnviar: () => 1792600000 };
  const CONFIG = { esperaPelaPlacaMs: 600, reenviarHelloMs: 150, prazoRespostaMs: 300, silencioMaximoMs: 200 };

  it('completa: o arquivo chega inteiro, a placa recomeça com a hora enviada', async () => {
    const p = placa({ arquivo: arquivoDaPlaca(T0, 300) });
    const original = p.arquivo!.slice();
    const { canal, terminou } = p.acordar('botao');
    let recebido: Uint8Array | null = null;
    const r = await executarSessao(canal, {
      gravar: async (a) => { recebido = a.bytes; return { ok: true }; },
      horaParaEnviar: () => 1792600000,
    }, { config: CONFIG });
    await canal.fechar();
    await terminou;
    expect(r.desfecho).toMatchObject({ motivo: 'concluida', arquivoNaPlaca: 'apagou', gravado: true });
    expect(recebido).toEqual(original);
    expect(r.bruto).toEqual(original);
    expect(p.inicioS).toBe(1792600000);
    expect(r.registro).toContain('→ HELLO');
    expect(r.registro).toContain('← READY');
    // 26 de cabeçalho (MAC e hora) + 300 × 16.
    expect(r.registro).toContain('[arquivo: 4826 bytes]');
  });

  it('o primeiro HELLO se perde (serial ainda não ouvia) e o reenvio resolve', async () => {
    const p = placa({ falhas: { ouveDepoisDeMs: 100 } });
    const { canal, terminou } = p.acordar('botao');
    const r = await executarSessao(canal, gravarSempre, { config: CONFIG });
    await terminou;
    expect(r.desfecho.motivo).toBe('concluida');
    expect(r.registro.match(/→ HELLO/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('configurar placa nova: a hora enviada vira o início do arquivo', async () => {
    const p = new PlacaSimulada({ arquivo: null, tempos: TEMPOS_DE_TESTE });
    const { canal, terminou } = p.acordar('desconhecida');
    const r = await executarPlacaNova(canal, 1792152000, { config: { escutaMs: 300, provaMs: 200 } });
    await terminou;
    expect(r.desfecho.resultado).toBe('confirmada');
    expect(p.inicioS).toBe(1792152000);
  });

  it('configurar uma placa que já mede: "já estava configurada", e o arquivo não muda', async () => {
    const p = placa();
    const antes = p.arquivo!.slice();
    const { canal, terminou } = p.acordar('botao');
    // Ela já imprimiu "Aguardando handshake USB..." antes de a tela mandar a hora.
    const r = await executarPlacaNova(canal, 1792152000, { config: { escutaMs: 300, provaMs: 200 } });
    await terminou;
    expect(r.desfecho.resultado).toBe('ja-configurada');
    expect(p.arquivo!.subarray(0, antes.length)).toEqual(antes);
  });
});
