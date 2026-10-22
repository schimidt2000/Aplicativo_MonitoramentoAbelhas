/**
 * Formatação brasileira do painel: vírgula decimal, dd/MM/aaaa, 24 h.
 *
 * Precisão NUNCA acima da exatidão do sensor (Princípio VI, `.claude/rules/ui.md`):
 * temperatura com 1 casa, umidade com 0. A planilha é a exceção declarada: ela
 * leva o valor bruto na resolução gravada, e o cabeçalho diz a exatidão.
 */
import { t, tp } from '../textos';
import { MS_DIA, msDeDia } from './calendario';

const SEM_VALOR = '—';

function dois(n: number): string {
  return String(n).padStart(2, '0');
}

/** Número com `casas` decimais e vírgula. Sem separador de milhar. */
export function decimal(v: number, casas: number): string {
  return v.toFixed(casas).replace('.', ',');
}

/** Inteiro com separador de milhar brasileiro: 1.240. */
export function inteiro(n: number): string {
  return n.toLocaleString('pt-BR');
}

/** °C × 100 -> "34,7 °C". A correção do nó entra só aqui, na exibição. */
export function fmtTemp(c100: number | null, correcaoC100 = 0): string {
  if (c100 === null) return SEM_VALOR;
  return `${decimal((c100 + correcaoC100) / 100, 1)} °C`;
}

/** % × 100 -> "68 %". Sem casa decimal: a exatidão é de ±3 a 4 %. */
export function fmtUmid(x100: number | null): string {
  if (x100 === null) return SEM_VALOR;
  return `${Math.round(x100 / 100)} %`;
}

/** Dia (UTC) -> dd/MM/aaaa. */
export function fmtDia(dia: number): string {
  const d = new Date(msDeDia(dia));
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** ms (UTC) -> dd/MM/aaaa HH:mm:ss, em UTC. */
export function fmtDataHoraUtc(ms: number): string {
  const d = new Date(ms);
  return `${fmtDia(Math.floor(ms / MS_DIA))} ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}:${dois(d.getUTCSeconds())}`;
}

/**
 * Idade do dado em palavras (US3, cenário 2): nunca data crua. Escala neutra,
 * sem cor de alarme — frescor não é urgência (`.claude/rules/ui.md`).
 *
 * "Hoje" e "Ontem" são do calendário de QUEM LÊ, não do dia UTC: às 21h30 em
 * Mossoró (00h30 UTC) uma leitura das 20h do mesmo dia não é "de ontem".
 * `fusoMin` é o `getTimezoneOffset()` do navegador (minutos a SOMAR à hora
 * local para chegar ao UTC: 180 em UTC-3); os testes passam o valor fixo.
 */
export function frescor(
  ms: number | null, agoraMs: number, fusoMin = new Date(agoraMs).getTimezoneOffset(),
): string {
  if (ms === null) return t('frescor.nunca');
  const diaLocal = (x: number) => Math.floor((x - fusoMin * 60_000) / MS_DIA);
  const dias = diaLocal(agoraMs) - diaLocal(ms);
  if (dias <= 0) return t('frescor.hoje');
  if (dias === 1) return t('frescor.ontem');
  if (dias < 14) return t('frescor.dias', { n: dias });
  if (dias < 60) return tp('frescor.semanas', Math.floor(dias / 7));
  return tp('frescor.meses', Math.floor(dias / 30));
}
