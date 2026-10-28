/**
 * Coleta pelo cabo de ponta a ponta (feature 005): placa simulada fiel ao .ino
 * → leitor de bytes → máquina de estados → executor → gravação (better-sqlite3)
 * → hora pela contagem. Cada caso confere o que o app DIZ sobre a placa contra
 * o que a placa simulada de fato ficou tendo.
 */
import { describe, expect, it } from 'vitest';
import { coletarPeloCabo } from '@/data/coletaCabo';
import {
  CHAVE_ULTIMA_COLMEIA_DO_CABO, contarLeituras, garantirApiario, garantirColmeia, lerConfig,
} from '@/data/repo';
import { montarAvisos, resumir } from '@/core/coleta/mensagens';
import type { ResultadoColeta } from '@/core/coleta/resultado';
import type { CanalSerial } from '@/core/ports/canal';
import { crc32, crcEmHex } from '@/core/cabo/crc32';
import { INICIO_DO_PROJETO_MS } from '@/core/relogio';
import {
  PlacaSimulada, TEMPOS_DE_TESTE, arquivoDaPlaca, macSimulado, type ErroDaTroca, type FalhasDaPlaca,
} from '@/transports/mock/firmware';
import type { SqlDb } from '@/data/types';
import { bancoDeTeste } from './apoio/banco';

const H = 3600;
const I = 2 * H;
/** 21/10/2026 12:00 UTC. */
const AGORA = Date.UTC(2026, 9, 21, 12);
const AGORA_S = AGORA / 1000;
/** Início do arquivo: 37 medições a cada 2 h, a última meia hora antes de AGORA. */
const T0 = AGORA_S - 36 * I - 1800;

const CONFIG = {
  escutaInicialMs: 30, esperaPelaPlacaMs: 600, reenviarHelloMs: 150, prazoRespostaMs: 250, silencioMaximoMs: 150,
};

function banco(): SqlDb {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap', 'Meliponário Serra Verde');
  garantirColmeia(db, 'h1', 'ap', 'Colmeia 07');
  garantirColmeia(db, 'h2', 'ap', 'Colmeia 03');
  return db;
}

function placa(n = 37, falhas: FalhasDaPlaca = {}, inicioS = T0): PlacaSimulada {
  return new PlacaSimulada({ arquivo: arquivoDaPlaca(inicioS, n), falhas, tempos: TEMPOS_DE_TESTE });
}

/** Uma placa do firmware atual com um MAC escolhido (o MAC vem dentro do arquivo). */
function placaComMac(mac: string, n = 37, inicioS = T0, falhas: FalhasDaPlaca = {}): PlacaSimulada {
  return new PlacaSimulada({
    arquivo: arquivoDaPlaca(inicioS, n, 1, '4cc7ed8', mac), mac, falhas, tempos: TEMPOS_DE_TESTE,
  });
}

interface Coleta {
  r: ResultadoColeta;
  enviados: string[];
}

/** O apicultor aperta o botão e toca em Coletar. */
async function coletar(
  db: SqlDb, p: PlacaSimulada, o: { agora?: number; hiveId?: string; canal?: (c: CanalSerial) => CanalSerial } = {},
): Promise<Coleta> {
  const { canal, terminou } = p.acordar('botao');
  const enviados: string[] = [];
  const espiao: CanalSerial = {
    ...canal,
    escrever: async (t) => { enviados.push(t); return canal.escrever(t); },
  };
  const r = await coletarPeloCabo(db, o.canal ? o.canal(espiao) : espiao, {
    hiveId: o.hiveId ?? 'h1', agora: () => o.agora ?? AGORA, config: CONFIG, src: 'mock',
  });
  await terminou;
  return { r, enviados };
}

const no = (c: Coleta) => c.r.nos[0];
const leituras = (db: SqlDb) => db.all('SELECT * FROM reading ORDER BY node_id, seq');
const horas = (db: SqlDb) => db.all<{ seq: number; t_utc_ms: number | null; t_quality: number; t_motivo: string }>(
  'SELECT seq, t_utc_ms, t_quality, t_motivo FROM leitura_hora ORDER BY seq');
const sessoes = (db: SqlDb) => db.all<Record<string, unknown>>('SELECT * FROM pull_session ORDER BY id');

