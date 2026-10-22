/**
 * O relógio do celular é a ÚNICA fonte de hora absoluta do sistema: o nó não
 * tem relógio próprio confiável (ver docs/integracao-firmware.md). Por isso,
 * antes de usar a hora do celular — para ancorar leituras ou para enviá-la ao
 * nó — conferimos se ela é plausível.
 *
 * Por que isso importa: a leitura é imutável (Princípio III). Uma hora errada
 * gravada hoje não pode ser corrigida com UPDATE amanhã, e uma hora errada
 * enviada ao nó contamina o relógio dele até a próxima coleta.
 */

/**
 * 01/09/2026, início do projeto. Qualquer hora anterior é impossível — é o que
 * aparelho com a pilha do relógio morta mostra ao ligar (1970 ou 2000).
 */
export const INICIO_DO_PROJETO_MS = Date.UTC(2026, 8, 1);

/** Tolerância para o relógio andar para trás entre duas coletas (ajuste de rede). */
export const TOLERANCIA_RETROCESSO_MS = 10 * 60_000;

/**
 * Conferência entre duas coletas da mesma ligada (feature 003, FR-009): o tempo
 * que passou segundo o celular e segundo o contador do nó pode divergir até
 * 10 min + 1 % do intervalo. PROVISÓRIA: o oscilador do ESP32 pode derivar mais
 * em sono profundo; o número certo sai da sessão de teste com o firmware.
 *
 * O intervalo é o contado pelo NÓ. Com o celular um ano adiantado, 1 % do
 * intervalo do celular daria 3,6 dias de folga e esconderia o erro.
 */
export const TOLERANCIA_CONFERENCIA_BASE_MS = 10 * 60_000;
export const TOLERANCIA_CONFERENCIA_PROPORCAO = 0.01;

export function toleranciaDaConferenciaMs(decorridoNoNoMs: number): number {
  return TOLERANCIA_CONFERENCIA_BASE_MS
    + TOLERANCIA_CONFERENCIA_PROPORCAO * Math.abs(decorridoNoNoMs);
}

export type MotivoRelogioSuspeito = 'antes-do-projeto' | 'voltou-no-tempo';

export type AvaliacaoRelogio =
  | { plausivel: true }
  | { plausivel: false; motivo: MotivoRelogioSuspeito };

/**
 * @param agoraMs hora atual do celular, em ms UTC.
 * @param ultimaAncoraConfiavelMs hora da última âncora confiável gravada para
 *   este nó. Se agora é anterior a ela, o relógio do celular andou para trás.
 */
export function avaliarRelogioDoCelular(
  agoraMs: number,
  ultimaAncoraConfiavelMs: number | null,
): AvaliacaoRelogio {
  if (!Number.isFinite(agoraMs) || agoraMs < INICIO_DO_PROJETO_MS) {
    return { plausivel: false, motivo: 'antes-do-projeto' };
  }
  if (
    ultimaAncoraConfiavelMs !== null
    && agoraMs < ultimaAncoraConfiavelMs - TOLERANCIA_RETROCESSO_MS
  ) {
    return { plausivel: false, motivo: 'voltou-no-tempo' };
  }
  return { plausivel: true };
}
