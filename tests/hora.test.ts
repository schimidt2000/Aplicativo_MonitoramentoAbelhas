/**
 * A regra da hora das leituras, sem banco (feature 003). Cada teste monta uma
 * história do nó — quando ligou, quando perdeu energia, quando alguém coletou —
 * e confere a hora que sai para cada leitura contra a hora VERDADEIRA.
 */
import { describe, expect, it } from 'vitest';
import {
  QUALIDADE, avaliarHoras, segmentarLigadas,
  type Faixa, type LeituraDeTempo, type ModoRelogio, type Referencia,
} from '@/core/hora';
import { INICIO_DO_PROJETO_MS } from '@/core/relogio';

const P = 900; // período, em segundos
const PARAMS = { periodoS: P, inicioDoProjetoMs: INICIO_DO_PROJETO_MS };
const LIGOU = Date.UTC(2026, 9, 1, 0, 0, 0);
const DIA = 86_400_000;
const HORA_MS = 3_600_000;

/** Uma leitura medida no instante real `ms`, por um nó que ligou em `ligouEm`. */
interface Verdade { seq: number; ms: number; ligouEm: number }

function leituras(v: Verdade[], modo: ModoRelogio | null = 'uptime', numero?: (x: Verdade) => number): LeituraDeTempo[] {
  return v.map((x) => ({
    seq: x.seq, tNode: Math.floor((x.ms - x.ligouEm) / 1000),
    ligada: numero ? numero(x) : null, modo,
  }));
}

/**
 * História: o nó liga em LIGOU e mede a cada 15 min. `reinicios` são instantes
 * em que perde energia e religa na hora. O `seq` salta 64 em cada reinício.
 */
function historia(ate: number, reinicios: number[] = []): Verdade[] {
  const v: Verdade[] = [];
  let seq = 1;
  let ligouEm = LIGOU;
  for (let ms = LIGOU; ms <= ate; ms += P * 1000) {
    const r = reinicios.find((x) => x <= ms && x > ms - P * 1000);
    if (r !== undefined) { ligouEm = r; seq += 64; }
    v.push({ seq: seq++, ms, ligouEm });
  }
  return v;
}

let proximoId = 1;
/**
 * A referência que uma coleta no instante real `ms` grava: o contador do nó
 * naquele instante × a hora do celular (que pode estar errada por `erroMs`).
 */
function coleta(v: Verdade[], ms: number, erroMs = 0, extra: Partial<Referencia> = {}): Referencia {
  const ultima = [...v].reverse().find((x) => x.ms <= ms)!;
  const id = proximoId++;
  return {
    id, grupo: id, tNode: Math.floor((ms - ultima.ligouEm) / 1000), tUtcMs: ms + erroMs,
    ligada: null, seqRef: ultima.seq, modo: 'uptime', origem: 'coleta',
    aceita: true, revogada: false, confirmada: false, ...extra,
  };
}

/** Hora calculada para cada seq, a partir das faixas (a mesma conta da VIEW). */
function horas(ls: LeituraDeTempo[], faixas: Faixa[]) {
  const out = new Map<number, { ms: number | null; q: number; motivo: string | null }>();
  for (const l of ls) {
    const f = faixas.find((x) => x.seqIni <= l.seq && l.seq <= x.seqFim);
    if (!f) throw new Error(`leitura ${l.seq} sem faixa`);
    out.set(l.seq, {
      ms: f.refTUtcMs === null ? null : f.refTUtcMs - (f.refTNode - l.tNode) * 1000,
      q: f.qualidade, motivo: f.motivo,
    });
  }
  return out;
}

