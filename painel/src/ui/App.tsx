/**
 * Raiz do painel: escolhe a fonte de dados, confere a sessão e monta as rotas.
 * Sem sessão, qualquer endereço mostra a entrada (FR-024).
 *
 * Rotas: `/` visão geral, `/colmeia/:id` uma colmeia, `/planilha`. O `id` da
 * colmeia é código opaco; nome de pessoa nunca vai no endereço (FR-033).
 */
import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ConfiguracaoInsegura, escolherFonte } from '../dados/escolher';
import type { FontePainel, Sessao } from '../dados/porta';
import { t } from '../textos';
import { Colmeia } from '../telas/Colmeia';
import { Entrar } from '../telas/Entrar';
import { Planilha } from '../telas/Planilha';
import { VisaoGeral } from '../telas/VisaoGeral';
import { Carregando, Problema } from './Estados';
import { FaixaDemo, Moldura } from './Moldura';
import { FonteContexto } from './carregar';

type Inicio =
  | { estado: 'carregando' }
  | { estado: 'pronto'; fonte: FontePainel }
  | { estado: 'configuracao' }
  | { estado: 'problema' };

export function App() {
  const [inicio, setInicio] = useState<Inicio>({ estado: 'carregando' });
  // undefined = ainda conferindo; null = sem sessão.
  const [sessao, setSessao] = useState<Sessao | null | undefined>(undefined);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    escolherFonte().then(
      async (fonte) => {
        const s = await fonte.sessaoAtual().catch(() => null);
        if (!vivo) return;
        setSessao(s);
        setInicio({ estado: 'pronto', fonte });
      },
      (e: unknown) => {
        if (vivo) setInicio({ estado: e instanceof ConfiguracaoInsegura ? 'configuracao' : 'problema' });
      },
    );
    return () => { vivo = false; };
  }, [tentativa]);

  if (inicio.estado === 'carregando') return <main><Carregando /></main>;
  if (inicio.estado === 'configuracao') {
    return (
      <main>
        <div className="caixa problema" role="alert">
          <h1>{t('config.insegura.titulo')}</h1>
          <p>{t('config.insegura.texto')}</p>
        </div>
      </main>
    );
  }
  if (inicio.estado === 'problema') {
    return <main><Problema motivo="servidor" onTentar={() => setTentativa((n) => n + 1)} /></main>;
  }

  const { fonte } = inicio;
  const demo = fonte.modo === 'demonstracao';

  if (!sessao) {
    return (
      <>
        {demo ? <FaixaDemo /> : null}
        <main><Entrar fonte={fonte} onEntrou={setSessao} /></main>
      </>
    );
  }

  return (
    <FonteContexto.Provider value={fonte}>
      <BrowserRouter>
        <Moldura
          demo={demo}
          email={sessao.email}
          onSair={() => { void fonte.sair().finally(() => setSessao(null)); }}
        >
          <Routes>
            <Route path="/" element={<VisaoGeral />} />
            <Route path="/colmeia/:id" element={<Colmeia />} />
            <Route path="/planilha" element={<Planilha />} />
            <Route path="*" element={<VisaoGeral />} />
          </Routes>
        </Moldura>
      </BrowserRouter>
    </FonteContexto.Provider>
  );
}
