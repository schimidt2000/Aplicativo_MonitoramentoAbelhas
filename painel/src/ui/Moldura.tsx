/**
 * Moldura comum: faixa de demonstração (quando é o caso), marca, navegação e
 * saída. A faixa de demonstração aparece em TODA tela, inclusive na entrada:
 * número inventado não pode virar captura de tela sem a ressalva junto.
 */
import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { t } from '../textos';

export function FaixaDemo() {
  return (
    <div className="faixa-demo" role="note">
      <strong>{t('demo.faixa.titulo')}</strong>
      <span>{t('demo.faixa.texto')}</span>
    </div>
  );
}

interface Props {
  demo: boolean;
  email: string | null;
  onSair: () => void;
  children: ReactNode;
}

export function Moldura({ demo, email, onSair, children }: Props) {
  // Tela nova começa do topo, não na rolagem da tela anterior.
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <>
      {demo ? <FaixaDemo /> : null}
      <header className="topo">
        <div className="marca">
          {t('app.nome')}
          <small>{t('app.subtitulo')}</small>
        </div>
        <nav aria-label={t('nav.rotulo')}>
          <ul>
            <li><NavLink to="/" end>{t('nav.visao_geral')}</NavLink></li>
            <li><NavLink to="/planilha">{t('nav.planilha')}</NavLink></li>
          </ul>
        </nav>
        <div className="quem">
          {email ? <span>{t('nav.quem', { email })}</span> : null}
          <button type="button" className="secundario" onClick={onSair}>{t('nav.sair')}</button>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