describe('ligadas do nó (FR-001, FR-002)', () => {
  it('o contador que volta é reinício, inclusive quando fica igual', () => {
    const ls: LeituraDeTempo[] = [
      { seq: 1, tNode: 0, ligada: null, modo: 'uptime' },
      { seq: 2, tNode: 900, ligada: null, modo: 'uptime' },
      { seq: 70, tNode: 1800, ligada: null, modo: 'uptime' }, // lacuna de seq não é reinício
      { seq: 71, tNode: 0, ligada: null, modo: 'uptime' },    // voltou
      { seq: 72, tNode: 0, ligada: null, modo: 'uptime' },    // igual: também
      { seq: 73, tNode: 900, ligada: null, modo: 'uptime' },
    ];
    expect(segmentarLigadas(ls).ligadas.map((l) => [l.seqIni, l.seqFim])).toEqual([
      [1, 70], [71, 71], [72, 73],
    ]);
  });

  it('com o número da ligada vindo do nó, vale o número', () => {
    const ls: LeituraDeTempo[] = [
      { seq: 1, tNode: 100, ligada: 4, modo: 'uptime' },
      { seq: 2, tNode: 50_000, ligada: 5, modo: 'uptime' }, // contador cresceu, mas é outra ligada
      { seq: 3, tNode: 50_900, ligada: 5, modo: 'uptime' },
    ];
    expect(segmentarLigadas(ls).ligadas.map((l) => [l.seqIni, l.numero])).toEqual([[1, 4], [2, 5]]);
  });

  it('mesmo número e contador voltando (estouro): na dúvida, ligada nova (FR-004)', () => {
    const ls: LeituraDeTempo[] = [
      { seq: 1, tNode: 4_294_000, ligada: 2, modo: 'uptime' },
      { seq: 2, tNode: 10, ligada: 2, modo: 'uptime' },
    ];
    expect(segmentarLigadas(ls).ligadas).toHaveLength(2);
  });

  it('sem noção de tempo, o contador não separa ligadas; trocar de modo separa', () => {
    const ls: LeituraDeTempo[] = [
      { seq: 1, tNode: 0, ligada: null, modo: 'none' },
      { seq: 2, tNode: 0, ligada: null, modo: 'none' },
      { seq: 3, tNode: 5000, ligada: null, modo: 'uptime' },
    ];
    expect(segmentarLigadas(ls).ligadas.map((l) => [l.seqIni, l.modo])).toEqual([
      [1, 'none'], [3, 'uptime'],
    ]);
  });
});

describe('SC-001: leitura de ligada sem referência nunca sai com hora', () => {
  it('dois reinícios entre coletas: a ligada do meio fica sem hora, as outras com a hora certa', () => {
    const c1 = LIGOU + 2 * DIA;
    const r1 = LIGOU + 3 * DIA;
    const r2 = LIGOU + 4 * DIA;
    const c2 = LIGOU + 6 * DIA;
    const v = historia(c2, [r1, r2]);
    const ls = leituras(v);
    const refs = [coleta(v, LIGOU + 1 * DIA), coleta(v, c1), coleta(v, c2)];

    const av = avaliarHoras(ls, refs, PARAMS);
    const h = horas(ls, av.faixas);

    expect(av.ligadas).toHaveLength(3);
    for (const x of v) {
      const got = h.get(x.seq)!;
      if (x.ligouEm === r1) {
        // A ligada do meio não teve coleta nenhuma.
        expect(got).toEqual({ ms: null, q: QUALIDADE.desconhecida, motivo: 'ligada-sem-referencia' });
      } else {
        expect(got.ms).toBe(x.ms);
      }
    }
    // Primeira ligada: duas coletas concordam → ancorada. Última: uma só → estimada.
    expect(h.get(v[0].seq)!.q).toBe(QUALIDADE.ancorada);
    expect(h.get(v[v.length - 1].seq)).toMatchObject({ q: QUALIDADE.estimada, motivo: 'referencia-nao-conferida' });
  });

  it('história aleatória: nenhuma leitura sem referência na ligada sai com hora, e toda hora dada é a verdadeira', () => {
    let semente = 42;
    const aleatorio = () => {
      semente = (semente * 1103515245 + 12345) % 2 ** 31;
      return semente / 2 ** 31;
    };
    for (let rodada = 0; rodada < 40; rodada++) {
      const fim = LIGOU + (5 + Math.floor(aleatorio() * 20)) * DIA;
      // Em segundos inteiros: o contador do nó conta segundos.
      const segundo = (ms: number) => Math.floor(ms / 1000) * 1000;
      const reinicios = Array.from({ length: Math.floor(aleatorio() * 4) },
        () => segundo(LIGOU + aleatorio() * (fim - LIGOU)))
        .sort((a, b) => a - b);
      const v = historia(fim, reinicios);
      const coletas = Array.from({ length: 1 + Math.floor(aleatorio() * 5) },
        () => segundo(LIGOU + P * 1000 + aleatorio() * (fim - LIGOU - P * 1000)));
      const refs = coletas.map((ms) => coleta(v, ms));
      const ls = leituras(v);

      const h = horas(ls, avaliarHoras(ls, refs, PARAMS).faixas);

      const ligadasComColeta = new Set(coletas.map((ms) => [...v].reverse().find((x) => x.ms <= ms)!.ligouEm));
      for (const x of v) {
        const got = h.get(x.seq)!;
        if (ligadasComColeta.has(x.ligouEm)) expect(got.ms).toBe(x.ms);
        else expect(got.q).toBe(QUALIDADE.desconhecida);
      }
    }
  });
});

