/**
 * Construtor da série do gráfico a partir dos resumos diários.
 *
 * Duas regras do Princípio VI viram código aqui:
 *
 *  1. LACUNA É LACUNA (FR-027). O servidor só devolve os dias que têm linha; o
 *     dia sem leitura válida chega como elemento AUSENTE. Juntar as linhas lado
 *     a lado ("zip") ligaria a segunda-feira à quinta como se fossem vizinhas.
 *     Por isso a série percorre o CALENDÁRIO, um índice por dia, e o dia sem
 *     linha vira `null` — que o uPlot desenha como falha na linha.
 *
 *  2. NENHUMA LINHA ATRAVESSA A TROCA DE SENSOR (FR-028). Cada par (nó sensor,
 *     época) vira uma trilha própria, com `null` fora dela. Duas trilhas nunca
 *     se ligam, nem quando a troca acontece no meio de um dia (aí o mesmo dia
 *     tem uma linha em cada época, e cada uma fica na sua trilha).
 */
import type { ResumoDiario } from '../dados/porta';
import { diasDoIntervalo } from './calendario';

export interface Trilha {
  noId: string;
  epoca: number;
  /** Primeiro dia, dentro do intervalo, em que a trilha tem linha. */
  primeiroDia: number;
}

export interface TrilhaSerie extends Trilha {
  /** Um valor por dia de `Serie.dias`. `null` = sem dado neste dia nesta trilha. */
  y: (number | null)[];
}

export interface Serie {
  /** Todos os dias do intervalo, sem pular nenhum. */
  dias: number[];
  trilhas: TrilhaSerie[];
}

function chave(noId: string, epoca: number): string {
  return `${noId}\u0000${epoca}`;
}

/** Linhas dentro do intervalo, agrupadas por trilha e em ordem de primeira aparição. */
export function agruparPorTrilha(
  resumos: ResumoDiario[], deDia: number, ateDia: number,
): { trilha: Trilha; linhas: Map<number, ResumoDiario> }[] {
  const grupos = new Map<string, { trilha: Trilha; linhas: Map<number, ResumoDiario> }>();
  for (const r of resumos) {
    if (r.dia < deDia || r.dia > ateDia) continue;
    const k = chave(r.noId, r.epocaSensor);
    let g = grupos.get(k);
    if (!g) {
      g = { trilha: { noId: r.noId, epoca: r.epocaSensor, primeiroDia: r.dia }, linhas: new Map() };
      grupos.set(k, g);
    }
    if (g.linhas.has(r.dia)) {
      // A chave do resumo no servidor é (nó, dia, época). Duas linhas aqui
      // seriam dado corrompido; escolher uma em silêncio esconderia isso.
      throw new Error(`resumo diário duplicado: ${r.noId} dia ${r.dia} época ${r.epocaSensor}`);
    }
    g.linhas.set(r.dia, r);
    if (r.dia < g.trilha.primeiroDia) g.trilha.primeiroDia = r.dia;
  }
  return [...grupos.values()].sort(
    (a, b) =>
      a.trilha.primeiroDia - b.trilha.primeiroDia
      || a.trilha.noId.localeCompare(b.trilha.noId)
      || a.trilha.epoca - b.trilha.epoca,
  );
}

/**
 * Monta a série de uma grandeza. `valor` extrai o número do resumo (ou null,
 * quando o resumo existe mas aquela grandeza não teve leitura válida).
 */
export function montarSerie(
  resumos: ResumoDiario[],
  deDia: number,
  ateDia: number,
  valor: (r: ResumoDiario) => number | null,
): Serie {
  const dias = diasDoIntervalo(deDia, ateDia);
  const trilhas = agruparPorTrilha(resumos, deDia, ateDia).map(({ trilha, linhas }) => ({
    ...trilha,
    y: dias.map((d) => {
      const r = linhas.get(d);
      return r ? valor(r) : null;
    }),
  }));
  return { dias, trilhas };
}

/** Dias do intervalo sem nenhuma linha de resumo, em nenhuma trilha. */
export function diasSemLeitura(resumos: ResumoDiario[], deDia: number, ateDia: number): number {
  const comLinha = new Set<number>();
  for (const r of resumos) if (r.dia >= deDia && r.dia <= ateDia) comLinha.add(r.dia);
  return ateDia - deDia + 1 - comLinha.size;
}

/**
 * Dias em que uma trilha começa SUBSTITUINDO outra: época nova do mesmo nó
 * sensor, ou nó sensor novo que entra depois que os anteriores pararam.
 *
 * Dois nós ao mesmo tempo na mesma colmeia (posições diferentes na caixa) não
 * são troca: cada um é uma série própria, e dizer "troca de sensor" ali seria
 * afirmar na tela uma coisa que não aconteceu.
 */
export function trocasDeSensor(resumos: ResumoDiario[], deDia: number, ateDia: number): number[] {
  const grupos = agruparPorTrilha(resumos, deDia, ateDia).map(({ trilha, linhas }) => ({
    trilha,
    ultimoDia: Math.max(...linhas.keys()),
  }));
  const dias = new Set<number>();
  grupos.forEach((g, i) => {
    const anteriores = grupos.slice(0, i);
    if (anteriores.length === 0) return;
    const epocaNovaDoMesmoNo = anteriores.some((a) => a.trilha.noId === g.trilha.noId);
    const noNovoDepoisDosOutros = anteriores.every(
      (a) => a.trilha.primeiroDia < g.trilha.primeiroDia && a.ultimoDia <= g.trilha.primeiroDia,
    );
    if (epocaNovaDoMesmoNo || noNovoDepoisDosOutros) dias.add(g.trilha.primeiroDia);
  });
  return [...dias].sort((a, b) => a - b);
}

/**
 * Agregado do período por trilha, só com o que se tira EXATO dos resumos
 * diários: menor das mínimas, maior das máximas, faixa das médias diárias e
 * somas de contagens. Nenhuma "média das médias", que pesaria igual um dia de
 * 3 leituras e um de 96. A contagem de excluídas vai junto (FR-029).
 */
export interface AgregadoTrilha extends Trilha {
  diasComLinha: number;
  tempMenorC100: number | null;
  tempMaiorC100: number | null;
  umidMediaMenorX100: number | null;
  umidMediaMaiorX100: number | null;
  validas: number;
  excluidas: number;
}

function menor(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function maior(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

export function agregarPorTrilha(
  resumos: ResumoDiario[], deDia: number, ateDia: number,
): AgregadoTrilha[] {
  return agruparPorTrilha(resumos, deDia, ateDia).map(({ trilha, linhas }) => {
    const a: AgregadoTrilha = {
      ...trilha,
      diasComLinha: linhas.size,
      tempMenorC100: null,
      tempMaiorC100: null,
      umidMediaMenorX100: null,
      umidMediaMaiorX100: null,
      validas: 0,
      excluidas: 0,
    };
    for (const r of linhas.values()) {
      a.tempMenorC100 = menor(a.tempMenorC100, r.tempMinC100);
      a.tempMaiorC100 = maior(a.tempMaiorC100, r.tempMaxC100);
      a.umidMediaMenorX100 = menor(a.umidMediaMenorX100, r.umidMedX100);
      a.umidMediaMaiorX100 = maior(a.umidMediaMaiorX100, r.umidMedX100);
      a.validas += r.validas;
      a.excluidas += r.excluidas;
    }
    return a;
  });
}
