/**
 * Hora pela contagem (feature 005, FR-015 a FR-019; emenda da FR-016 da 003).
 * A regra de ouro continua a da 003: na dúvida, sem hora. A hora pela posição
 * só existe estimada e com a conferência fechando.
 */
import { describe, expect, it } from 'vitest';
import {
  FOLGA_MINIMA_S, FOLGA_PROPORCAO, INTERVALO_PADRAO_S, QUALIDADE, avaliarContagem, avaliarHoras,
  conferirContagem, type LeituraDeTempo, type Referencia,
} from '@/core/hora';
import { INICIO_DO_PROJETO_MS } from '@/core/relogio';
import { codificarArquivo0, lerArquivo, seqDaMedicao } from '@/core/decode/arquivo';
import { ingerirLote } from '@/data/ingest';
import {
  atualizarHoras, definirIntervaloDaPlaca, gravarReferencia,
} from '@/data/hora';
import { garantirApiario, garantirColmeia, garantirNode } from '@/data/repo';
import { bancoDeTeste } from './apoio/banco';

const I = 7200;
const T0 = Date.UTC(2026, 9, 10, 12) / 1000;
const P = { intervaloS: I, inicioDoProjetoMs: INICIO_DO_PROJETO_MS };

function leituras(inicioS: number, n: number): LeituraDeTempo[] {
  return Array.from({ length: n }, (_, id) => ({
    seq: seqDaMedicao(inicioS, id), tNode: id, ligada: null, modo: 'contagem' as const,
  }));
}

let proximoId = 1;
function coleta(inicioS: number, n: number, tcS: number, extra: Partial<Referencia> = {}): Referencia {
  const id = proximoId++;
  return {
    id, grupo: id, tNode: Math.max(0, n - 1), tUtcMs: tcS * 1000, ligada: null,
    seqRef: n > 0 ? seqDaMedicao(inicioS, n - 1) : null, periodoS: null, modo: 'contagem',
    origem: 'coleta', aceita: true, revogada: false, confirmada: false, ...extra,
  };
}

const porMotivo = (faixas: ReturnType<typeof avaliarContagem>['faixas']) =>
  faixas.map((f) => ({ ini: f.seqIni % 1e6, fim: f.seqFim % 1e6, q: f.qualidade, m: f.motivo }));

describe('a conferência de uma coleta (FR-017)', () => {
  it('no ritmo: a última medição cai menos de um intervalo antes da coleta', () => {
    const c = conferirContagem(T0, 37, I, (T0 + 36 * I + 1800) * 1000);
    expect(c).toMatchObject({ veredito: 'fecha', sobraS: 1800, esperadas: 37 });
  });

  it('a folga é 10 min ou 5 % do decorrido, o que for maior', () => {
    expect(conferirContagem(T0, 1, I, (T0 + 60) * 1000).folgaS).toBe(FOLGA_MINIMA_S);
    const decorrido = 30 * 86400;
    expect(conferirContagem(T0, 361, I, (T0 + decorrido) * 1000).folgaS)
      .toBeCloseTo(FOLGA_PROPORCAO * decorrido, 6);
  });

  it('as bordas exatas da janela: a última medição até um intervalo antes, mais a folga', () => {
    // n = 1: a última medição é a 0, no início. sobra = Tc − T0; folga = 600 s nesta escala.
    const f = (tcS: number) => conferirContagem(T0, 1, I, tcS * 1000).veredito;
    expect(f(T0 + I)).toBe('fecha');
    expect(f(T0 + I + FOLGA_MINIMA_S)).toBe('fecha');
    expect(f(T0 + I + FOLGA_MINIMA_S + 1)).toBe('a-menos');
    // Medição a mais: n = 2 com menos de um intervalo de tempo. sobra = Tc − (T0 + I).
    const g = (n: number, tcS: number) => conferirContagem(T0, n, I, tcS * 1000).veredito;
    expect(g(2, T0 + I)).toBe('fecha');                       // sobra = 0
    expect(g(2, T0 + I - FOLGA_MINIMA_S)).toBe('fecha');      // sobra = −600 (folga 600)
    expect(g(2, T0 + I - FOLGA_MINIMA_S - 1)).toBe('a-mais');
    // A regra antiga (uma medição a mais ou a menos "de brinde") não vale mais.
    expect(g(3, T0 + I)).toBe('a-mais');
    expect(f(T0 + 2 * I)).toBe('a-menos');
  });

  it('início depois da coleta é implausível', () => {
    expect(conferirContagem(T0, 1, I, (T0 - 3600) * 1000).veredito).toBe('inicio-implausivel');
    expect(conferirContagem(T0, 1, I, (T0 - 300) * 1000).veredito).toBe('fecha');
  });
});