describe('a referência pertence à ligada certa (FR-003)', () => {
  it('contador da coleta menor que o da leitura mais nova: a referência é da ligada seguinte', () => {
    // O nó reiniciou DEPOIS da leitura 3 e antes da coleta.
    const ls: LeituraDeTempo[] = [
      { seq: 1, tNode: 9000, ligada: null, modo: 'uptime' },
      { seq: 2, tNode: 9900, ligada: null, modo: 'uptime' },
      { seq: 3, tNode: 10_800, ligada: null, modo: 'uptime' },
      { seq: 68, tNode: 300, ligada: null, modo: 'uptime' },
    ];
    const ref: Referencia = {
      id: 1, grupo: 1, tNode: 200, tUtcMs: LIGOU, ligada: null, seqRef: 3, modo: 'uptime',
      origem: 'coleta', aceita: true, revogada: false, confirmada: false,
    };
    const av = avaliarHoras(ls, [ref], PARAMS);
    const h = horas(ls, av.faixas);
    expect(h.get(3)!.q).toBe(QUALIDADE.desconhecida);
    expect(h.get(68)!.ms).toBe(LIGOU + 100_000);
    expect(av.referencias.get(1)!.ligada).toBe('s:68');
  });

  it('contador muito à frente da leitura mais nova: não dá para saber, fica sem ligada', () => {
    const ls: LeituraDeTempo[] = [{ seq: 1, tNode: 900, ligada: null, modo: 'uptime' }];
    const ref: Referencia = {
      id: 1, grupo: 1, tNode: 900 + 3 * P, tUtcMs: LIGOU, ligada: null, seqRef: 1, modo: 'uptime',
      origem: 'coleta', aceita: true, revogada: false, confirmada: false,
    };
    const av = avaliarHoras(ls, [ref], PARAMS);
    expect(av.referencias.get(1)!.estado).toBe('sem-ligada');
    expect(av.faixas[0].qualidade).toBe(QUALIDADE.desconhecida);
  });

  it('a leitura mais nova da coleta ainda não chegou: sem ligada, a não ser por hipótese', () => {
    const v = historia(LIGOU + DIA);
    const ls = leituras(v).slice(0, 10);
    const ref = coleta(v, LIGOU + DIA);
    expect(avaliarHoras(ls, [ref], PARAMS).referencias.get(ref.id)!.estado).toBe('sem-ligada');
    expect(avaliarHoras(ls, [{ ...ref, provisoria: true }], PARAMS).referencias.get(ref.id)!.ligada)
      .toBe('s:1');
  });

  it('coleta numa ligada que não chegou a medir: a referência não vai para a ligada seguinte', () => {
    // Religou em +1d+2min, coletaram em +1d+5min (antes de qualquer leitura
    // dessa ligada), e a placa religou de novo em +1d+14min. A primeira leitura
    // da ligada seguinte tem contador MENOR que o da coleta: não é a mesma.
    const r2 = LIGOU + DIA + 14 * 60_000;
    const v: Verdade[] = historia(LIGOU + DIA);
    let seq = v[v.length - 1].seq + 64;
    for (let ms = LIGOU + DIA + P * 1000; ms <= LIGOU + 3 * DIA; ms += P * 1000) {
      v.push({ seq: seq++, ms, ligouEm: r2 });
    }
    const ls = leituras(v);
    const coletaNoVao = coleta(v, LIGOU + DIA + 5 * 60_000, 0, { tNode: 180 });
    const refs = [coletaNoVao, coleta(v, LIGOU + 2 * DIA), coleta(v, LIGOU + 3 * DIA)];

    const av = avaliarHoras(ls, refs, PARAMS);

    expect(av.referencias.get(coletaNoVao.id)!.estado).toBe('sem-ligada');
    const h = horas(ls, av.faixas);
    for (const x of v) {
      if (x.ligouEm === r2) expect(h.get(x.seq)).toEqual({ ms: x.ms, q: QUALIDADE.ancorada, motivo: null });
      else expect(h.get(x.seq)!.ms).toBeNull();
    }
  });

  it('o período que vale é o que o nó informou na sessão, não o do cadastro', () => {
    // Nó de 1 h cadastrado com o padrão de 15 min. Coletas 50 min depois da
    // última leitura: dentro de dois períodos de 1 h, fora de dois de 15 min.
    const H = 3600;
    const v: Verdade[] = [];
    for (let k = 0; k <= 48; k++) v.push({ seq: k + 1, ms: LIGOU + k * H * 1000, ligouEm: LIGOU });
    const ls = leituras(v);
    const ref = (ms: number, k: number, extra: Partial<Referencia> = {}) =>
      coleta(v, ms, 0, { seqRef: k + 1, tNode: Math.floor((ms - LIGOU) / 1000), ...extra });
    const c1 = LIGOU + DIA + 50 * 60_000;
    const c2 = LIGOU + 2 * DIA + 50 * 60_000;

    const comPeriodo = avaliarHoras(ls, [ref(c1, 24, { periodoS: H }), ref(c2, 48, { periodoS: H })], PARAMS);
    const h = horas(ls, comPeriodo.faixas);
    for (const x of v) expect(h.get(x.seq)).toEqual({ ms: x.ms, q: QUALIDADE.ancorada, motivo: null });

    // Referência antiga, sem o período da sessão: vale o do cadastro, e na dúvida sem hora.
    const semPeriodo = avaliarHoras(ls, [ref(c1, 24), ref(c2, 48)], PARAMS);
    expect([...semPeriodo.referencias.values()].map((s) => s.estado)).toEqual(['sem-ligada', 'sem-ligada']);
  });

  it('número da ligada, transferência que caiu e estouro depois: a referência não cai no trecho de antes', () => {
    // As leituras gravadas vão até o dia 4. A coleta do dia 6 caiu antes de a
    // leitura `seqRef` chegar, e o contador estourou no dia 5: o contador da
    // coleta é menor que o da última leitura gravada, no mesmo número de ligada.
    const v = historia(LIGOU + 4 * DIA);
    const ls = leituras(v, 'uptime', () => 7);
    const d2 = coleta(v, LIGOU + 2 * DIA, 0, { ligada: 7 });
    const d4 = coleta(v, LIGOU + 4 * DIA, 0, { ligada: 7 });
    const depoisDoEstouro = coleta(v, LIGOU + 4 * DIA, 0, {
      ligada: 7, tNode: DIA / 1000, tUtcMs: LIGOU + 6 * DIA, seqRef: v[v.length - 1].seq + 200,
    });

    const av = avaliarHoras(ls, [d2, d4, depoisDoEstouro], PARAMS);

    expect(av.referencias.get(depoisDoEstouro.id)!.estado).toBe('sem-ligada');
    expect(av.discordancias).toEqual([]);
    const h = horas(ls, av.faixas);
    for (const x of v) expect(h.get(x.seq)).toEqual({ ms: x.ms, q: QUALIDADE.ancorada, motivo: null });
  });
});

