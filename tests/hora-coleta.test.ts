/**
 * A hora das leituras de ponta a ponta: transporte simulado → coleta → banco →
 * VIEW (feature 003). O nó simulado tem uma linha do tempo fixa (`ligadoEmMs`):
 * a leitura i foi medida em LIGOU + i × 15 min, no relógio REAL. O relógio do
 * CELULAR é outro, e é ele que pode estar errado. Cada teste confere a hora que
 * o app dá a cada leitura contra a hora verdadeira.
 */
import { describe, expect, it } from 'vitest';
import { executarColeta, responderPerguntaDeHora } from '@/data/coleta';
import { ingerirLote } from '@/data/ingest';
import { contarPorQualidade, contarSemHora } from '@/data/hora';
import {
  garantirApiario, garantirColmeia, garantirNode, listarColmeias, loteNaoEnviado,
} from '@/data/repo';
import type { SqlDb } from '@/data/types';
import {
  MockTransport, PERFIL_SAUDAVEL, SEM_ATRASOS, gerarSerie,
  type ConfigNoSimulado, type FalhasSimuladas,
} from '@/transports/mock';
import { montarAvisos } from '@/core/coleta/mensagens';
import { bancoDeTeste } from './apoio/banco';

const LIGOU = Date.UTC(2026, 9, 1, 12, 0, 0);
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const ANO = 365 * DIA;

function no(falhas?: FalhasSimuladas): ConfigNoSimulado {
  return {
    deviceId: 'BBBB000000000001', nome: 'Colmeia A', perfil: PERFIL_SAUDAVEL,
    dias: 30, periodoS: 900, seed: 5, comInvalidas: true, ligadoEmMs: LIGOU, falhas,
  };
}

function banco() {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap-1', 'Meliponário de Teste');
  garantirColmeia(db, 'h-0001', 'ap-1', 'Colmeia A');
  const nodeId = garantirNode(db, no().deviceId, 'h-0001', 900);
  return { db, nodeId };
}

/** Uma coleta no instante real `realMs`, com o celular errado por `erroMs`. */
async function coletar(db: SqlDb, cfg: ConfigNoSimulado, realMs: number, erroMs = 0) {
  const celular = () => realMs + erroMs;
  const t = new MockTransport([cfg], { atrasos: SEM_ATRASOS, agora: celular, relogioReal: () => realMs });
  const r = await executarColeta(db, t, { agora: celular });
  return { r, no: r.nos[0], t };
}

/** Hora verdadeira de cada `seq`, pela mesma geração que o nó simulado usa. */
function verdade(cfg: ConfigNoSimulado, ateMs: number): Map<number, number> {
  const total = Math.floor((ateMs - LIGOU) / (cfg.periodoS * 1000)) + 1;
  const f = cfg.falhas ?? {};
  const reinicioEm = f.perdeuEnergiaEmMs === undefined ? undefined
    : Math.ceil((f.perdeuEnergiaEmMs - LIGOU) / (cfg.periodoS * 1000));
  const serie = gerarSerie({
    dias: cfg.dias, periodoS: cfg.periodoS, perfil: cfg.perfil, seed: cfg.seed,
    comInvalidas: cfg.comInvalidas, quantidade: total, reinicioEm,
  });
  return new Map(serie.map((r, i) => [r.seq, LIGOU + i * cfg.periodoS * 1000]));
}

interface HoraEfetiva { seq: number; t_utc_ms: number | null; t_quality: number; t_motivo: string | null }
const horas = (db: SqlDb, nodeId: number) => db.all<HoraEfetiva>(
  'SELECT seq, t_utc_ms, t_quality, t_motivo FROM leitura_hora WHERE node_id = ? ORDER BY seq', [nodeId],
);
const leiturasCruas = (db: SqlDb) => db.all('SELECT * FROM reading ORDER BY node_id, seq');

