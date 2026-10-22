/**
 * Fonte de demonstração: colmeias, apicultores e leituras INVENTADOS, gerados
 * no navegador de forma determinística. Usada quando o painel não tem
 * configuração de servidor. Toda tela mostra a faixa "Dados de demonstração".
 *
 * Os casos difíceis estão aqui de propósito, para que cada regra do Princípio
 * VI apareça na tela e não só nos testes:
 *  - lacuna de 3 dias com o nó sensor desligado (Uruçu 1);
 *  - dias em que TODAS as leituras foram excluídas pelo sensor de gás: há
 *    leitura, mas não há resumo, e o gráfico mostra lacuna (Caixa 01);
 *  - troca de sensor no meio de um dia, com nível de voláteis diferente na
 *    época nova (Jandaíra 2);
 *  - correção de temperatura do nó e trecho com hora estimada (Caixa 02);
 *  - colmeia sem nenhuma leitura (Colmeia B) e colmeias com dado antigo;
 *  - um meliponicultor (sem ferrão) e apicultores (Apis), com níveis absolutos
 *    de voláteis muito diferentes entre colmeias — que é exatamente o motivo de
 *    o painel não compará-los.
 *
 * O resumo diário é calculado das leituras com a MESMA regra do celular e do
 * servidor (`recalcularResumos` em src/data/ingest.ts e `private.recalc_daily`
 * no servidor): o gráfico e a planilha da demonstração contam a mesma história.
 */
import { MS_DIA, diaDeMs } from '../dominio/calendario';
import {
  amostraExcluida,
  type ColmeiaMacro, type FontePainel, type LeituraPainel, type NoSensorPainel,
  type QualidadeHora, type ResumoDiario, type Sessao,
} from './porta';

/** Uma leitura a cada 15 minutos, como o nó sensor por padrão (period_s = 900). */
const PASSO_MS = 900_000;

/** Modelo informado verbalmente pela equipe do firmware (docs/integracao-firmware.md). */
const MODELO_DEMO = 'AHT21 + ENS160 (informado, não confirmado)';

interface Cenario {
  id: string;
  nome: string;
  apicultor: string;
  local: string;
  criacao: ColmeiaMacro['criacao'];
  municipio: string;
  uf: string;
  /** Sem nó: colmeia cadastrada que nunca enviou leitura. */
  no: string | null;
  /** Dias de histórico. */
  dias: number;
  /** Dias entre a última leitura e hoje. */
  atraso: number;
  tempC100: number;
  tempAmpC100: number;
  umidX100: number;
  tvocPpb: number;
  correcaoC100?: number;
  /** Dias (contados a partir de hoje, para trás) com o nó desligado. */
  desligado?: [number, number];
  /** Dias (a partir de hoje, para trás) em que o sensor de gás invalida tudo. */
  gasInvalido?: [number, number];
  /** Troca de sensor: dias atrás e hora UTC do dia. Época nova com outro nível. */
  troca?: { diasAtras: number; hora: number; tvocPpb: number; tempDeltaC100: number };
  /** Dias (a partir de hoje, para trás) com hora estimada. */
  horaEstimada?: [number, number];
  /** Dia (para trás) com pico de voláteis: manejo ou colheita. */
  pico?: number;
}

