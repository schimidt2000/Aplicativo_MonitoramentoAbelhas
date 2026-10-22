/**
 * Do desfecho da conversa com a placa para o vocabulário de TODA coleta
 * (`CodigoProblema`, `EstadoRelogio`), para que a tela de resultado e os avisos
 * sejam os mesmos da coleta existente (feature 005, FR-028). Puro.
 *
 * Regra que organiza tudo: se as leituras já estão salvas no celular, o que
 * aconteceu depois com a placa é AVISO, não problema — a próxima coleta traz
 * de novo o que a placa ainda tiver, sem duplicar. A exceção é a placa que
 * perdeu o arquivo: aí há algo a fazer nela.
 */
import type { CodigoProblema, EstadoRelogio } from '../coleta/resultado';
import type { DesfechoDaSessao } from './protocolo';

export function problemaDoDesfecho(d: DesfechoDaSessao): CodigoProblema | null {
  switch (d.motivo) {
    case 'concluida':
    case 'concluida-com-aviso':
    case 'hora-nao-enviada':
      return null;
    case 'crc-diferente':
      return 'dados-corrompidos';
    case 'protocolo-desconhecido':
    case 'formato-desconhecido':
      return 'formato-desconhecido';
    case 'nao-gravou':
      return 'nao-salvou';
    case 'inesperado':
      return 'inesperado';
    case 'placa-nova':
      return 'placa-recusou';
    case 'placa-nao-respondeu':
      return 'nao-conectou';
    case 'erro-da-placa':
      if (d.arquivoNaPlaca === 'sem-arquivo') return 'placa-recusou';
      return d.gravado ? null : 'placa-recusou';
    case 'sem-resposta':
    case 'conexao-caiu':
      if (d.gravado) return null;
      return d.etapa === 'handshake' ? 'nao-conectou' : 'conexao-caiu';
  }
}

/** "Acertar o relógio" da placa é ela recomeçar o arquivo com a hora enviada. */
export function relogioDoDesfecho(d: DesfechoDaSessao): EstadoRelogio {
  if (d.motivo === 'hora-nao-enviada') return 'celular-suspeito';
  if (d.horaEnviadaS === null) return 'nao-tentado';
  return d.arquivoNaPlaca === 'apagou' ? 'acertado' : 'falhou';
}

/** O `outcome` da `pull_session` (data-model, versão 3). */
export function outcomeDoDesfecho(d: DesfechoDaSessao): string {
  if (d.gravado) {
    switch (d.arquivoNaPlaca) {
      case 'apagou': return 'ok';
      case 'continua': return 'placa_nao_apagou';
      case 'sem-arquivo': return 'placa_sem_arquivo';
      case 'nao-se-sabe': return 'placa_nao_se_sabe';
    }
  }
  switch (d.motivo) {
    case 'formato-desconhecido':
    case 'protocolo-desconhecido': return 'versao_desconhecida';
    case 'crc-diferente': return 'dados_corrompidos';
    case 'nao-gravou': return 'nao_salvou';
    case 'placa-nao-respondeu':
    case 'placa-nova': return 'nao_conectou';
    case 'erro-da-placa': return 'placa_recusou';
    case 'inesperado': return 'inesperado';
    default: return 'parcial';
  }
}