describe('avaliarContagem: o que fica estimado e o que fica sem hora (FR-018)', () => {
  it('arquivo no ritmo: tudo estimado, hora = início + número × intervalo', () => {
    const r = avaliarContagem(leituras(T0, 37), [coleta(T0, 37, T0 + 36 * I + 1800)], P);
    expect(porMotivo(r.faixas)).toEqual([{ ini: 0, fim: 36, q: QUALIDADE.estimada, m: 'contagem-conferida' }]);
    const f = r.faixas[0];
    expect(f).toMatchObject({ refTNode: 0, refTUtcMs: T0 * 1000, msPorUnidade: I * 1000 });
    expect(r.contagens[0]).toMatchObject({ veredito: 'fecha', medicoes: 37, intervaloS: I });
  });

  it('falta de energia (medições a menos): o arquivo inteiro sem hora', () => {
    const r = avaliarContagem(leituras(T0, 20), [coleta(T0, 20, T0 + 3 * 86400)], P);
    expect(porMotivo(r.faixas)).toEqual([{ ini: 0, fim: 19, q: QUALIDADE.desconhecida, m: 'contagem-a-menos' }]);
    expect(r.faixas[0].refTUtcMs).toBeNull();
    expect(r.contagens[0].esperadas).toBe(37);
  });

  it('botão apertado sem coleta: só passa dentro da folga, que cresce com o arquivo', () => {
    // Arquivo de 3 dias: folga = 5 % de 72 h = 3,6 h, e uma medição a mais (2 h) cabe nela.
    const tc = T0 + 36 * I + 100;
    expect(avaliarContagem(leituras(T0, 38), [coleta(T0, 38, tc)], P).faixas[0].motivo)
      .toBe('contagem-conferida');
    expect(avaliarContagem(leituras(T0, 41), [coleta(T0, 41, tc)], P).faixas[0].motivo)
      .toBe('contagem-a-mais');
    // Arquivo de 6 h: folga = 10 min, e a mesma medição a mais já tira a hora.
    const curto = T0 + 3 * I + 100;
    expect(avaliarContagem(leituras(T0, 4), [coleta(T0, 4, curto)], P).faixas[0].motivo)
      .toBe('contagem-conferida');
    expect(avaliarContagem(leituras(T0, 5), [coleta(T0, 5, curto)], P).faixas[0].motivo)
      .toBe('contagem-a-mais');
  });

  it('limitação declarada (D-507): a medição fora do ritmo desloca a série em menos de um intervalo, e a conta só vê o que passar da sobra + folga', () => {
    // A placa mediu no ritmo até a 4; uma coleta que falhou, meia hora depois da 4,
    // fez a placa medir de novo (a 5) e recomeçar o temporizador dali (a 6 vem 2 h
    // depois da 5). A coleta seguinte, 1,9 intervalo depois da tentativa, vê 7.
    const tentativa = T0 + 4 * I + I / 4;
    const real6 = tentativa + I;
    const tc = tentativa + 1.9 * I;
    const c = conferirContagem(T0, 7, I, tc * 1000);
    // A conta fecha: a sobra (0,15 I) está na janela.
    expect(c.veredito).toBe('fecha');
    // E a hora "estimada" da 6 fica 0,75 intervalo (1,5 h) depois da real: mais que a folga
    // deste arquivo (5 % de 6,15 I ≈ 37 min). O erro possível de uma hora estimada pela
    // contagem é de até um intervalo mais a folga, não só a folga.
    const estimada6 = T0 + 6 * I;
    expect(estimada6 - real6).toBe(0.75 * I);
    expect(estimada6 - real6).toBeGreaterThan(c.folgaS);
    // Tentando de novo logo depois (5 min), a mesma medição fora do ritmo aparece.
    expect(conferirContagem(T0, 6, I, (tentativa + 300) * 1000).veredito).toBe('a-mais');
  });

  it('nenhuma coleta com hora plausível: sem hora, "sem conferência"', () => {
    const r = avaliarContagem(leituras(T0, 10), [coleta(T0, 10, T0 + 9 * I + 60, { aceita: false })], P);
    expect(porMotivo(r.faixas)).toEqual([{ ini: 0, fim: 9, q: 3, m: 'contagem-sem-conferencia' }]);
    // Hora do celular antes do projeto, mesmo marcada aceita, não confere.
    const r2 = avaliarContagem(leituras(T0, 10),
      [coleta(T0, 10, INICIO_DO_PROJETO_MS / 1000 - 86400)], P);
    expect(r2.faixas[0].motivo).toBe('contagem-sem-conferencia');
  });

  it('a próxima coleta com hora certa confere o que ficou sem conferência (US2-4)', () => {
    const ruim = coleta(T0, 10, T0 + 9 * I + 60, { aceita: false });
    // A placa não apagou: o mesmo arquivo, maior, na coleta seguinte.
    const boa = coleta(T0, 14, T0 + 13 * I + 300);
    const r = avaliarContagem(leituras(T0, 14), [ruim, boa], P);
    expect(porMotivo(r.faixas)).toEqual([{ ini: 0, fim: 13, q: 2, m: 'contagem-conferida' }]);
  });

  it('início antes do projeto (placa nova que tomou HELLO como hora 0): sem hora', () => {
    const r = avaliarContagem(leituras(0, 5), [coleta(0, 5, T0)], P);
    expect(porMotivo(r.faixas)).toEqual([{ ini: 0, fim: 4, q: 3, m: 'inicio-implausivel' }]);
    expect(r.contagens[0].veredito).toBe('inicio-implausivel');
  });

  it('várias coletas do mesmo arquivo: cada trecho vale pela primeira que o viu', () => {
    const r = avaliarContagem(leituras(T0, 30), [
      coleta(T0, 10, T0 + 9 * I + 60),             // fechou
      coleta(T0, 30, T0 + 29 * I + 3 * 86400),      // depois, uma falta de energia
    ], P);
    expect(porMotivo(r.faixas)).toEqual([
      { ini: 0, fim: 9, q: 2, m: 'contagem-conferida' },
      { ini: 10, fim: 29, q: 3, m: 'contagem-a-menos' },
    ]);
  });

  it('o intervalo do FILE_INFO vale mais que o do cadastro (FR-016)', () => {
    const r = avaliarContagem(leituras(T0, 25),
      [coleta(T0, 25, T0 + 24 * 3600 + 120, { periodoS: 3600 })], P);
    expect(r.faixas[0]).toMatchObject({ motivo: 'contagem-conferida', msPorUnidade: 3600 * 1000 });
    // O mesmo arquivo pelo cadastro de 2 h não fecharia (medições a mais).
    const s = avaliarContagem(leituras(T0, 25), [coleta(T0, 25, T0 + 24 * 3600 + 120)], P);
    expect(s.faixas[0].motivo).toBe('contagem-a-mais');
  });

  it('arquivos diferentes do mesmo nó têm conferências independentes', () => {
    const T1 = T0 + 37 * I;
    const r = avaliarContagem([...leituras(T0, 37), ...leituras(T1, 5)], [
      coleta(T0, 37, T1),
      coleta(T1, 5, T1 + 4 * I + 3 * 86400),
    ], P);
    expect(porMotivo(r.faixas)).toEqual([
      { ini: 0, fim: 36, q: 2, m: 'contagem-conferida' },
      { ini: 0, fim: 4, q: 3, m: 'contagem-a-menos' },
    ]);
    expect(r.ligadas.map((l) => l.quantidade)).toEqual([37, 5]);
  });

  it('INV-505: nenhuma leitura de contagem é ancorada ou "rtc"', () => {
    const casos = [
      avaliarContagem(leituras(T0, 37), [coleta(T0, 37, T0 + 36 * I)], P),
      avaliarContagem(leituras(T0, 37), [coleta(T0, 37, T0 + 99 * I)], P),
      avaliarContagem(leituras(T0, 37), [], P),
    ];
    for (const r of casos) {
      for (const f of r.faixas) {
        expect([QUALIDADE.estimada, QUALIDADE.desconhecida]).toContain(f.qualidade);
        if (f.qualidade === QUALIDADE.estimada) expect(f.motivo).toBe('contagem-conferida');
      }
    }
  });

  it('o acerto (a hora mandada à placa) não confere nada', () => {
    const acerto = coleta(T0, 0, T0, { origem: 'acerto', seqRef: null });
    const r = avaliarContagem(leituras(T0, 3), [acerto], P);
    expect(r.faixas[0].motivo).toBe('contagem-sem-conferencia');
  });
});