const CENARIOS: Cenario[] = [
  {
    id: 'demo-mel-01', nome: 'Jandaíra 1', apicultor: 'Meliponicultor de demonstração B',
    local: 'Meliponário Pé de Serra', criacao: 'meliponineo', municipio: 'Mossoró', uf: 'RN',
    no: 'DEMO-N01', dias: 120, atraso: 1, tempC100: 3050, tempAmpC100: 160,
    umidX100: 7000, tvocPpb: 420, pico: 12,
  },
  {
    id: 'demo-mel-02', nome: 'Jandaíra 2', apicultor: 'Meliponicultor de demonstração B',
    local: 'Meliponário Pé de Serra', criacao: 'meliponineo', municipio: 'Mossoró', uf: 'RN',
    no: 'DEMO-N02', dias: 120, atraso: 1, tempC100: 3010, tempAmpC100: 180,
    umidX100: 6800, tvocPpb: 380,
    troca: { diasAtras: 20, hora: 13, tvocPpb: 950, tempDeltaC100: 60 },
  },
  {
    id: 'demo-mel-03', nome: 'Uruçu 1', apicultor: 'Meliponicultor de demonstração B',
    local: 'Meliponário Pé de Serra', criacao: 'meliponineo', municipio: 'Mossoró', uf: 'RN',
    no: 'DEMO-N03', dias: 90, atraso: 2, tempC100: 3120, tempAmpC100: 140,
    umidX100: 7300, tvocPpb: 610, desligado: [10, 8],
  },
  {
    id: 'demo-api-01', nome: 'Caixa 01', apicultor: 'Apicultor de demonstração C',
    local: 'Apiário Serra Branca', criacao: 'apis', municipio: 'Picos', uf: 'PI',
    no: 'DEMO-N04', dias: 120, atraso: 0, tempC100: 3460, tempAmpC100: 60,
    umidX100: 5800, tvocPpb: 1500, gasInvalido: [15, 14], pico: 5,
  },
  {
    id: 'demo-api-02', nome: 'Caixa 02', apicultor: 'Apicultor de demonstração C',
    local: 'Apiário Serra Branca', criacao: 'apis', municipio: 'Picos', uf: 'PI',
    no: 'DEMO-N05', dias: 100, atraso: 4, tempC100: 3480, tempAmpC100: 70,
    umidX100: 5600, tvocPpb: 1320, correcaoC100: -50, horaEstimada: [40, 35],
  },
  {
    id: 'demo-api-03', nome: 'Caixa 03', apicultor: 'Apicultor de demonstração C',
    local: 'Apiário Serra Branca', criacao: 'apis', municipio: 'Picos', uf: 'PI',
    no: 'DEMO-N06', dias: 60, atraso: 26, tempC100: 3420, tempAmpC100: 90,
    umidX100: 6000, tvocPpb: 980,
  },
  {
    id: 'demo-api-04', nome: 'Colmeia A', apicultor: 'Apicultora de demonstração A',
    local: 'Apiário Lagoa Seca', criacao: 'apis', municipio: 'Petrolina', uf: 'PE',
    no: 'DEMO-N07', dias: 45, atraso: 70, tempC100: 3440, tempAmpC100: 80,
    umidX100: 5400, tvocPpb: 2100,
  },
  {
    id: 'demo-api-05', nome: 'Colmeia B', apicultor: 'Apicultora de demonstração A',
    local: 'Apiário Lagoa Seca', criacao: 'apis', municipio: 'Petrolina', uf: 'PE',
    no: null, dias: 0, atraso: 0, tempC100: 0, tempAmpC100: 0, umidX100: 0, tvocPpb: 0,
  },
];

/** PRNG pequeno e determinístico (mulberry32). Mesma semente, mesmos números. */
function prng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sementeDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

function dentro(diasAtras: number, faixa?: [number, number]): boolean {
  return faixa !== undefined && diasAtras <= faixa[0] && diasAtras >= faixa[1];
}

