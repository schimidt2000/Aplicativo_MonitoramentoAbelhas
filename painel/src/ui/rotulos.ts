/** Rótulos de cadastro usados em mais de uma tela. */
import type { ColmeiaMacro } from '../dados/porta';
import { t } from '../textos';

export function rotuloCriacao(c: ColmeiaMacro['criacao']): string {
  if (c === 'apis') return t('criacao.apis');
  if (c === 'meliponineo') return t('criacao.meliponineo');
  return t('criacao.desconhecida');
}

export function rotuloMunicipio(c: ColmeiaMacro): string {
  if (!c.municipio) return t('visao.sem_municipio');
  return c.uf ? t('visao.municipio', { municipio: c.municipio, uf: c.uf }) : c.municipio;
}
