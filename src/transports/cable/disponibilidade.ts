/**
 * Dá para ler a placa pelo cabo aqui? Puro: recebe o ambiente como parâmetro,
 * para ser testado sem navegador. Quem lê o ambiente de verdade é ./index.ts.
 *
 * A ordem das perguntas importa, porque cada motivo tem uma solução diferente
 * e a tela diz qual (FR-016):
 *  1. app instalado no celular — não existe porta serial; a coleta é pela
 *     tela Coletar;
 *  2. navegador de celular — decisão conservadora (plan.md, D-8): a tela é de
 *     bancada, no computador, e a leitura pelo cabo no celular não foi testada;
 *  3. endereço não seguro — o navegador esconde a porta serial fora de
 *     `https` e de `localhost`; a solução é o endereço, não o navegador;
 *  4. navegador sem porta serial (Firefox, Safari) — abrir no Chrome ou Edge.
 */

import type { MotivoSemCabo } from '@/core/bancada/mensagens';

export type { MotivoSemCabo };

export type DisponibilidadeDoCabo = { ok: true } | { ok: false; motivo: MotivoSemCabo };

export interface AmbienteDoCabo {
  /** `Platform.OS`: 'web', 'android', 'ios'… */
  plataforma: string;
  temPortaSerial: boolean;
  contextoSeguro: boolean;
  userAgent: string;
  /** `navigator.userAgentData.mobile`, quando o navegador informa. */
  celularPelaDica?: boolean;
}

const UA_DE_CELULAR = /Android|iPhone|iPad|iPod|Mobile/i;

export function disponibilidadeDoCabo(a: AmbienteDoCabo): DisponibilidadeDoCabo {
  if (a.plataforma !== 'web') return { ok: false, motivo: 'app-no-celular' };
  if (a.celularPelaDica === true || UA_DE_CELULAR.test(a.userAgent)) {
    return { ok: false, motivo: 'navegador-de-celular' };
  }
  if (!a.contextoSeguro) return { ok: false, motivo: 'endereco-nao-seguro' };
  if (!a.temPortaSerial) return { ok: false, motivo: 'navegador-sem-porta-serial' };
  return { ok: true };
}
