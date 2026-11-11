/**
 * Moldura comum: faixa de demonstração (quando é o caso), marca, navegação e
 * saída. A faixa de demonstração aparece em TODA tela, inclusive na entrada:
 * número inventado não pode virar captura de tela sem a ressalva junto.
 */
import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { t } from '../textos';
import { Icone, Marca } from './Icones';

export function FaixaDemo() {
  return (
    <div className="faixa-demo" role="note">
      <div className="faixa-demo-interna">
        <strong className="faixa-demo-selo">
          <Icone desenho="info" tamanho={18} />
          {t('demo.faixa.titulo')}
        </strong>
        <span>{t('demo.faixa.texto')}</span>
      </div>
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
        <div className="topo-interno">
          <Link to="/" className="marca">
            <Marca />
            <span className="marca-texto">
              <strong>{t('app.nome')}</strong>
              <small>{t('app.subtitulo')}</small>
            </span>
          </Link>
          <nav className="topo-nav" aria-label={t('nav.rotulo')}>
            <ul>
              <li>
                <NavLink to="/" end>
                  <Icone desenho="grade" />
                  {t('nav.visao_geral')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/planilha">
                  <Icone desenho="tabela" />
                  {t('nav.planilha')}
                </NavLink>
              </li>
            </ul>
          </nav>
          <div className="quem">
            {email ? <span className="quem-email">{t('nav.quem', { email })}</span> : null}
            <button type="button" className="sair" onClick={onSair}>
              <Icone desenho="sair" />
              {t('nav.sair')}
            </button>
          </div>
        </div>
      </header>
      <main className="conteudo">{children}</main>
    </>
  );
}