describe('US1 — coletar sem perder nada', () => {
  it('caminho feliz: grava, confirma, a placa recomeça com a hora enviada', async () => {
    const db = banco();
    const p = placa();
    const original = p.arquivo!.slice();
    const c = await coletar(db, p);

    expect(no(c)).toMatchObject({ nome: 'Colmeia 07', inseridas: 37, recebidas: 37, problema: null, relogio: 'acertado', dias: 3 });
    expect(no(c).cabo?.desfecho).toMatchObject({ motivo: 'concluida', arquivoNaPlaca: 'apagou', gravado: true });
    // A placa de fato recomeçou: arquivo novo com a hora enviada, e a medição de depois da conversa.
    expect(p.inicioS).toBe(AGORA_S);
    expect(p.medicoes).toBe(1);
    expect(c.enviados).toEqual(['HELLO\n', 'GET_FILE\n', `RECEIVED:${original.length}:${crcEmHex(crc32(original))}\n`, `${AGORA_S}\n`]);

    // Hora: início + número × intervalo, estimada.
    const h = horas(db);
    expect(h).toHaveLength(37);
    h.forEach((l, id) => expect(l).toMatchObject({ t_utc_ms: (T0 + id * I) * 1000, t_quality: 2, t_motivo: 'contagem-conferida' }));

    // Sessão com o arquivo bruto inteiro e o registro da conversa (FR-007).
    const [s] = sessoes(db);
    expect(s).toMatchObject({ outcome: 'ok', formato: 'arquivo-1', proto_ver: 101, record_count: 37,
      fim_da_placa: 'apagou', hora_enviada_s: AGORA_S, crc32: crcEmHex(crc32(original)), src: 'mock' });
    expect(new Uint8Array(s.raw as Buffer)).toEqual(original);
    expect(String(s.registro)).toContain('→ RECEIVED:');
    // A placa numerou de 1 (4cc7ed8); a hora acima saiu da posição, e o registro diz isso.
    expect(String(s.registro)).toContain('numerou as medições a partir de 1');

    // O resultado fala como toda coleta.
    const resumo = resumir(c.r);
    expect(resumo).toMatchObject({ desfecho: 'sucesso', salvas: 37, relogiosAcertados: 0 });
    expect(resumo.notas[0]).toMatch(/recomeçou a contar/);
    expect(resumo.notas[1]).toMatch(/^Horas estimadas pela contagem da placa, de 18\/10\/2026/);
    expect(montarAvisos(c.r)).toEqual([]);
    // A escolha da colmeia fica para a próxima vez.
    expect(lerConfig(db, CHAVE_ULTIMA_COLMEIA_DO_CABO, '')).toBe('h1');
  });

  it('INV-503: o RECEIVED só sai depois do commit E do persist', async () => {
    const db = banco();
    const eventos: string[] = [];
    const persistir = db.persist.bind(db);
    db.persist = async () => { eventos.push(`persist:${contarLeituras(db)}`); await persistir(); };
    await coletar(db, placa(), {
      canal: (c) => ({ ...c, escrever: async (t) => { eventos.push(`enviar:${t.split(':')[0].trim()}`); return c.escrever(t); } }),
    });
    const iPersist = eventos.indexOf('persist:37');
    const iReceived = eventos.indexOf('enviar:RECEIVED');
    expect(iPersist).toBeGreaterThanOrEqual(0);
    expect(iReceived).toBeGreaterThan(iPersist);
    expect(eventos.slice(0, iReceived).filter((e) => e.startsWith('persist'))).toEqual(['persist:37']);
  });

  it('persist falhou: nada é confirmado e a placa fica com o arquivo (US1-4)', async () => {
    const db = banco();
    db.persist = async () => { throw new Error('cota do navegador'); };
    const p = placa();
    const c = await coletar(db, p);
    expect(c.enviados.some((t) => t.startsWith('RECEIVED'))).toBe(false);
    expect(no(c).problema).toBe('nao-salvou');
    expect(no(c).cabo?.desfecho).toMatchObject({ motivo: 'nao-gravou', arquivoNaPlaca: 'continua' });
    expect(p.inicioS).toBe(T0);
    expect(p.medicoes).toBe(38); // a placa desistiu, mediu e voltou a dormir
    const [aviso] = montarAvisos(c.r);
    expect(aviso.detalhe).toMatch(/A placa continua com todas as leituras: nada foi apagado dela/);
  });

  it('INV-501: o mesmo arquivo de novo não muda nada', async () => {
    const db = banco();
    const arquivo = arquivoDaPlaca(T0, 37);
    await coletar(db, new PlacaSimulada({ arquivo: arquivo.slice(), tempos: TEMPOS_DE_TESTE }));
    const antes = leituras(db);
    const horasAntes = horas(db);
    const c = await coletar(db, new PlacaSimulada({ arquivo: arquivo.slice(), tempos: TEMPOS_DE_TESTE }),
      { agora: AGORA + 60_000 });
    expect(no(c)).toMatchObject({ inseridas: 0, recebidas: 37, problema: null });
    expect(leituras(db)).toEqual(antes);
    expect(horas(db)).toEqual(horasAntes);
    expect(resumir(c.r).desfecho).toBe('sucesso');
  });

  it('INV-502 e US2-4: hora implausível não vai; a placa guarda; o arquivo maior só acrescenta', async () => {
    const db = banco();
    const p = placa();
    const antesDoProjeto = INICIO_DO_PROJETO_MS - 86400_000;
    const c1 = await coletar(db, p, { agora: antesDoProjeto });
    expect(no(c1)).toMatchObject({ inseridas: 37, problema: null, relogio: 'celular-suspeito' });
    expect(c1.enviados.some((t) => /^\d+\n$/.test(t))).toBe(false);
    expect(p.impresso).toContain('ERROR:TIMESTAMP_TIMEOUT\r\n');
    expect(p.inicioS).toBe(T0);
    expect(p.medicoes).toBe(38);
    // Sem conferência plausível, sem hora (D-507).
    expect(new Set(horas(db).map((l) => l.t_motivo))).toEqual(new Set(['contagem-sem-conferencia']));
    expect(montarAvisos(c1.r).map((a) => a.titulo)).toContain('A data ou a hora deste aparelho parece errada');
    const antes = leituras(db);

    // Duas horas depois, com o relógio certo: o mesmo arquivo, com uma medição a mais.
    const c2 = await coletar(db, p, { agora: AGORA + I * 1000 });
    expect(no(c2)).toMatchObject({ inseridas: 1, recebidas: 38, problema: null, relogio: 'acertado' });
    const depois = leituras(db);
    expect(depois.slice(0, 37)).toEqual(antes);
    expect(depois).toHaveLength(38);
    // E as mesmas leituras agora têm hora estimada, sem terem sido regravadas.
    expect(new Set(horas(db).map((l) => l.t_motivo))).toEqual(new Set(['contagem-conferida']));
    expect(p.inicioS).toBe(AGORA_S + I);
  });

  it('arquivo só com a hora de início: nada novo, e a placa recomeça', async () => {
    const db = banco();
    const p = placa(0);
    const c = await coletar(db, p);
    expect(no(c)).toMatchObject({ inseridas: 0, recebidas: 0, problema: null, relogio: 'acertado' });
    expect(resumir(c.r).desfecho).toBe('sucesso');
    expect(p.inicioS).toBe(AGORA_S);
  });
});

