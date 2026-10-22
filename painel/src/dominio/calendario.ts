/**
 * Dias do calendário em UTC. O resumo diário do servidor e do celular usa
 * `t_utc_ms / 86400000`, então o painel conta dias exatamente assim. Datas
 * mostradas a partir de um dia também são em UTC, e o painel diz isso.
 */
export const MS_DIA = 86_400_000;

export function diaDeMs(ms: number): number {
  return Math.floor(ms / MS_DIA);
}

export function msDeDia(dia: number): number {
  return dia * MS_DIA;
}

function dois(n: number): string {
  return String(n).padStart(2, '0');
}

/** Dia -> 'aaaa-mm-dd', o formato do campo de data do navegador. */
export function isoDeDia(dia: number): string {
  const d = new Date(msDeDia(dia));
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
}

/** 'aaaa-mm-dd' -> dia. null quando o texto não é uma data válida. */
export function diaDeIso(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return diaDeMs(ms);
}

/** Todos os dias de `deDia` a `ateDia`, inclusive. */
export function diasDoIntervalo(deDia: number, ateDia: number): number[] {
  const dias: number[] = [];
  for (let d = deDia; d <= ateDia; d++) dias.push(d);
  return dias;
}