/** Gera as leituras de um cenário. Exportado para os testes. */
export function gerarLeituras(c: Cenario, hojeDia: number): LeituraPainel[] {
  if (c.no === null || c.dias === 0) return [];
  const aleatorio = prng(sementeDe(c.id));
  const ultimoDia = hojeDia - c.atraso;
  const inicioMs = (ultimoDia - c.dias + 1) * MS_DIA;
  // A última leitura cai no meio da tarde do último dia.
  const fimMs = ultimoDia * MS_DIA + 15 * 3_600_000;
  const trocaMs = c.troca ? (hojeDia - c.troca.diasAtras) * MS_DIA + c.troca.hora * 3_600_000 : null;

  const saida: LeituraPainel[] = [];
  let seq = 0;
  for (let t = inicioMs; t <= fimMs; t += PASSO_MS) {
    seq++;
    // Lacuna de seq é normal (Princípio III): de vez em quando o nó pula um número.
    if (aleatorio() < 0.002) seq++;
    const dia = diaDeMs(t);
    const diasAtras = hojeDia - dia;
    if (dentro(diasAtras, c.desligado)) continue;

    const novaEpoca = trocaMs !== null && t >= trocaMs;
    const epoca = novaEpoca ? 2 : 1;
    const fracaoDia = (t - dia * MS_DIA) / MS_DIA;
    // Ciclo diário: mais quente à tarde (UTC-3 ≈ 18h UTC).
    const ciclo = Math.sin(2 * Math.PI * (fracaoDia - 0.5));
    const ruido = () => (aleatorio() - 0.5) * 2;

    const tempBase = c.tempC100 + (novaEpoca ? c.troca!.tempDeltaC100 : 0);
    const temp = aleatorio() < 0.003
      ? null
      : Math.round(tempBase + c.tempAmpC100 * ciclo + 30 * ruido());
    const umid = Math.min(10000, Math.max(0, Math.round(c.umidX100 - 700 * ciclo + 150 * ruido())));

    let tvocBase = novaEpoca ? c.troca!.tvocPpb : c.tvocPpb;
    if (c.pico !== undefined && diasAtras === c.pico) tvocBase *= 1.8;
    const tvoc = Math.max(0, Math.round(tvocBase * (1 + 0.2 * ciclo + 0.08 * ruido())));

    // Situação do sensor de gás: 0 = válida. Aquecimento depois da troca,
    // dias de gás inválido e falhas esparsas marcam amostra excluída.
    let gas = 0;
    if (dentro(diasAtras, c.gasInvalido)) gas = 1;
    else if (novaEpoca && t - trocaMs! < 6 * 3_600_000) gas = 1;
    else if (aleatorio() < 0.02) gas = 1 + Math.floor(aleatorio() * 3);

    const qualidade: QualidadeHora = dentro(diasAtras, c.horaEstimada) ? 'estimada' : 'ancorada';

    saida.push({
      colmeiaId: c.id,
      noId: c.no,
      seq,
      tUtcMs: t,
      qualidadeHora: qualidade,
      epocaSensor: epoca,
      versaoFormato: 1,
      tempC100: temp,
      umidX100: umid,
      tvocPpb: tvoc,
      eco2Ppm: Math.round(400 + tvoc * 0.55),
      situacaoGas: gas,
    });
  }
  return saida;
}

/**
 * Resumo diário com a regra do celular e do servidor:
 *  - grupo por (nó, dia UTC, época);
 *  - temperatura e umidade: todas as leituras com valor, MIN / média truncada / MAX;
 *  - voláteis: só situação 0;
 *  - válidas = situação 0 ou nula; excluídas = situação diferente de 0;
 *  - sem nenhuma válida, o dia NÃO gera linha (é a lacuna);
 *  - leitura sem hora fica fora.
 */
export function resumir(leituras: LeituraPainel[]): ResumoDiario[] {
  interface Acc {
    noId: string; dia: number; epoca: number;
    temps: number[]; umids: number[]; tvocs: number[]; validas: number; excluidas: number;
  }
  const grupos = new Map<string, Acc>();
  for (const l of leituras) {
    if (l.tUtcMs === null) continue;
    const dia = diaDeMs(l.tUtcMs);
    const k = `${l.noId}|${dia}|${l.epocaSensor}`;
    let g = grupos.get(k);
    if (!g) {
      g = { noId: l.noId, dia, epoca: l.epocaSensor, temps: [], umids: [], tvocs: [], validas: 0, excluidas: 0 };
      grupos.set(k, g);
    }
    if (l.tempC100 !== null) g.temps.push(l.tempC100);
    if (l.umidX100 !== null) g.umids.push(l.umidX100);
    if (l.situacaoGas === 0 && l.tvocPpb !== null) g.tvocs.push(l.tvocPpb);
    if (amostraExcluida(l.situacaoGas)) g.excluidas++;
    else g.validas++;
  }
  const media = (v: number[]) => (v.length === 0 ? null : Math.trunc(v.reduce((a, b) => a + b, 0) / v.length));
  const saida: ResumoDiario[] = [];
  for (const g of grupos.values()) {
    if (g.validas === 0) continue;
    saida.push({
      noId: g.noId,
      dia: g.dia,
      epocaSensor: g.epoca,
      tempMinC100: g.temps.length ? Math.min(...g.temps) : null,
      tempMedC100: media(g.temps),
      tempMaxC100: g.temps.length ? Math.max(...g.temps) : null,
      umidMedX100: media(g.umids),
      tvocMedPpb: media(g.tvocs),
      validas: g.validas,
      excluidas: g.excluidas,
    });
  }
  return saida.sort((a, b) => a.noId.localeCompare(b.noId) || a.dia - b.dia || a.epocaSensor - b.epocaSensor);
}

