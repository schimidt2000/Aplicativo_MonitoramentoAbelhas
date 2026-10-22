/**
 * Rótulos das falhas simuladas da demonstração. Ajustes (onde se escolhe) e
 * Coletar (onde a linha "Simulação ligada" lembra a escolha) usam o mesmo
 * mapa, para falarem a mesma língua.
 */
import type { ChaveTexto } from '@/core/i18n';
import type { FalhaDemo } from '@/core/preferencias';

export const ROTULO_DEMO: Record<FalhaDemo, ChaveTexto> = {
  'nenhuma': 'ajustes.demo.opcao.nenhuma',
  'queda': 'ajustes.demo.opcao.queda',
  'corrompido': 'ajustes.demo.opcao.corrompido',
  'formato': 'ajustes.demo.opcao.formato',
  'sem-colmeias': 'ajustes.demo.opcao.sem_colmeias',
  'sensor-novo': 'ajustes.demo.opcao.sensor_novo',
  'relogio-recusado': 'ajustes.demo.opcao.relogio_recusado',
  'perdeu-energia': 'ajustes.demo.opcao.perdeu_energia',
  'sem-nocao-de-tempo': 'ajustes.demo.opcao.sem_nocao_de_tempo',
  'celular-adiantado': 'ajustes.demo.opcao.celular_adiantado',
};