describe('avaliarHoras com nó misto (demonstração): as duas regras não se misturam', () => {
  it('as leituras da 003 continuam com a avaliação da 003', () => {
    const uptime: LeituraDeTempo[] = [1, 2, 3].map((seq) => ({ seq, tNode: seq * 900, ligada: null, modo: 'uptime' }));
    const refUptime: Referencia = {
      id: 900, grupo: 900, tNode: 3 * 900 + 10, tUtcMs: Date.UTC(2026, 9, 9), ligada: null, seqRef: 3,
      modo: 'uptime', origem: 'coleta', aceita: true, revogada: false, confirmada: false,
    };
    const so003 = avaliarHoras(uptime, [refUptime], { periodoS: 900, inicioDoProjetoMs: INICIO_DO_PROJETO_MS });
    const misto = avaliarHoras([...uptime, ...leituras(T0, 37)],
      [refUptime, coleta(T0, 37, T0 + 36 * I + 1800)],
      { periodoS: 900, inicioDoProjetoMs: INICIO_DO_PROJETO_MS });
    expect(misto.faixas.slice(0, so003.faixas.length)).toEqual(so003.faixas);
    expect(misto.faixas[misto.faixas.length - 1].motivo).toBe('contagem-conferida');
    expect(misto.contagens).toHaveLength(1);
    expect(so003.contagens).toEqual([]);
  });
});

