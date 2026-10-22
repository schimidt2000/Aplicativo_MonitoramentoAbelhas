/**
 * Do motivo de parada do envio, e da validação local do código do projeto,
 * para o que o apicultor lê. Puro e testável: as telas só desenham o que sai
 * daqui (mesmo padrão de core/coleta/mensagens.ts).
 *
 * Regras (glossário e constituição, Princípios I e V):
 *  - falta de rede NUNCA é "erro", "falha" nem "offline";
 *  - toda mensagem diz o que aconteceu E o que fazer em seguida;
 *  - nunca "login", "senha" nem "token": é o "código do projeto".
 */
import type { MotivoFalha } from '../ports/nuvem';
import type { ValidacaoCodigo } from '../codigo-projeto';
import { t, type ChaveTexto } from '../i18n';

export interface MensagemEnvio {
  titulo: string;
  texto: string;
  /** Neutro para o estado normal (sem rede); atenção para o que pede ação. */
  tom: 'neutro' | 'atencao';
}

const CHAVE: Record<MotivoFalha, string> = {
  'sem-rede': 'sem_rede',
  'portal-cativo': 'portal_cativo',
  'sem-vinculo': 'sem_vinculo',
  'codigo-invalido': 'codigo_invalido',
  'muitas-tentativas': 'muitas_tentativas',
  'codigo-travado': 'codigo_travado',
  servidor: 'servidor',
  recusado: 'recusado',
  'tempo-esgotado': 'tempo_esgotado',
};

export const MOTIVOS: readonly MotivoFalha[] = Object.keys(CHAVE) as MotivoFalha[];

export function mensagemDeParada(motivo: MotivoFalha): MensagemEnvio {
  const base = `envio.parada.${CHAVE[motivo]}`;
  return {
    titulo: t(`${base}.titulo` as ChaveTexto),
    texto: t(`${base}.texto` as ChaveTexto),
    tom: motivo === 'sem-rede' ? 'neutro' : 'atencao',
  };
}

/**
 * Motivos que, na tela de ligar o celular, pedem outra ação seguinte: lá não
 * existe "Enviar agora", e mandar a pessoa tocar nele seria mandá-la para o
 * lugar errado. Os motivos do código em si (não confere, espere, travado)
 * valem igual nas duas telas.
 */
const PROPRIOS_DO_VINCULO: ReadonlySet<MotivoFalha> = new Set<MotivoFalha>([
  'sem-rede', 'portal-cativo', 'servidor', 'tempo-esgotado', 'recusado', 'sem-vinculo',
]);

/** O que dizer quando ligar o celular ao projeto parou. */
export function mensagemAoLigar(motivo: MotivoFalha): MensagemEnvio {
  if (!PROPRIOS_DO_VINCULO.has(motivo)) return mensagemDeParada(motivo);
  const base = `vinculo.parada.${CHAVE[motivo]}`;
  return {
    titulo: t(`${base}.titulo` as ChaveTexto),
    texto: t(`${base}.texto` as ChaveTexto),
    tom: motivo === 'sem-rede' ? 'neutro' : 'atencao',
  };
}

type MotivoLocal = Extract<ValidacaoCodigo, { ok: false }>['motivo'];

/** O que dizer quando o código não passou na validação do próprio celular. */
export function mensagemDeCodigoLocal(motivo: MotivoLocal): string {
  return t(`vinculo.local.${motivo}` as ChaveTexto);
}