describe('US1 — a placa perdeu energia (SC-001)', () => {
  it('primeira coleta depois de um reinício: o trecho de antes fica sem hora, nenhum sai ancorado', async () => {
    const perda = LIGOU + 2 * DIA + 7 * MIN;
    const cfg = no({ perdeuEnergiaEmMs: perda });
    const { db, nodeId } = banco();

    const { no: n } = await coletar(db, cfg, LIGOU + 4 * DIA);

    expect(n.problema).toBeNull();
    expect(n.relogio).toBe('acertado');
    const real = verdade(cfg, LIGOU + 4 * DIA);
    let antes = 0;
    for (const h of horas(db, nodeId)) {
      if (real.get(h.seq)! < perda) {
        antes += 1;
        expect(h).toMatchObject({ t_utc_ms: null, t_quality: 3, t_motivo: 'ligada-sem-referencia' });
      } else {
        // Hora certa, mas estimada: só uma coleta nesta ligada (FR-012).
        expect(h).toMatchObject({ t_utc_ms: real.get(h.seq), t_quality: 2 });
      }
    }
    expect(antes).toBe(2 * 96 + 1);
    expect(contarPorQualidade(db, nodeId).ancorada).toBe(0);
    // A referência guarda o período que o nó informou na sessão.
    expect(db.all('SELECT DISTINCT periodo_s FROM clock_anchor')).toEqual([{ periodo_s: 900 }]);
    expect(contarSemHora(db, nodeId)).toBe(antes);
  });

  it('ligada já conferida em coletas passadas mantém a hora dela; a nova ganha a da coleta (US1-2)', async () => {
    const perda = LIGOU + 3 * DIA + 2 * HORA;
    const cfg = no({ perdeuEnergiaEmMs: perda });
    const { db, nodeId } = banco();

    await coletar(db, cfg, LIGOU + DIA);
    await coletar(db, cfg, LIGOU + 3 * DIA);
    const { no: n } = await coletar(db, cfg, LIGOU + 5 * DIA);

    expect(n.relogio).toBe('acertado');
    const real = verdade(cfg, LIGOU + 5 * DIA);
    for (const h of horas(db, nodeId)) {
      expect(h.t_utc_ms).toBe(real.get(h.seq));
      // Ligada de antes: duas coletas concordaram → ancorada. Ligada nova: uma só.
      expect(h.t_quality).toBe(real.get(h.seq)! < perda ? 1 : 2);
    }
  });

  it('o reinício logo depois da coleta passada é achado contra a última leitura gravada (US1-4)', async () => {
    const perda = LIGOU + 3 * DIA + MIN;
    const cfg = no({ perdeuEnergiaEmMs: perda });
    const { db, nodeId } = banco();

    await coletar(db, cfg, LIGOU + DIA);
    await coletar(db, cfg, LIGOU + 3 * DIA);
    const antes = horas(db, nodeId);
    await coletar(db, cfg, LIGOU + 6 * DIA);

    const real = verdade(cfg, LIGOU + 6 * DIA);
    const depois = horas(db, nodeId);
    // As já gravadas não mudaram de hora; as novas (todas da ligada nova) têm a certa.
    expect(depois.slice(0, antes.length)).toEqual(antes);
    for (const h of depois.slice(antes.length)) {
      expect(h).toMatchObject({ t_utc_ms: real.get(h.seq), t_quality: 2 });
    }
  });

  it('o app morreu no meio da coleta: o que já foi gravado fica sem hora, nunca com hora provisória (D-302)', async () => {
    const cfg = no();
    const { db, nodeId } = banco();
    await coletar(db, cfg, LIGOU + DIA);
    const avaliadas = horas(db, nodeId);
    // O lote seguinte foi gravado e o app morreu antes da avaliação do fim da coleta.
    const serie = gerarSerie({
      dias: 0, quantidade: 120, periodoS: 900, perfil: cfg.perfil, seed: cfg.seed,
      comInvalidas: cfg.comInvalidas,
    });
    ingerirLote(db, nodeId, serie.slice(97), { clockMode: 'uptime' }, 1, 'mock');

    const depois = horas(db, nodeId);
    expect(depois.slice(0, avaliadas.length)).toEqual(avaliadas);
    for (const h of depois.slice(avaliadas.length)) {
      expect(h).toEqual({ seq: h.seq, t_utc_ms: null, t_quality: 3, t_motivo: 'em-avaliacao' });
    }
    // "Última leitura" na lista é a mais nova COM hora, não a mais nova em branco.
    expect(listarColmeias(db)[0].ultima_ms).toBe(verdade(cfg, LIGOU + DIA).get(97));
    // A coleta seguinte avalia tudo, inclusive as que ficaram pela metade.
    await coletar(db, cfg, LIGOU + 2 * DIA);
    expect(contarSemHora(db, nodeId)).toBe(0);
  });

  it('a primeira referência é promovida quando a segunda coleta concorda, por correção à parte', async () => {
    const cfg = no();
    const { db, nodeId } = banco();
    await coletar(db, cfg, LIGOU + DIA);
    expect(contarPorQualidade(db, nodeId)).toMatchObject({ ancorada: 0, estimada: 97 });
    const cruasAntes = leiturasCruas(db);

    await coletar(db, cfg, LIGOU + 2 * DIA);

    expect(contarPorQualidade(db, nodeId)).toMatchObject({ ancorada: 193, estimada: 0 });
    // A promoção não tocou as linhas da primeira coleta.
    expect(leiturasCruas(db).slice(0, cruasAntes.length)).toEqual(cruasAntes);
  });

  it('nó que mede de hora em hora, cadastrado com 15 min: vale o período da sessão', async () => {
    // As coletas caem 50 min depois da última leitura: normal para um nó de 1 h,
    // impossível para um de 15 min. Com o período do cadastro, tudo ficaria sem hora.
    const cfg: ConfigNoSimulado = { ...no(), periodoS: 3600 };
    const { db, nodeId } = banco();
    await coletar(db, cfg, LIGOU + DIA + 50 * MIN);
    await coletar(db, cfg, LIGOU + 2 * DIA + 50 * MIN);

    const real = verdade(cfg, LIGOU + 2 * DIA + 50 * MIN);
    expect(contarSemHora(db, nodeId)).toBe(0);
    for (const h of horas(db, nodeId)) {
      expect(h).toMatchObject({ t_utc_ms: real.get(h.seq), t_quality: 1 });
    }
  });

  it('quando a dúvida antes de transferir era um reinício, não pergunta nada (adiado)', async () => {
    // Coletou 1 h depois de ligar; a placa perdeu energia 10 min depois e ficou
    // 3 dias ligada de novo. O contador agora é MAIOR que o da última leitura,
    // então antes de transferir parece a mesma ligada com a hora errada.
    const cfg = no({ perdeuEnergiaEmMs: LIGOU + HORA + 10 * MIN });
    const { db } = banco();
    await coletar(db, cfg, LIGOU + HORA);

    const { r, no: n, t } = await coletar(db, cfg, LIGOU + 3 * DIA);

    expect(n.relogio).toBe('adiado');
    expect(n.conflitoDeHora).toBeUndefined();
    expect(t.horarioRecebido(cfg.deviceId)).toBeUndefined();
    expect(montarAvisos(r)).toEqual([]);
  });
});

