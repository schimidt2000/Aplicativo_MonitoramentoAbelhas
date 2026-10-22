/**
 * Formatação brasileira. Precisão NUNCA superior à exatidão do sensor
 * (Princípio VI, FR-023): temperatura com 1 casa, umidade com 0.
 */

/** Temperatura em centésimos de °C -> "34,7 °C". Offset aplicado só aqui. */
export function fmtTemp(c100: number | null, offsetC100 = 0): string {
  if (c100 === null) return '—';
  return `${((c100 + offsetC100) / 100).toFixed(1).replace('.', ',')} °C`;
}

/** Umidade sem casa decimal: na colmeia a exatidão é ±3-4 %RH. */
export function fmtUmidade(x100: number | null): string {
  if (x100 === null) return '—';
  return `${Math.round(x100 / 100)} %`;
}

/** Voláteis. NUNCA rotular como CO2 (Princípio VI, FR-017). */
export function fmtVolateis(ppb: number | null): string {
  if (ppb === null) return '—';
  return `${ppb.toLocaleString('pt-BR')} ppb`;
}

export type EstadoBateria = 'boa' | 'trocar-em-breve' | 'trocar-agora' | 'desconhecido';

/**
 * Bateria em três estados nomeados, nunca porcentagem (FR-022): a curva de
 * descarga é plana e depois despenca, então um mapa linear mostra "70 %" por
 * meses e mente exatamente quando importa.
 */
export function estadoBateria(mv: number | null): EstadoBateria {
  if (mv === null) return 'desconhecido';
  if (mv >= 3800) return 'boa';
  if (mv >= 3600) return 'trocar-em-breve';
  return 'trocar-agora';
}

export function fmtBateria(mv: number | null): string {
  switch (estadoBateria(mv)) {
    case 'boa': return 'Boa';
    case 'trocar-em-breve': return 'Trocar em breve';
    case 'trocar-agora': return 'Trocar agora';
    default: return '—';
  }
}

export type NivelColeta =
  | 'sem-coleta' | 'em-dia' | 'chegando' | 'atrasada' | 'muito-atrasada';

/**
 * Urgência da próxima coleta, comparada ao intervalo que o apicultor escolheu.
 *
 * Aqui a cor ESCALA até o vermelho, de propósito. O app existe para fazer a
 * pessoa ir até a colmeia: passar do intervalo não é "dado velho", é ação
 * pendente — e, se demorar demais, o buffer do nó enche e perde leitura.
 * Cada nível carrega uma PALAVRA junto da cor, porque o Princípio V proíbe
 * transmitir estado só por cor.
 */
export function nivelColeta(ms: number | null, intervaloDias: number): NivelColeta {
  if (ms === null) return 'sem-coleta';
  const dias = (Date.now() - ms) / 86400000;
  if (dias >= intervaloDias * 2) return 'muito-atrasada';
  if (dias > intervaloDias) return 'atrasada';
  if (dias >= intervaloDias * 0.8) return 'chegando';
  return 'em-dia';
}

export function fmtNivelColeta(n: NivelColeta): string {
  switch (n) {
    case 'sem-coleta': return 'Sem coleta';
    case 'em-dia': return 'Em dia';
    case 'chegando': return 'Chegando a hora';
    case 'atrasada': return 'Coleta atrasada';
    case 'muito-atrasada': return 'Muito atrasada';
  }
}

/** Dias inteiros desde a última coleta. `null` quando nunca houve coleta. */
export function diasDesde(ms: number | null): number | null {
  if (ms === null) return null;
  return Math.floor((Date.now() - ms) / 86400000);
}

/** Frescor em texto. A cor de urgência vem de `nivelColeta`, não daqui. */
export function fmtFrescor(ms: number | null): string {
  if (ms === null) return 'Sem leitura ainda';
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 5) return 'Agora há pouco';
  if (min < 60) return `Há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Ontem';
  if (d < 14) return `Há ${d} dias`;
  const sem = Math.floor(d / 7);
  return `Há ${sem} semanas`;
}

/** Dado antigo não pode ser apresentado como atual (FR-021). */
export function dadoEstaVelho(ms: number | null, limiteDias = 14): boolean {
  if (ms === null) return true;
  return Date.now() - ms > limiteDias * 86400000;
}

export function fmtData(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function fmtNumero(n: number): string {
  return n.toLocaleString('pt-BR');
}

/**
 * Data e hora completas, no fuso do celular: "21/10/2026" e "14:05" (24 h).
 * Para quando o apicultor precisa conferir a data do próprio celular (003).
 */
export function fmtDataHoraPartes(ms: number): { data: string; hora: string } {
  const d = new Date(ms);
  return {
    data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}
