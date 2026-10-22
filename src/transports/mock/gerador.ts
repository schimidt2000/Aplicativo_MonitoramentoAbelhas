/**
 * Gera uma série sintética plausível de colmeia. Determinístico: a mesma
 * semente produz sempre os mesmos dados, o que torna os testes reproduzíveis.
 */
import type { Reading } from '@/core/ports/transport';

/** PRNG determinístico (mulberry32). Nunca usar Math.random aqui. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PerfilColmeia {
  /** Temperatura média do ninho em °C. */
  tempBase: number;
  /** Amplitude diária em °C. */
  tempAmp: number;
  rhBase: number;
  tvocBase: number;
  /** Tensão inicial da bateria, em mV. */
  battMv: number;
  /** Queda de tensão por dia, em mV. */
  battQuedaDia: number;
}

export const PERFIL_SAUDAVEL: PerfilColmeia = {
  tempBase: 34.6, tempAmp: 0.5, rhBase: 62, tvocBase: 900,
  battMv: 4050, battQuedaDia: 4,
};

export const PERFIL_QUENTE: PerfilColmeia = {
  tempBase: 37.2, tempAmp: 2.4, rhBase: 55, tvocBase: 1600,
  battMv: 3720, battQuedaDia: 6,
};

export const PERFIL_FRACO: PerfilColmeia = {
  tempBase: 31.0, tempAmp: 4.5, rhBase: 70, tvocBase: 420,
  battMv: 3450, battQuedaDia: 9,
};

export interface OpcoesGeracao {
  dias: number;
  periodoS: number;
  perfil: PerfilColmeia;
  seed: number;
  /** Insere lacunas no contador — normais, o Princípio III exige tolerá-las. */
  comLacunas?: boolean;
  /** Insere amostras com gasStatus 1/2/3, que ficam fora dos resumos. */
  comInvalidas?: boolean;
  /** Quantas leituras gerar. Sem isto, `dias` × leituras por dia. */
  quantidade?: number;
  /**
   * A placa perdeu energia e religou: a partir desta leitura (índice) o
   * contador de tempo recomeça do zero. O número da leitura continua, com um
   * salto de 64 — o nó persiste `seq` em blocos (suposição da pergunta 5).
   */
  reinicioEm?: number;
  /** Nó sem noção de tempo nenhuma: o contador vem sempre 0 (FR-016). */
  semTempo?: boolean;
}

export function gerarSerie(o: OpcoesGeracao): Reading[] {
  const rand = rng(o.seed);
  const porDia = Math.floor(86400 / o.periodoS);
  const total = o.quantidade ?? o.dias * porDia;
  const reinicio = o.reinicioEm !== undefined && o.reinicioEm > 0 && o.reinicioEm < total
    ? o.reinicioEm : undefined;
  const out: Reading[] = [];

  let seq = 1;
  for (let i = 0; i < total; i++) {
    // Lacuna ocasional no contador: o nó persiste `seq` em blocos e salta no boot.
    if (o.comLacunas && i > 0 && i % 331 === 0) seq += 64;
    if (i === reinicio) seq += 64;

    let tNode = i * o.periodoS;
    if (reinicio !== undefined && i >= reinicio) tNode = (i - reinicio) * o.periodoS;
    if (o.semTempo) tNode = 0;
    const horaDoDia = ((i % porDia) / porDia) * 2 * Math.PI;
    const diaFrac = i / porDia;

    // Ciclo diário + ruído. O ninho é termorregulado: amplitude pequena.
    const temp = o.perfil.tempBase + Math.sin(horaDoDia - 1.2) * o.perfil.tempAmp
      + (rand() - 0.5) * 0.35;
    const rh = o.perfil.rhBase - Math.sin(horaDoDia - 1.2) * 6 + (rand() - 0.5) * 3;
    // Voláteis acompanham a atividade da colônia, com pico no meio do dia.
    const tvoc = o.perfil.tvocBase * (1 + 0.45 * Math.sin(horaDoDia - 0.6))
      + (rand() - 0.5) * 120;
    const batt = o.perfil.battMv - diaFrac * o.perfil.battQuedaDia;

    // Estado de validade do sensor de gás: 1 aquecendo, 2 partida inicial, 3 fora de faixa.
    let gasStatus = 0;
    if (o.comInvalidas) {
      if (i < 4) gasStatus = 2;                 // condicionamento inicial
      else if (i % porDia === 0) gasStatus = 1; // aquecimento após ciclo
      else if (rand() < 0.004) gasStatus = 3;   // saturação pontual
    }
    const gasValido = gasStatus === 0;

    out.push({
      seq: seq++,
      tNode,
      tempC100: Math.round(temp * 100),
      rhX100: Math.round(Math.max(0, Math.min(100, rh)) * 100),
      tvocPpb: gasValido ? Math.max(0, Math.round(tvoc)) : null,
      eco2Ppm: gasValido ? Math.max(400, Math.round(400 + tvoc * 0.9)) : null,
      aqiUba: gasValido ? Math.min(5, Math.max(1, Math.round(1 + tvoc / 700))) : null,
      gasStatus,
      battMv: Math.round(batt),
      flags: 0,
    });
  }
  return out;
}