describe('conferência entre coletas (FR-009, FR-012)', () => {
  const v = historia(LIGOU + 20 * DIA);
  const ls = leituras(v);

  it('a hora usa a referência mais próxima da mesma ligada (FR-005)', () => {
    // A segunda coleta mediu o relógio 5 min adiantado: dentro da tolerância,
    // então concorda, e as leituras perto dela usam a hora dela.
    const a = coleta(v, LIGOU + 2 * DIA);
    const b = coleta(v, LIGOU + 18 * DIA, 5 * 60_000);
    const h = horas(ls, avaliarHoras(ls, [a, b], PARAMS).faixas);
    const perto = (ms: number) => v.reduce((m, x) => (Math.abs(x.ms - ms) < Math.abs(m.ms - ms) ? x : m));
    expect(h.get(perto(LIGOU + 3 * DIA).seq)).toEqual({ ms: LIGOU + 3 * DIA, q: 1, motivo: null });
    expect(h.get(perto(LIGOU + 17 * DIA).seq)!.ms).toBe(LIGOU + 17 * DIA + 5 * 60_000);
  });

  it('tolerância de 10 min + 1 % do tempo contado pelo nó: na borda concorda, 1 ms além discorda', () => {
    const intervalo = 10 * DIA;
    const tol = 10 * 60_000 + 0.01 * intervalo;
    const a = coleta(v, LIGOU + DIA);
    const naBorda = coleta(v, LIGOU + DIA + intervalo, tol);
    const alem = coleta(v, LIGOU + DIA + intervalo, tol + 1000);

    expect(avaliarHoras(ls, [a, naBorda], PARAMS).referencias.get(a.id)!.estado).toBe('conferida');
    const av = avaliarHoras(ls, [a, alem], PARAMS);
    expect(av.referencias.get(a.id)!.estado).toBe('em-conflito');
    expect(av.referencias.get(alem.id)!.estado).toBe('em-conflito');
    expect(av.discordancias).toEqual([[a.id, alem.id]]);
    // Em conflito, a hora é calculada mas estimada (FR-010).
    expect(new Set(av.faixas.map((f) => f.motivo))).toEqual(new Set(['conflito-de-hora']));
  });

  it('coleta e acerto da mesma visita não se conferem entre si', () => {
    const a = coleta(v, LIGOU + DIA);
    const acerto = { ...coleta(v, LIGOU + DIA + 3000), grupo: a.grupo, origem: 'acerto' as const };
    const av = avaliarHoras(ls, [a, acerto], PARAMS);
    expect(av.referencias.get(a.id)!.estado).toBe('nao-conferida');
  });

  it('confirmada pelo apicultor vale como conferida', () => {
    const a = coleta(v, LIGOU + DIA, 0, { confirmada: true });
    expect(avaliarHoras(ls, [a], PARAMS).faixas[0]).toMatchObject({ qualidade: 1, motivo: null });
  });

  it('celular com data antes do projeto: referência rejeitada; revogada: não vale', () => {
    const ruim = coleta(v, LIGOU + DIA, -(LIGOU + DIA - Date.UTC(2020, 0, 1)));
    const revogada = coleta(v, LIGOU + 2 * DIA, 0, { revogada: true });
    const av = avaliarHoras(ls, [ruim, revogada], PARAMS);
    expect(av.referencias.get(ruim.id)!.estado).toBe('rejeitada');
    expect(av.referencias.get(revogada.id)!.estado).toBe('revogada');
    expect(av.faixas[0]).toMatchObject({ qualidade: 3, motivo: 'ligada-sem-referencia' });
  });

  it('a hora do celular não pode voltar de uma ligada para a seguinte (D-306)', () => {
    const vr = historia(LIGOU + 10 * DIA, [LIGOU + 5 * DIA]);
    const lr = leituras(vr);
    const adiantada = coleta(vr, LIGOU + 2 * DIA, 365 * DIA); // ligada 1, celular um ano à frente
    const certa = coleta(vr, LIGOU + 8 * DIA);                // ligada 2, celular certo
    const av = avaliarHoras(lr, [adiantada, certa], PARAMS);
    expect(av.referencias.get(adiantada.id)!.estado).toBe('em-conflito');
    expect(av.referencias.get(certa.id)!.estado).toBe('em-conflito');
  });
});