describe('US3 — cada falha diz o que aconteceu com a placa', () => {
  it('CRC errado: nada gravado, a placa recebe CHECKSUM_MISMATCH e fica com tudo', async () => {
    const db = banco();
    const p = placa(37, { crcErrado: true });
    const c = await coletar(db, p);
    expect(no(c).problema).toBe('dados-corrompidos');
    expect(c.enviados).toContain('ERROR:CHECKSUM_MISMATCH\n');
    expect(contarLeituras(db)).toBe(0);
    expect(p.inicioS).toBe(T0);
    // O que chegou fica guardado, mesmo com defeito.
    expect(sessoes(db)[0]).toMatchObject({ outcome: 'dados_corrompidos', fim_da_placa: 'continua' });
    expect((sessoes(db)[0].raw as Buffer).length).toBe(26 + 37 * 16);
  });

  it('cabo puxado no meio do arquivo: nada gravado, o pedaço que chegou fica guardado', async () => {
    const db = banco();
    const p = placa(37, { caboPuxadoAposBytes: 200 });
    const c = await coletar(db, p);
    expect(no(c).problema).toBe('conexao-caiu');
    expect(no(c).cabo?.desfecho).toMatchObject({ motivo: 'conexao-caiu', etapa: 'arquivo' });
    expect(contarLeituras(db)).toBe(0);
    expect((sessoes(db)[0].raw as Buffer).length).toBe(200);
    expect(montarAvisos(c.r)[0].detalhe).toMatch(/nada foi apagado da placa/);
    expect(p.inicioS).toBe(T0);
  });

  it('a placa voltou a dormir (não responde): pede o botão e os 30 s', async () => {
    const db = banco();
    const c = await coletar(db, placa(37, { travaEm: 'ready' }));
    expect(no(c).problema).toBe('nao-conectou');
    expect(montarAvisos(c.r)[0]).toMatchObject({
      titulo: 'A placa da Colmeia 07 não respondeu',
      detalhe: expect.stringMatching(/30 segundos/),
    });
    expect(resumir(c.r).sugereDiagnostico).toBe(false);
  });

  it('para de responder depois do READY: nada gravado', async () => {
    const db = banco();
    const c = await coletar(db, placa(37, { travaEm: 'file-info' }));
    expect(no(c).cabo?.desfecho).toMatchObject({ motivo: 'sem-resposta', etapa: 'pedido', gravado: false });
    expect(no(c).problema).toBe('conexao-caiu');
  });

  it('ERROR:NO_FILE e ERROR:FILE_OPEN_FAILED antes do arquivo', async () => {
    for (const [erro, titulo] of [['NO_FILE', 'A placa não tem leituras guardadas'],
      ['FILE_OPEN_FAILED', 'A placa não conseguiu ler as próprias leituras'],
      ['FILE_SEEK_FAILED', 'A placa não conseguiu ler as próprias leituras']] as const) {
      const db = banco();
      const c = await coletar(db, placa(37, { erroNoArquivo: erro }));
      expect(no(c).problema).toBe('placa-recusou');
      expect(montarAvisos(c.r)[0].titulo).toBe(titulo);
    }
  });

  it('cada erro na troca do arquivo: o que o app diz bate com o que a placa ficou tendo', async () => {
    const casos: Array<[ErroDaTroca, 'continua' | 'apagou' | 'sem-arquivo']> = [
      ['REMOVE_TEMP_FAILED', 'continua'], ['TEMP_OPEN_FAILED', 'continua'], ['TEMP_WRITE_FAILED', 'continua'],
      ['TEMP_VERIFY_OPEN_FAILED', 'continua'], ['TEMP_VERIFY_FAILED', 'continua'],
      ['REMOVE_BACKUP_FAILED', 'continua'], ['OLD_FILE_RENAME_FAILED', 'continua'],
      ['NEW_FILE_RENAME_FAILED', 'continua'], ['BACKUP_CLEANUP_FAILED', 'apagou'],
      ['FILE_RESTORE_FAILED', 'sem-arquivo'],
    ];
    for (const [erro, esperado] of casos) {
      const db = banco();
      const p = placa(37, { erroNaTroca: erro });
      const c = await coletar(db, p);
      const d = no(c).cabo!.desfecho;
      expect(d.arquivoNaPlaca, erro).toBe(esperado);
      expect(no(c).inseridas, erro).toBe(37); // as leituras estão salvas em todos
      // A verdade da placa simulada:
      if (esperado === 'continua') expect(p.inicioS, erro).toBe(T0);
      if (esperado === 'apagou') expect(p.inicioS, erro).toBe(AGORA_S);
      if (esperado === 'sem-arquivo') expect(p.arquivo, erro).toBeNull();
      // E o que a tela diz:
      const avisos = montarAvisos(c.r);
      if (esperado === 'continua') {
        expect(no(c).problema).toBeNull();
        expect(avisos.map((a) => a.titulo)).toContain('A placa ainda guarda as leituras desta coleta');
      }
      if (esperado === 'apagou') expect(no(c).problema).toBeNull();
      if (esperado === 'sem-arquivo') {
        expect(no(c).problema).toBe('placa-recusou');
        expect(avisos[0].titulo).toBe('A placa perdeu o arquivo depois da coleta');
      }
      expect(sessoes(db)[0].erro_da_placa).toBe(erro);
    }
  });

  it('a placa trava depois do RECEIVED: leituras salvas, ela continua com elas', async () => {
    for (const ponto of ['transfer-ok', 'request-timestamp'] as const) {
      const db = banco();
      const p = placa(37, { travaEm: ponto });
      const c = await coletar(db, p);
      expect(no(c)).toMatchObject({ inseridas: 37, problema: null });
      expect(no(c).cabo?.desfecho.arquivoNaPlaca).toBe('continua');
      expect(p.inicioS).toBe(T0);
    }
  });

  it('SESSION_COMPLETE não chegou depois da hora: "não deu para saber" (e a placa de fato apagou)', async () => {
    const db = banco();
    const p = placa(37, { travaEm: 'session-complete' });
    const c = await coletar(db, p);
    expect(no(c).cabo?.desfecho).toMatchObject({ arquivoNaPlaca: 'nao-se-sabe', gravado: true });
    expect(no(c).relogio).toBe('falhou');
    expect(montarAvisos(c.r).map((a) => a.titulo)).toContain('Não deu para saber se a placa ainda tem estas leituras');
    expect(p.inicioS).toBe(AGORA_S);
    // Se a placa tivesse mantido, a próxima coleta não duplicaria; aqui ela traz só o arquivo novo.
  });

  it('formato que não fecha: nada parcial, bruto guardado, placa sem confirmação', async () => {
    const db = banco();
    const torto = new Uint8Array(8 + 20).fill(7);
    const p = new PlacaSimulada({ arquivo: torto, tempos: TEMPOS_DE_TESTE });
    const c = await coletar(db, p);
    expect(no(c).problema).toBe('formato-desconhecido');
    expect(c.enviados.some((t) => t.startsWith('RECEIVED'))).toBe(false);
    expect(contarLeituras(db)).toBe(0);
    expect(sessoes(db)[0]).toMatchObject({ outcome: 'versao_desconhecida', proto_ver: null });
    expect(new Uint8Array(sessoes(db)[0].raw as Buffer)).toEqual(torto);
    expect(p.arquivo!.subarray(0, 28)).toEqual(torto);
  });

  it('numeração fora de ordem (defeito do getNextMeasurementId): recusado inteiro, placa intacta', async () => {
    const db = banco();
    const p = placa(5, { idZeradoNaProximaMedicao: true });
    p.medirSemPorta(1); // a medição 5 sai com id 0
    const c = await coletar(db, p);
    expect(no(c).problema).toBe('formato-desconhecido');
    expect(contarLeituras(db)).toBe(0);
  });
});

