/**
 * Chaves e padrões das preferências do apicultor. Ficam aqui, e não na tela de
 * Ajustes, para que a lista de colmeias possa lê-las sem importar uma rota.
 */
export const CHAVE_INTERVALO = 'intervalo_coleta_dias';

/** 15 dias: metade do que o nó guarda com folga, e cabe no ritmo de visita. */
export const INTERVALO_PADRAO = 15;

export const OPCOES_INTERVALO = [7, 15, 30, 60];

/**
 * Demonstração: qual problema simular em TODAS as coletas, até ser trocado por
 * "Nenhum problema" — a tela de Coletar avisa enquanto estiver ligado. Só vale
 * enquanto o aplicativo usa nós sensores simulados; com um transporte real, a
 * opção some da tela de Ajustes. Existe para que dê para MOSTRAR como os avisos aparecem,
 * sem precisar quebrar um sensor de verdade.
 */
export const CHAVE_DEMO_FALHA = 'demo_falha';

export type FalhaDemo =
  | 'nenhuma' | 'queda' | 'corrompido' | 'formato'
  | 'sem-colmeias' | 'sensor-novo' | 'relogio-recusado'
  // Feature 003 — hora das leituras.
  | 'perdeu-energia' | 'sem-nocao-de-tempo' | 'celular-adiantado';

export const OPCOES_DEMO_FALHA: FalhaDemo[] = [
  'nenhuma', 'queda', 'corrompido', 'formato',
  'sem-colmeias', 'sensor-novo', 'relogio-recusado',
  'perdeu-energia', 'sem-nocao-de-tempo', 'celular-adiantado',
];

export function ehFalhaDemo(v: string): v is FalhaDemo {
  return (OPCOES_DEMO_FALHA as string[]).includes(v);
}