describe('os três modos de tempo do nó (FR-008)', () => {
  it('sem noção de tempo: hora em branco, com motivo, mesmo com referência', () => {
    const ls: LeituraDeTempo[] = [1, 2, 3].map((seq) => ({ seq, tNode: 0, ligada: null, modo: 'none' }));
    const ref: Referencia = {
      id: 1, grupo: 1, tNode: 0, tUtcMs: LIGOU, ligada: null, seqRef: 3, modo: 'none',
      origem: 'coleta', aceita: true, revogada: false, confirmada: false,
    };
    const av = avaliarHoras(ls, [ref], PARAMS);
    expect(av.faixas).toEqual([expect.objectContaining({ refTUtcMs: null, qualidade: 3, motivo: 'sem-nocao-de-tempo' })]);
    expect(av.referencias.get(1)!.estado).toBe('rejeitada');
  });

  it('o nó carimba a hora: vale o acerto que a originou (FR-007)', () => {
    const s = (ms: number) => Math.floor(ms / 1000);
    const ls: LeituraDeTempo[] = [
      { seq: 1, tNode: 1000, ligada: null, modo: 'rtc' },                 // antes de qualquer acerto
      { seq: 2, tNode: s(LIGOU + DIA), ligada: null, modo: 'rtc' },        // depois do acerto 1
      { seq: 3, tNode: s(LIGOU + 2 * DIA), ligada: null, modo: 'rtc' },
      { seq: 4, tNode: s(LIGOU + 9 * DIA), ligada: null, modo: 'rtc' },    // depois do acerto 2
    ];
    const acerto = (id: number, seqRef: number, ms: number, extra: Partial<Referencia> = {}): Referencia => ({
      id, grupo: id, tNode: s(ms), tUtcMs: ms, ligada: null, seqRef, modo: 'rtc',
      origem: 'acerto', aceita: true, revogada: false, confirmada: false, ...extra,
    });
    const av = avaliarHoras(ls, [acerto(1, 1, LIGOU + 1000), acerto(2, 3, LIGOU + 8 * DIA, { revogada: true })], PARAMS);
    const h = horas(ls, av.faixas);
    expect(h.get(1)).toMatchObject({ ms: null, motivo: 'hora-do-no-sem-acerto' });
    expect(h.get(2)).toEqual({ ms: LIGOU + DIA, q: 2, motivo: 'referencia-nao-conferida' });
    expect(h.get(3)!.ms).toBe(LIGOU + 2 * DIA);
    expect(h.get(4)).toEqual({ ms: null, q: 3, motivo: 'acerto-revogado' });
  });

  it('o nó que carimba a hora: a coleta confere com o último acerto, e só com ele', () => {
    const s = (ms: number) => Math.floor(ms / 1000);
    const t1 = LIGOU + DIA;
    const t2 = LIGOU + 5 * DIA;
    const ls: LeituraDeTempo[] = [
      { seq: 1, tNode: 500, ligada: null, modo: 'rtc' },              // relógio ainda em 1970
      { seq: 2, tNode: s(t1 + HORA_MS), ligada: null, modo: 'rtc' },
      { seq: 3, tNode: s(t2 + HORA_MS), ligada: null, modo: 'rtc' },
    ];
    const ref = (id: number, grupo: number, origem: 'coleta' | 'acerto', seqRef: number, tNode: number, tUtcMs: number): Referencia => ({
      id, grupo, tNode, tUtcMs, ligada: null, seqRef, modo: 'rtc', origem,
      aceita: true, revogada: false, confirmada: false,
    });
    const certo = (erro: number) => [
      ref(1, 1, 'coleta', 1, 600, t1),                 // nó nunca acertado: não serve de referência
      ref(2, 1, 'acerto', 1, s(t1 + erro), t1 + erro), // o celular manda a hora dele
      // Quatro dias depois o relógio do nó andou 4 dias (+ 30 s de deriva) desde o acerto.
      ref(3, 3, 'coleta', 2, s(t1 + erro) + 4 * 86_400 + 30, t2),
      ref(4, 3, 'acerto', 2, s(t2), t2),
    ];

    const av = avaliarHoras(ls, certo(0), PARAMS);
    expect(av.referencias.get(1)!.estado).toBe('rejeitada');
    expect([2, 3, 4].map((id) => av.referencias.get(id)!.estado)).toEqual(['conferida', 'conferida', 'conferida']);
    expect(horas(ls, av.faixas).get(2)).toEqual({ ms: t1 + HORA_MS, q: 1, motivo: null });

    // Dois acertos sozinhos são a hora do celular contra ela mesma: não conferem nada.
    const soAcertos = avaliarHoras(ls, certo(0).filter((r) => r.id !== 3), PARAMS);
    expect(soAcertos.referencias.get(2)!.estado).toBe('nao-conferida');

    // O celular estava um ano adiantado no primeiro acerto: a coleta seguinte acusa.
    const errado = avaliarHoras(ls, certo(365 * DIA), PARAMS);
    expect(errado.referencias.get(2)!.estado).toBe('em-conflito');
    expect(errado.referencias.get(3)!.estado).toBe('em-conflito');
  });

  it('número da ligada no nó: a referência vai para a ligada do mesmo número', () => {
    const v = historia(LIGOU + 4 * DIA, [LIGOU + 2 * DIA]);
    const numero = (x: Verdade) => (x.ligouEm === LIGOU ? 7 : 8);
    const ls = leituras(v, 'uptime', numero);
    // Referência da ligada 7 tirada com seqRef de uma leitura da 8 (por exemplo,
    // um transporte que só soube o número): vale o número.
    const ref = { ...coleta(v, LIGOU + DIA), ligada: 7, seqRef: v[v.length - 1].seq };
    const h = horas(ls, avaliarHoras(ls, [ref], PARAMS).faixas);
    expect(h.get(v[0].seq)!.ms).toBe(v[0].ms);
    expect(h.get(v[v.length - 1].seq)!.q).toBe(QUALIDADE.desconhecida);
  });

  it('número da ligada e estouro do contador: cada coleta fica no trecho dela, sem conflito falso', () => {
    // Mesma ligada (número 7) o tempo todo; o contador estoura no dia 5 e recomeça.
    const estouro = LIGOU + 5 * DIA;
    const v = historia(LIGOU + 9 * DIA, [estouro]);
    const ls = leituras(v, 'uptime', () => 7);
    const antes1 = coleta(v, LIGOU + 2 * DIA, 0, { ligada: 7 });
    const antes2 = coleta(v, LIGOU + 4 * DIA, 0, { ligada: 7 });
    const depois1 = coleta(v, LIGOU + 7 * DIA, 0, { ligada: 7 });
    const depois2 = coleta(v, LIGOU + 9 * DIA, 0, { ligada: 7 });

    const av = avaliarHoras(ls, [antes1, antes2, depois1, depois2], PARAMS);

    expect(av.discordancias).toEqual([]);
    expect([antes1, antes2, depois1, depois2].map((r) => av.referencias.get(r.id)!.estado))
      .toEqual(['conferida', 'conferida', 'conferida', 'conferida']);
    const h = horas(ls, av.faixas);
    for (const x of v) expect(h.get(x.seq)).toEqual({ ms: x.ms, q: QUALIDADE.ancorada, motivo: null });
  });

  it('número da ligada só na sessão, não nas leituras: vale o contador, não "sem hora"', () => {
    const v = historia(LIGOU + 4 * DIA);
    const ls = leituras(v); // as leituras não trazem o número
    const refs = [coleta(v, LIGOU + DIA, 0, { ligada: 3 }), coleta(v, LIGOU + 4 * DIA, 0, { ligada: 3 })];
    const h = horas(ls, avaliarHoras(ls, refs, PARAMS).faixas);
    for (const x of v) expect(h.get(x.seq)).toEqual({ ms: x.ms, q: QUALIDADE.ancorada, motivo: null });
  });
});