describe('US2 — hora estimada só quando a conta fecha', () => {
  it('falta de energia (medições a menos): sem hora, com aviso, e a placa recomeça', async () => {
    const db = banco();
    const c = await coletar(db, placa(20));
    expect(no(c)).toMatchObject({ inseridas: 20, problema: null, relogio: 'acertado' });
    expect(no(c).cabo).toMatchObject({ semHora: 20, conferencia: { veredito: 'a-menos', esperadas: 37 } });
    expect(new Set(horas(db).map((l) => l.t_motivo))).toEqual(new Set(['contagem-a-menos']));
    const aviso = montarAvisos(c.r).find((a) => a.titulo === 'Não deu para calcular a hora destas leituras')!;
    expect(aviso.detalhe).toMatch(/A placa mandou só 20 leituras, mas no tempo que passou cabiam cerca de 37\. A placa pode ter ficado sem energia por um tempo\. Por isso, as 20 leituras/);
    expect(resumir(c.r).notas.some((n) => n.startsWith('Horas estimadas'))).toBe(false);
  });

  it('botão apertado sem coleta: arquivo curto perde a hora; o longo só além da folga', async () => {
    // Um dia de arquivo (folga ≈ 1,1 h): a medição fora do ritmo já não fecha.
    const db1 = banco();
    const p1 = placa(12, {}, AGORA_S - 11 * I - 1800);
    await p1.acordar('botao').terminou; // ninguém no cabo: mede fora do ritmo
    const c1 = await coletar(db1, p1);
    expect(no(c1).cabo).toMatchObject({ semHora: 13, conferencia: { veredito: 'a-mais', medicoes: 13 } });
    expect(new Set(horas(db1).map((l) => l.t_motivo))).toEqual(new Set(['contagem-a-mais']));
    const aviso = montarAvisos(c1.r).find((a) => a.titulo === 'Não deu para calcular a hora destas leituras')!;
    expect(aviso.detalhe).toMatch(/alguém aperta o botão da placa e não termina a coleta/);

    // Três dias (folga 3,6 h): uma medição a mais cabe na folga; quatro, não.
    const db3 = banco();
    const p3 = placa(37);
    await p3.acordar('botao').terminou;
    const c3 = await coletar(db3, p3);
    expect(no(c3).cabo?.conferencia?.veredito).toBe('fecha');
    expect(no(c3).cabo?.semHora).toBe(0);

    const db4 = banco();
    const p4 = placa(37);
    for (let i = 0; i < 4; i++) await p4.acordar('botao').terminou;
    const c4 = await coletar(db4, p4);
    expect(no(c4).cabo).toMatchObject({ semHora: 41, conferencia: { veredito: 'a-mais' } });
  });

  it('o intervalo do FILE_INFO vale (pedido 2)', async () => {
    const db = banco();
    const p = new PlacaSimulada({
      arquivo: arquivoDaPlaca(AGORA_S - 48 * H - 600, 49), falhas: { intervaloNoFileInfo: H }, tempos: TEMPOS_DE_TESTE,
    });
    const c = await coletar(db, p);
    expect(no(c).cabo?.conferencia).toMatchObject({ veredito: 'fecha', intervaloS: H });
    expect(no(c).dias).toBe(2);
  });

  it('relógio que voltou no tempo desde a última coleta: a hora não vai', async () => {
    const db = banco();
    await coletar(db, placa());
    const c = await coletar(db, placa(3, {}, AGORA_S), { agora: AGORA - 86400_000 });
    expect(no(c).relogio).toBe('celular-suspeito');
    expect(c.enviados.some((t) => /^\d+\n$/.test(t))).toBe(false);
  });
});