describe('US2 — celular com a data errada (SC-002)', () => {
  async function adiantadoDepoisCerto() {
    const cfg = no();
    const { db, nodeId } = banco();
    const primeira = await coletar(db, cfg, LIGOU + DIA, ANO);
    expect(primeira.no.relogio).toBe('acertado'); // sem referência anterior, não há como saber
    const segunda = await coletar(db, cfg, LIGOU + 3 * DIA);
    return { cfg, db, nodeId, segunda };
  }

  it('a segunda coleta acusa o conflito: não manda hora, marca estimada e pergunta (US2-1)', async () => {
    const { db, nodeId, segunda } = await adiantadoDepoisCerto();

    expect(segunda.no.relogio).toBe('conflito');
    expect(segunda.no.conflitoDeHora).toMatchObject({ nodeId });
    expect(segunda.t.horarioRecebido(no().deviceId)).toBeUndefined();
    expect(db.all('SELECT DISTINCT t_quality, t_motivo FROM leitura_hora'))
      .toEqual([{ t_quality: 2, t_motivo: 'conflito-de-hora' }]);
  });

  it('"Sim" revoga a referência adiantada, recalcula sem tocar as leituras e acerta o relógio na hora (US2-2)', async () => {
    const { cfg, db, nodeId, segunda } = await adiantadoDepoisCerto();
    const cruas = leiturasCruas(db);
    const agora = LIGOU + 3 * DIA + 5 * MIN;
    const t = new MockTransport([cfg], { atrasos: SEM_ATRASOS, agora: () => agora, relogioReal: () => agora });

    const resposta = await responderPerguntaDeHora(
      db, t, { ...segunda.no.conflitoDeHora!, deviceId: cfg.deviceId }, 'sim', { agora: () => agora },
    );

    expect(resposta).toEqual({ gravou: true, revogadas: 2, relogio: 'acertado' });
    expect(t.horarioRecebido(cfg.deviceId)).toBe(agora);
    // SC-005: nenhuma leitura original mudou, campo a campo.
    expect(leiturasCruas(db)).toEqual(cruas);
    // A hora exibida passou a ser a certa, e ancorada (o apicultor confirmou).
    const real = verdade(cfg, agora);
    for (const h of horas(db, nodeId)) {
      expect(h).toMatchObject({ t_utc_ms: real.get(h.seq), t_quality: 1, t_motivo: null });
    }
    // A revogação e a decisão ficam registradas, com quando e por quê (FR-011, FR-013).
    expect(db.all('SELECT resposta, decidido_ms FROM hora_decisao')).toEqual([{ resposta: 'sim', decidido_ms: agora }]);
    expect(db.all('SELECT DISTINCT motivo, revogada_ms FROM referencia_revogada'))
      .toEqual([{ motivo: 'apicultor-confirmou-a-data', revogada_ms: agora }]);
    expect(db.all("SELECT COUNT(*) AS c FROM clock_anchor WHERE origem = 'coleta'")).toEqual([{ c: 2 }]);

    // A terceira coleta acerta o relógio normalmente: uma ação de alguém bastou.
    const terceira = await coletar(db, cfg, LIGOU + 6 * DIA);
    expect(terceira.no.relogio).toBe('acertado');
    expect(terceira.no.conflitoDeHora).toBeUndefined();
  });

  it('"Sim" com o nó fora de alcance: a próxima coleta acerta mesmo assim', async () => {
    const { cfg, db, segunda } = await adiantadoDepoisCerto();
    const ninguem = new MockTransport([], { atrasos: SEM_ATRASOS });

    const resposta = await responderPerguntaDeHora(
      db, ninguem, { ...segunda.no.conflitoDeHora!, deviceId: cfg.deviceId }, 'sim',
      { agora: () => LIGOU + 3 * DIA },
    );
    expect(resposta.relogio).toBe('nao-alcancou');
    expect(resposta.revogadas).toBe(2);

    const terceira = await coletar(db, cfg, LIGOU + 6 * DIA);
    expect(terceira.no.relogio).toBe('acertado');
  });

  it('"Não" não muda nada, e a pergunta volta na coleta seguinte (US2-3)', async () => {
    const { cfg, db, nodeId, segunda } = await adiantadoDepoisCerto();
    const antes = horas(db, nodeId);

    const resposta = await responderPerguntaDeHora(
      db, new MockTransport([cfg], { atrasos: SEM_ATRASOS }),
      { ...segunda.no.conflitoDeHora!, deviceId: cfg.deviceId }, 'nao',
      { agora: () => LIGOU + 3 * DIA },
    );

    expect(resposta).toEqual({ gravou: true, revogadas: 0, relogio: 'nao-tentado' });
    expect(horas(db, nodeId)).toEqual(antes);
    expect(db.all('SELECT resposta FROM hora_decisao')).toEqual([{ resposta: 'nao' }]);
    expect(db.all('SELECT COUNT(*) AS c FROM referencia_revogada')).toEqual([{ c: 0 }]);

    const terceira = await coletar(db, cfg, LIGOU + 6 * DIA);
    expect(terceira.no.relogio).toBe('conflito');
  });
});

