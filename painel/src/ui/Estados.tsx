/**
 * Estados comuns de tela: buscando e problema. Problema sempre diz o que
 * aconteceu e o que fazer, e falta de rede nunca vira "erro" (Princípio I e V).
 */
import type { MotivoProblema } from '../dados/porta';
import { t } from '../textos';

export function Carregando() {
  return <p role="status">{t('carregando')}</p>;
}

export function Problema({ motivo, onTentar }: { motivo: MotivoProblema; onTentar: () => void }) {
  const base = motivo === 'sem-internet' ? 'rede.sem_internet' : 'rede.servidor';
  return (
    <div className="caixa aviso" role="alert">
      <h2>{t(`${base}.titulo`)}</h2>
      <p>{t(`${base}.texto`)}</p>
      <button type="button" onClick={onTentar}>{t('rede.tentar_de_novo')}</button>
    </div>
  );
}
