/**
 * Como uma leitura de bancada aparece na tela (feature 004). Puro: a tela só
 * desenha o que sai daqui, e os testes guardam as regras de honestidade.
 *
 *  - Precisão nunca acima da exatidão do sensor: temperatura com 1 casa,
 *    umidade com 0 (Princípio VI). O valor com 2 casas fica na planilha, que
 *    é registro bruto e diz que é;
 *  - o canal de gás é "Voláteis (COVs)". O eCO₂ só aparece como "eCO₂
 *    estimado — não é CO₂", em letra menor;
 *  - enquanto o sensor de gás não está pronto, os voláteis não ganham número
 *    grande: aparece "—" e uma frase com o que a placa mandou. O eCO₂, que o
 *    sensor calcula a partir dos voláteis, também perde o número;
 *  - estado do gás em palavra + nível (a tela põe cor e ícone).
 */
import { fmtNumero, fmtTemp, fmtUmidade, fmtVolateis } from '../format';
import { t } from '../i18n';
import type { EstadoGas, LeituraDeLinha, MotivoIlegivel } from '../decode/linhas';
import type { MensagemDaPlaca } from './sessao';

/** Três níveis visuais. Cada um com cor + ícone + palavra na tela. */
export type NivelDoGas = 'pronto' | 'aguardando' | 'invalido';

export interface EstadoDoGasNaTela { texto: string; nivel: NivelDoGas }

export function estadoDoGasNaTela(estado: EstadoGas, codigo: number): EstadoDoGasNaTela {
  switch (estado) {
    case 'normal': return { texto: t('cabo.gas.normal'), nivel: 'pronto' };
    case 'aquecendo': return { texto: t('cabo.gas.aquecendo'), nivel: 'aguardando' };
    case 'primeira-partida': return { texto: t('cabo.gas.primeira_partida'), nivel: 'aguardando' };
    case 'invalido': return { texto: t('cabo.gas.invalido'), nivel: 'invalido' };
    case 'desconhecido': return { texto: t('cabo.gas.desconhecido', { n: codigo }), nivel: 'invalido' };
  }
}

export interface LeituraNaTela {
  temperatura: string;
  /** Frase sob o número quando ele está em branco. */
  temperaturaNota: string | null;
  umidade: string;
  umidadeNota: string | null;
  volateis: string;
  volateisNota: string;
  /** "eCO₂ estimado — não é CO₂: 650 ppm". Nunca outro rótulo. */
  gasEstimado: string;
  gas: EstadoDoGasNaTela;
}

export function leituraNaTela(l: LeituraDeLinha): LeituraNaTela {
  const pronto = l.gasStatus === 0;
  const gas = estadoDoGasNaTela(l.estadoGas, l.gasStatus);
  return {
    temperatura: fmtTemp(l.tempC100),
    temperaturaNota: l.tempC100 === null ? t('cabo.sem_numero') : null,
    umidade: fmtUmidade(l.rhX100),
    umidadeNota: l.rhX100 === null ? t('cabo.sem_numero') : null,
    volateis: pronto ? fmtVolateis(l.tvocPpb) : '—',
    volateisNota: pronto
      ? t('cabo.volateis_bancada')
      : gas.nivel === 'aguardando'
        ? t('cabo.volateis_aguardando', { valor: fmtNumero(l.tvocPpb) })
        : t('cabo.volateis_fora_do_normal', { valor: fmtNumero(l.tvocPpb) }),
    // O eCO₂ sai dos mesmos voláteis: se o número deles não vale, o dele também não.
    gasEstimado: pronto
      ? t('cabo.gas_estimado', { valor: fmtNumero(l.eco2Ppm) })
      : t('cabo.gas_estimado_nao_vale', { valor: fmtNumero(l.eco2Ppm) }),
    gas,
  };
}

const dois = (n: number) => String(n).padStart(2, '0');

/** "14:02:33", no fuso deste computador, 24 h. */
export function fmtHoraBancada(ms: number): string {
  const d = new Date(ms);
  return `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

/** "21/10/2026 14:02:33", no fuso deste computador. */
export function fmtDataHoraBancada(ms: number): string {
  const d = new Date(ms);
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${fmtHoraBancada(ms)}`;
}

const MOTIVO: Record<MotivoIlegivel, Parameters<typeof t>[0]> = {
  'fora-do-formato': 'cabo.registro.motivo.fora_do_formato',
  'caracteres-estranhos': 'cabo.registro.motivo.caracteres_estranhos',
  'longa-demais': 'cabo.registro.motivo.longa_demais',
  'interrompida': 'cabo.registro.motivo.interrompida',
};

/** Quanto do texto da placa cabe numa linha do registro. */
const TEXTO_NO_REGISTRO = 160;

export interface MensagemNaTela {
  hora: string;
  /** Só nas ilegíveis: "Linha ilegível — interrompida no meio". */
  aviso: string | null;
  texto: string;
}

// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000A-\u001F\u007F]/g;

export function mensagemNaTela(m: MensagemDaPlaca): MensagemNaTela {
  // Lixo da porta vira "·" em vez de desenhar caractere de controle.
  const limpo = m.texto.replace(CONTROLE, '·');
  const texto = limpo.length > TEXTO_NO_REGISTRO ? `${limpo.slice(0, TEXTO_NO_REGISTRO)}…` : limpo;
  return {
    hora: fmtHoraBancada(m.chegadaMs),
    aviso: m.tipo === 'ilegivel' ? `${t('cabo.registro.ilegivel')} — ${t(MOTIVO[m.motivo])}` : null,
    texto,
  };
}