describe('no banco: VIEW leitura_hora, versão de horas e intervalo do cadastro', () => {
  function montar(n: number, tcS: number) {
    const db = bancoDeTeste();
    garantirApiario(db, 'ap', 'Meliponário');
    garantirColmeia(db, 'h1', 'ap', 'Colmeia 1');
    const nodeId = garantirNode(db, 'placa-teste', 'h1', 7200);
    const arquivo = lerArquivo('arquivo-0', codificarArquivo0(T0, Array.from({ length: n }, (_, k) => ({
      temperatura: 34 + k / 100, umidade: 60, eco2: 400, tvoc: 100 + k,
    }))));
    ingerirLote(db, nodeId, arquivo.leituras, { clockMode: 'contagem' }, arquivo.protoVer, 'cable');
    gravarReferencia(db, nodeId, {
      origem: 'coleta', bootId: null, ligada: null, tNode: n - 1, tUtcMs: tcS * 1000,
      monoMs: 0, rttMs: 0, src: 'cable', aceita: true, seqRef: arquivo.leituras[n - 1].seq,
      modo: 'contagem', periodoS: null, criadoMs: tcS * 1000,
    });
    atualizarHoras(db, nodeId, 'coleta', tcS * 1000);
    return { db, nodeId };
  }
  const horas = (db: ReturnType<typeof bancoDeTeste>, nodeId: number) => db.all<{
    seq: number; t_node: number; t_utc_ms: number | null; t_quality: number; t_motivo: string | null;
  }>('SELECT seq, t_node, t_utc_ms, t_quality, t_motivo FROM leitura_hora WHERE node_id = ? ORDER BY seq', [nodeId]);
  const brutas = (db: ReturnType<typeof bancoDeTeste>) => db.all('SELECT * FROM reading ORDER BY seq');

  it('a VIEW calcula início + número × intervalo, estimada', () => {
    const { db, nodeId } = montar(37, T0 + 36 * I + 1800);
    const h = horas(db, nodeId);
    expect(h).toHaveLength(37);
    h.forEach((l, id) => {
      expect(l.t_utc_ms).toBe((T0 + id * I) * 1000);
      expect(l.t_quality).toBe(2);
      expect(l.t_motivo).toBe('contagem-conferida');
    });
    // A leitura gravada continua em branco: a hora é só da VIEW.
    expect(db.all('SELECT DISTINCT t_utc_ms, t_quality FROM reading')).toEqual([{ t_utc_ms: null, t_quality: 3 }]);
    // Resumo diário pela hora efetiva: as leituras entram nos dias certos.
    expect(db.all<{ c: number }>('SELECT SUM(sample_count) AS c FROM reading_daily')[0].c).toBe(37);
  });

  it('INV-506: mudar o intervalo grava versão nova e não muda nenhuma leitura', () => {
    // Placa que na verdade mede a cada hora, cadastrada no padrão de 2 h.
    const { db, nodeId } = montar(49, T0 + 48 * 3600 + 600);
    expect(new Set(horas(db, nodeId).map((l) => l.t_motivo))).toEqual(new Set(['contagem-a-mais']));
    expect(db.all<{ c: number }>('SELECT COUNT(*) AS c FROM reading_daily')[0].c).toBe(0);
    const antes = brutas(db);
    const versoes = db.all<{ c: number }>('SELECT COUNT(*) AS c FROM hora_versao')[0].c;

    definirIntervaloDaPlaca(db, nodeId, 3600, (T0 + 50 * 3600) * 1000);

    expect(brutas(db)).toEqual(antes);
    expect(db.all('SELECT causa FROM hora_versao ORDER BY id DESC LIMIT 1')).toEqual([{ causa: 'intervalo' }]);
    expect(db.all<{ c: number }>('SELECT COUNT(*) AS c FROM hora_versao')[0].c).toBe(versoes + 1);
    const h = horas(db, nodeId);
    expect(h.every((l, id) => l.t_utc_ms === (T0 + id * 3600) * 1000 && l.t_quality === 2)).toBe(true);
    expect(db.all<{ c: number }>('SELECT SUM(sample_count) AS c FROM reading_daily')[0].c).toBe(49);

    // Voltar ao padrão desfaz, de novo por versão nova.
    definirIntervaloDaPlaca(db, nodeId, null);
    expect(new Set(horas(db, nodeId).map((l) => l.t_motivo))).toEqual(new Set(['contagem-a-mais']));
    expect(brutas(db)).toEqual(antes);
  });

  it('intervalo inválido é recusado sem mexer em nada', () => {
    const { db, nodeId } = montar(3, T0 + 2 * I + 60);
    expect(() => definirIntervaloDaPlaca(db, nodeId, 0)).toThrow();
    expect(() => definirIntervaloDaPlaca(db, nodeId, 1.5)).toThrow();
    expect(db.all('SELECT intervalo_medicao_s FROM node')).toEqual([{ intervalo_medicao_s: null }]);
  });

  it('o padrão do cadastro é 7200 s', () => {
    expect(INTERVALO_PADRAO_S).toBe(7200);
  });
});
