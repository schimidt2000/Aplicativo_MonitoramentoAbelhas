/**
 * Entrada (FR-024): e-mail e senha, sem cadastro público. No modo de
 * demonstração não há servidor: entra direto, com o aviso claro de que os
 * dados são inventados.
 *
 * E-mail e senha vão no corpo da requisição de autenticação, nunca no endereço
 * (FR-033). O envio nativo é impedido; o `method="post"` é a segunda trava: se
 * o formulário fosse enviado pelo navegador, nada iria para a barra de endereço.
 */
import { useState, type FormEvent } from 'react';
import type { FontePainel, Sessao } from '../dados/porta';
import { t, type ChaveTexto } from '../textos';

interface Props {
  fonte: FontePainel;
  onEntrou: (s: Sessao) => void;
}

export function Entrar({ fonte, onEntrou }: Props) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [problema, setProblema] = useState<ChaveTexto | null>(null);

  async function tentar(e?: FormEvent) {
    e?.preventDefault();
    if (fonte.modo === 'supabase' && (email.trim() === '' || senha === '')) {
      setProblema('entrar.problema.vazio');
      return;
    }
    setEntrando(true);
    setProblema(null);
    const r = await fonte.entrar(email.trim(), senha);
    setEntrando(false);
    if (r.ok) {
      setSenha('');
      onEntrou(r.sessao);
      return;
    }
    setProblema(
      r.motivo === 'credenciais' ? 'entrar.problema.credenciais'
        : r.motivo === 'sem-internet' ? 'rede.sem_internet.texto'
          : 'rede.servidor.texto',
    );
  }

  if (fonte.modo === 'demonstracao') {
    return (
      <section className="entrar">
        <h1>{t('entrar.titulo')}</h1>
        <div className="caixa aviso">
          <h2>{t('entrar.demo.titulo')}</h2>
          <p>{t('entrar.demo.explicacao')}</p>
          <button type="button" onClick={() => void tentar()} disabled={entrando}>
            {t('entrar.demo.botao')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="entrar">
      <h1>{t('entrar.titulo')}</h1>
      <p className="secundario-texto">{t('entrar.explicacao')}</p>
      <form method="post" onSubmit={(e) => void tentar(e)} noValidate>
        <div className="campo">
          <label htmlFor="email">{t('entrar.email')}</label>
          <input
            id="email" type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="senha">{t('entrar.senha')}</label>
          <input
            id="senha" type="password" autoComplete="current-password" value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        {problema ? <p className="caixa problema" role="alert">{t(problema)}</p> : null}
        <button type="submit" disabled={entrando}>
          {entrando ? t('entrar.entrando') : t('entrar.botao')}
        </button>
      </form>
    </section>
  );
}
