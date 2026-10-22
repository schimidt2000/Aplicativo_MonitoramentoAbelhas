/**
 * Do problema do cabo para o que a pessoa lê (feature 004). Puro e testável:
 * a tela só desenha. Mesma regra de `core/coleta/mensagens.ts`: decide pelo
 * CÓDIGO do TransportError e pela FASE, nunca pela mensagem do navegador.
 * Toda mensagem diz o que aconteceu e o que fazer em seguida.
 */
import type { TransportErrorCode } from '../ports/transport';
import { t } from '../i18n';

/** Em que momento o problema aconteceu. Muda o que ele significa. */
export type FaseDoCabo = 'escolher' | 'abrir' | 'ler';

/** Por que a leitura pelo cabo não existe aqui. Quem descobre é o transporte. */
export type MotivoSemCabo =
  | 'app-no-celular'
  | 'navegador-de-celular'
  | 'endereco-nao-seguro'
  | 'navegador-sem-porta-serial';

export type ProblemaDoCabo =
  | 'nenhuma-porta'
  | 'sem-permissao'
  | 'porta-ocupada'
  | 'cabo-solto'
  | 'placa-parou'
  | 'inesperado';

export function problemaDoCabo(codigo: TransportErrorCode, fase: FaseDoCabo): ProblemaDoCabo {
  if (codigo === 'permission') return 'sem-permissao';
  switch (fase) {
    case 'escolher':
      return codigo === 'not-found' ? 'nenhuma-porta' : 'inesperado';
    case 'abrir':
      // A porta existe mas não abre: quase sempre outro programa está com ela.
      return codigo === 'unavailable' ? 'porta-ocupada' : 'inesperado';
    case 'ler':
      if (codigo === 'connection-lost') return 'cabo-solto';
      if (codigo === 'timeout') return 'placa-parou';
      return 'inesperado';
  }
}

export interface TextoDeProblema { titulo: string; detalhe: string }

export function textoDoProblema(p: ProblemaDoCabo): TextoDeProblema {
  switch (p) {
    case 'nenhuma-porta':
      return { titulo: t('cabo.problema.nenhuma_porta.titulo'), detalhe: t('cabo.problema.nenhuma_porta.detalhe') };
    case 'sem-permissao':
      return { titulo: t('cabo.problema.sem_permissao.titulo'), detalhe: t('cabo.problema.sem_permissao.detalhe') };
    case 'porta-ocupada':
      return { titulo: t('cabo.problema.porta_ocupada.titulo'), detalhe: t('cabo.problema.porta_ocupada.detalhe') };
    case 'cabo-solto':
      return { titulo: t('cabo.problema.cabo_solto.titulo'), detalhe: t('cabo.problema.cabo_solto.detalhe') };
    case 'placa-parou':
      return { titulo: t('cabo.problema.placa_parou.titulo'), detalhe: t('cabo.problema.placa_parou.detalhe') };
    case 'inesperado':
      return { titulo: t('cabo.problema.inesperado.titulo'), detalhe: t('cabo.problema.inesperado.detalhe') };
  }
}

export interface TextoSemCabo extends TextoDeProblema {
  /** No app do celular, a alternativa é uma tela que existe: oferecer o caminho. */
  oferecerColeta: boolean;
}

export function textoSemCabo(m: MotivoSemCabo): TextoSemCabo {
  switch (m) {
    case 'app-no-celular':
      return { titulo: t('cabo.sem_suporte.titulo.computador'),
        detalhe: t('cabo.sem_suporte.app_no_celular'), oferecerColeta: true };
    case 'navegador-de-celular':
      return { titulo: t('cabo.sem_suporte.titulo.computador'),
        detalhe: t('cabo.sem_suporte.navegador_de_celular'), oferecerColeta: false };
    case 'endereco-nao-seguro':
      return { titulo: t('cabo.sem_suporte.titulo.endereco'),
        detalhe: t('cabo.sem_suporte.endereco_nao_seguro'), oferecerColeta: false };
    case 'navegador-sem-porta-serial':
      return { titulo: t('cabo.sem_suporte.titulo.navegador'),
        detalhe: t('cabo.sem_suporte.navegador_sem_porta'), oferecerColeta: false };
  }
}