export interface ConjuntoDemo {
  cenarios: readonly Cenario[];
  leiturasDe(colmeiaId: string): LeituraPainel[];
  resumosDe(colmeiaId: string): ResumoDiario[];
  macro(): ColmeiaMacro[];
  nos(): NoSensorPainel[];
}

export function criarConjuntoDemo(hojeDia: number): ConjuntoDemo {
  const leituras = new Map<string, LeituraPainel[]>();
  const resumos = new Map<string, ResumoDiario[]>();
  const porId = new Map(CENARIOS.map((c) => [c.id, c]));

  function leiturasDe(id: string): LeituraPainel[] {
    let l = leituras.get(id);
    if (!l) {
      const c = porId.get(id);
      l = c ? gerarLeituras(c, hojeDia) : [];
      leituras.set(id, l);
    }
    return l;
  }

  function resumosDe(id: string): ResumoDiario[] {
    let r = resumos.get(id);
    if (!r) {
      r = resumir(leiturasDe(id));
      resumos.set(id, r);
    }
    return r;
  }

  return {
    cenarios: CENARIOS,
    leiturasDe,
    resumosDe,
    macro: () =>
      CENARIOS.map((c) => {
        const ls = leiturasDe(c.id);
        let ultima: number | null = null;
        let excluidas = 0;
        for (const l of ls) {
          if (l.tUtcMs !== null && (ultima === null || l.tUtcMs > ultima)) ultima = l.tUtcMs;
          if (amostraExcluida(l.situacaoGas)) excluidas++;
        }
        return {
          colmeiaId: c.id,
          colmeiaNome: c.nome,
          apicultorNome: c.apicultor,
          localNome: c.local,
          criacao: c.criacao,
          municipio: c.municipio,
          uf: c.uf,
          ultimaLeituraMs: ultima,
          leituras: ls.length,
          excluidas,
        };
      }),
    nos: () =>
      CENARIOS.filter((c) => c.no !== null).map((c) => ({
        noId: c.no!,
        colmeiaId: c.id,
        correcaoTempC100: c.correcaoC100 ?? 0,
        modeloSensor: MODELO_DEMO,
      })),
  };
}

export function criarFonteDemo(hojeDia: number): FontePainel {
  const conjunto = criarConjuntoDemo(hojeDia);
  let sessao: Sessao | null = null;

  return {
    modo: 'demonstracao',
    async sessaoAtual() {
      return sessao;
    },
    async entrar() {
      sessao = { email: null };
      return { ok: true, sessao };
    },
    async sair() {
      sessao = null;
    },
    async visaoGeral() {
      return conjunto.macro();
    },
    async colmeia(colmeiaId) {
      return conjunto.macro().find((c) => c.colmeiaId === colmeiaId) ?? null;
    },
    async nosSensores(colmeiaIds) {
      const ids = new Set(colmeiaIds);
      return conjunto.nos().filter((n) => ids.has(n.colmeiaId));
    },
    async resumosDiarios(colmeiaId, deDia, ateDia) {
      return conjunto.resumosDe(colmeiaId).filter((r) => r.dia >= deDia && r.dia <= ateDia);
    },
    async leituras(colmeiaIds, deMs, ateMs, limite) {
      const saida: LeituraPainel[] = [];
      for (const id of colmeiaIds) {
        for (const l of conjunto.leiturasDe(id)) {
          if (l.tUtcMs === null || l.tUtcMs < deMs || l.tUtcMs >= ateMs) continue;
          saida.push(l);
          if (saida.length > limite) return saida;
        }
      }
      return saida;
    },
  };
}