describe('US4 — de qual colmeia é esta placa', () => {
  it('MAC novo (de dentro do arquivo) fica ligado à colmeia escolhida; depois, o MAC manda', async () => {
    const db = banco();
    const MAC = 'AA:BB:CC:DD:EE:01';
    const c1 = await coletar(db, placaComMac(MAC), { hiveId: 'h1' });
    expect(no(c1).cabo?.colmeiaPeloMac).toBe(false);
    expect(db.all('SELECT hive_id, mac FROM node')).toEqual([{ hive_id: 'h1', mac: MAC }]);

    // A mesma placa, com a Colmeia 03 marcada por engano: as leituras vão para a 07.
    const c2 = await coletar(db, placaComMac(MAC, 3, AGORA_S), { hiveId: 'h2', agora: AGORA + 7 * H * 1000 });
    expect(no(c2)).toMatchObject({ nome: 'Colmeia 07' });
    expect(no(c2).cabo?.colmeiaPeloMac).toBe(true);
    expect(montarAvisos(c2.r).map((a) => a.titulo)).toContain('Esta placa é da Colmeia 07');
    expect(db.all('SELECT COUNT(*) AS c FROM node')).toEqual([{ c: 1 }]);
  });

  it('a mesma placa duas vezes: o nó é criado uma vez só, com o MAC do arquivo', async () => {
    const db = banco();
    await coletar(db, placa(), { hiveId: 'h2' });
    await coletar(db, placa(2, {}, AGORA_S), { hiveId: 'h2', agora: AGORA + 5 * H * 1000 });
    const nos = db.all<{ hive_id: string; device_id: string; mac: string | null }>('SELECT hive_id, device_id, mac FROM node');
    expect(nos).toHaveLength(1);
    expect(nos[0]).toMatchObject({ hive_id: 'h2', mac: macSimulado(1) });
    expect(nos[0].device_id).toMatch(/^placa-[0-9a-f]{16}$/);
  });

  it('o MAC de dentro do arquivo vale mais que o do READY:<MAC>', async () => {
    const db = banco();
    await coletar(db, placaComMac('AA:BB:CC:DD:EE:02', 37, T0, { mac: '11:22:33:44:55:66' }));
    expect(db.all('SELECT mac FROM node')).toEqual([{ mac: 'AA:BB:CC:DD:EE:02' }]);
  });
});

