/**
 * Retorno redundante ao terminar uma coleta (FR-007; Princípio V: "toda
 * operação com o nó MUST dar retorno redundante: texto e vibração ou som").
 *
 * O texto já está na tela. Aqui entram os outros dois canais:
 *  - vibração, com padrões DIFERENTES para sucesso e problema — com a colmeia
 *    aberta e a luva na mão, o apicultor sabe o desfecho sem olhar;
 *  - anúncio para o leitor de tela, porque a tela de resultado aparece de uma
 *    vez e um nó que monta já preenchido nem sempre é lido sozinho.
 *
 * Os dois são cortesia, nunca pré-requisito: cada um vai em try/catch, e se a
 * API não existir (navegador sem `navigator.vibrate`, leitor de tela ausente)
 * nada acontece. Este arquivo não importa react-native — a tela passa as APIs
 * — para que a regra seja testável em Node.
 */
import { t, tp } from '@/core/i18n';
import type { Resumo } from '@/core/coleta/mensagens';

/**
 * Padrões no formato do Android: [espera, vibra, espera, vibra, …] em ms.
 * Sucesso: um pulso curto. Problema: três pulsos longos — dá para distinguir
 * pelo tato, sem depender do som (campo barulhento, abelha zumbindo).
 */
export const VIBRACAO_SUCESSO: readonly number[] = [0, 90];
export const VIBRACAO_PROBLEMA: readonly number[] = [0, 260, 140, 260, 140, 260];

/**
 * O navegador (`navigator.vibrate`, via react-native-web) lê o padrão ao
 * contrário do Android: [vibra, espera, vibra, …]. Passado como está, o
 * `[0, 90]` do sucesso viraria "vibra 0 ms, espera 90 ms" — nada. Na web,
 * tira-se a espera inicial.
 */
export function padraoParaPlataforma(padrao: readonly number[], plataforma: string): number[] {
  if (plataforma === 'web' && padrao[0] === 0) return padrao.slice(1);
  return [...padrao];
}

export interface CanaisDeRetorno {
  /** `Platform.OS`: decide como o padrão de vibração é escrito. */
  plataforma?: string;
  vibrar?: (padrao: number[]) => void;
  anunciar?: (texto: string) => void;
}

/** Título do resultado com problema. A tela e o anúncio usam a mesma função. */
export function tituloDoProblema(resumo: Resumo): string {
  return t(resumo.desfecho === 'nao-coletou'
    ? 'coleta.resumo.nao_coletou' : 'coleta.resumo.com_problemas');
}

/**
 * A frase sob o título do problema. Só afirma que algo ficou salvo se a
 * gravação final deu certo (Princípio VI).
 */
export function notaDoProblema(resumo: Resumo): string {
  if (!resumo.gravouNoCelular) return t('coleta.resumo.talvez_nao_gravou');
  return resumo.salvas > 0
    ? tp('coleta.resumo.ficaram_salvas', resumo.salvas)
    : t('coleta.problema.nada_apagado');
}

/** A mesma manchete que a tela desenha, em uma frase, para o leitor de tela. */
export function textoDoAnuncio(resumo: Resumo): string {
  if (resumo.desfecho === 'sucesso') {
    return resumo.salvas === 0
      ? t('coleta.sucesso.nada_novo.titulo')
      : tp('coleta.sucesso.salvas', resumo.salvas);
  }
  return `${tituloDoProblema(resumo)}. ${notaDoProblema(resumo)}`;
}

/** Nunca lança. Um canal que falha não impede o outro. */
export function darRetornoDeColeta(resumo: Resumo, canais: CanaisDeRetorno): void {
  const padrao = resumo.desfecho === 'sucesso' ? VIBRACAO_SUCESSO : VIBRACAO_PROBLEMA;
  try {
    canais.vibrar?.(padraoParaPlataforma(padrao, canais.plataforma ?? 'android'));
  } catch {
    /* sem vibração: o texto continua na tela */
  }
  try {
    canais.anunciar?.(textoDoAnuncio(resumo));
  } catch {
    /* sem leitor de tela: o texto continua na tela */
  }
}