describe('US3 — leituras sem hora calculável (SC-004)', () => {
  it('resumo diário só com leitura de hora conhecida; as outras são contadas à parte', async () => {
    const cfg = no({ perdeuEnergiaEmMs: LIGOU + 2 * DIA + 7 * MIN });
    const { db, nodeId } = banco();
    await coletar(db, cfg, LIGOU + 4 * DIA);

    const resumo = db.all<{ n: number }>(
      'SELECT SUM(sample_count + excluded_count) AS n FROM reading_daily WHERE node_id = ?', [nodeId],
    )[0].n;
    const comHora = db.all<{ n: number }>(
      'SELECT COUNT(*) AS n FROM leitura_hora WHERE node_id = ? AND t_utc_ms IS NOT NULL', [nodeId],
    )[0].n;
    expect(contarSemHora(db, nodeId)).toBeGreaterThan(0);
    expect(resumo).toBe(comHora);
    // Nenhum dia do resumo vem de antes do reinício (a única época sem hora).
    const primeiroDia = db.all<{ d: number }>('SELECT MIN(day) AS d FROM reading_daily')[0].d;
    expect(primeiroDia).toBe(Math.floor((LIGOU + 2 * DIA + 15 * MIN) / DIA));
  });

  it('nó sem noção de tempo: nada no resumo nem na "última leitura", tudo contado', async () => {
    const cfg = no({ semNocaoDeTempo: true });
    const { db, nodeId } = banco();
    const { no: n } = await coletar(db, cfg, LIGOU + 2 * DIA);

    expect(n.inseridas).toBe(193);
    expect(db.all('SELECT * FROM reading_daily')).toEqual([]);
    expect(contarSemHora(db, nodeId)).toBe(193);
    expect(listarColmeias(db)[0].ultima_ms).toBeNull();
    // A nuvem recebe a hora em branco, nunca uma inventada.
    expect(new Set(loteNaoEnviado(db, nodeId, 500).map((l) => l.tUtcMs))).toEqual(new Set([null]));
  });
});