describe('placa com o firmware antigo (e93f8ad, sem MAC no arquivo)', () => {
  it('o arquivo é recusado inteiro: nada na série, o bruto guardado, a placa fica com tudo', async () => {
    const db = banco();
    const p = new PlacaSimulada({
      firmware: 'e93f8ad', arquivo: arquivoDaPlaca(T0, 37, 1, 'e93f8ad'), tempos: TEMPOS_DE_TESTE,
    });
    const original = p.arquivo!.slice();
    const c = await coletar(db, p);
    expect(no(c).problema).toBe('formato-desconhecido');
    expect(no(c).cabo?.desfecho).toMatchObject({ motivo: 'formato-desconhecido', gravado: false, arquivoNaPlaca: 'continua' });
    expect(c.enviados.some((t) => t.startsWith('RECEIVED'))).toBe(false);
    expect(contarLeituras(db)).toBe(0);
    expect(p.inicioS).toBe(T0);
    expect(new Uint8Array(sessoes(db)[0].raw as Buffer)).toEqual(original);
  });
});

describe('colisão de chave (D-519): nunca engolida calada', () => {
  it('dois arquivos com data 0 na mesma colmeia: a gravada não muda, a nova fica no bruto e é avisada', async () => {
    const db = banco();
    // Placa nova que tomou o HELLO como data 0, coletada uma vez.
    await coletar(db, new PlacaSimulada({ arquivo: arquivoDaPlaca(0, 5, 1), tempos: TEMPOS_DE_TESTE }));
    const antes = leituras(db);
    expect(antes).toHaveLength(5);

    // Reimportar o MESMO arquivo: nenhuma colisão, nada muda.
    const mesma = await coletar(db, new PlacaSimulada({ arquivo: arquivoDaPlaca(0, 5, 1), tempos: TEMPOS_DE_TESTE }));
    expect(no(mesma).cabo?.conflitos).toBe(0);
    expect(montarAvisos(mesma.r).some((a) => a.titulo.startsWith('Algumas leituras ficaram salvas à parte'))).toBe(false);

    // Outra placa (regravada) que também tomou o HELLO como data 0, com outros valores.
    const outra = await coletar(db, new PlacaSimulada({ arquivo: arquivoDaPlaca(0, 7, 9), tempos: TEMPOS_DE_TESTE }));
    expect(no(outra)).toMatchObject({ inseridas: 2, recebidas: 7 });
    expect(no(outra).cabo?.conflitos).toBe(5);
    expect(leituras(db).slice(0, 5)).toEqual(antes);
    const aviso = montarAvisos(outra.r).find((a) => a.titulo === 'Algumas leituras ficaram salvas à parte')!;
    expect(aviso.detalhe).toMatch(/^5 leituras desta placa têm o mesmo número/);
    // Nada se perdeu: o arquivo inteiro está no bruto da sessão, e o registro diz por quê.
    const ultima = sessoes(db).at(-1)!;
    expect(Buffer.from(ultima.raw as Uint8Array)).toEqual(Buffer.from(arquivoDaPlaca(0, 7, 9)));
    expect(ultima.registro).toMatch(/5 leituras com a chave de outras já gravadas/);
  });
});

describe('placa nova na coleta normal (FR-025)', () => {
  it('a placa diz que é nova antes do HELLO: nenhuma mensagem sai, e ela continua nova', async () => {
    const db = banco();
    const p = new PlacaSimulada({ arquivo: null, tempos: TEMPOS_DE_TESTE });
    const { canal, terminou } = p.acordar('desconhecida');
    const r = await coletarPeloCabo(db, canal, { hiveId: 'h1', agora: () => AGORA, config: CONFIG, src: 'mock' });
    expect(r.nos[0].problema).toBe('placa-recusou');
    expect(montarAvisos(r)[0].titulo).toBe('Esta placa ainda não foi configurada');
    // Ela segue esperando a hora inicial (até a porta fechar, aqui).
    expect(p.arquivo).toBeNull();
    p.desligarDaTomada();
    await terminou;
  });
});
