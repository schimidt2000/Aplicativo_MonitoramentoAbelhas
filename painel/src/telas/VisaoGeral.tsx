/**
 * Visão geral (US3, FR-025): uma linha por colmeia, com apicultor, município,
 * idade do dado em palavras, leituras e amostras excluídas.
 *
 * O que NÃO tem aqui, de propósito: nenhuma coluna de gás. Comparar voláteis
 * entre colmeias não é oferecido (FR-031); o tipo `ColmeiaMacro` nem traz o
 * campo, e um teste lê este arquivo para garantir que continue assim.
 *
 * A busca por apicultor fica em estado do componente, nunca no endereço.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { fmtDataHoraUtc, frescor, inteiro } from '../dominio/formato';
import { filtrarPorApicultor, ordenarVisao } from '../dominio/visao';
import { t, tp } from '../textos';
import { Carregando, Problema } from '../ui/Estados';
import { useCarregar, useFonte } from '../ui/carregar';
import { Icone } from '../ui/Icones';
import { rotuloCriacao, rotuloMunicipio } from '../ui/rotulos';

export function VisaoGeral() {
  const fonte = useFonte();
  const [carga, tentar] = useCarregar(() => fonte.visaoGeral(), [fonte]);
  const [busca, setBusca] = useState('');
  const agora = Date.now();

  const lista = useMemo(
    () => (carga.estado === 'ok' ? ordenarVisao(filtrarPorApicultor(carga.dados, busca)) : []),
    [carga, busca],
  );

  // Contagens do projeto inteiro, sem filtro. Nada de gás aqui (FR-031).
  const numeros = useMemo(() => {
    if (carga.estado !== 'ok') return null;
    const d = carga.dados;
    return {
      colmeias: d.length,
      apicultores: new Set(d.map((c) => c.apicultorNome)).size,
      locais: new Set(d.map((c) => `${c.apicultorNome}|${c.localNome}`)).size,
      leituras: d.reduce((soma, c) => soma + c.leituras, 0),
    };
  }, [carga]);

  return (
    <section>
      <header className="cabecalho-pagina">
        <h1>{t('visao.titulo')}</h1>
        <p className="secundario-texto">{t('visao.explicacao')}</p>
      </header>

      {carga.estado === 'carregando' ? <Carregando /> : null}
      {carga.estado === 'problema' ? <Problema motivo={carga.motivo} onTentar={tentar} /> : null}

      {carga.estado === 'ok' && carga.dados.length === 0 ? (
        <p className="caixa">{t('visao.sem_colmeias')}</p>
      ) : null}

      {numeros && numeros.colmeias > 0 ? (
        <ul className="numeros" aria-label={t('visao.resumo.rotulo')}>
          <li className="numero-cartao">
            <span className="numero-icone"><Icone desenho="colmeia" /></span>
            <span className="numero-rotulo">{t('visao.resumo.colmeias')}</span>
            <strong className="numero-valor">{inteiro(numeros.colmeias)}</strong>
          </li>
          <li className="numero-cartao">
            <span className="numero-icone"><Icone desenho="pessoa" /></span>
            <span className="numero-rotulo">{t('visao.resumo.apicultores')}</span>
            <strong className="numero-valor">{inteiro(numeros.apicultores)}</strong>
          </li>
          <li className="numero-cartao">
            <span className="numero-icone"><Icone desenho="local" /></span>
            <span className="numero-rotulo">{t('visao.resumo.locais')}</span>
            <strong className="numero-valor">{inteiro(numeros.locais)}</strong>
          </li>
          <li className="numero-cartao">
            <span className="numero-icone"><Icone desenho="leituras" /></span>
            <span className="numero-rotulo">{t('visao.resumo.leituras')}</span>
            <strong className="numero-valor">{inteiro(numeros.leituras)}</strong>
          </li>
        </ul>
      ) : null}

      {carga.estado === 'ok' && carga.dados.length > 0 ? (
        <div className="cartao cartao-tabela">
          <div className="barra">
            <div className="campo">
              <label htmlFor="busca">{t('visao.busca.rotulo')}</label>
              <div className="busca">
                <Icone desenho="busca" />
                <input
                  id="busca" type="search" value={busca} autoComplete="off"
                  placeholder={t('visao.busca.dica')}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            {busca ? (
              <div className="campo">
                <button type="button" className="secundario" onClick={() => setBusca('')}>
                  {t('visao.busca.limpar')}
                </button>
              </div>
            ) : null}
            <p role="status" className="contagem">{tp('visao.contagem', lista.length)}</p>
          </div>

          {lista.length === 0 ? <p className="caixa vazia">{t('visao.vazio')}</p> : (
            <div className="tabela-rolavel">
              <table className="tabela-cartoes">
                <thead>
                  <tr>
                    <th scope="col">{t('visao.col.apicultor')}</th>
                    <th scope="col">{t('visao.col.colmeia')}</th>
                    <th scope="col">{t('visao.col.local')}</th>
                    <th scope="col">{t('visao.col.municipio')}</th>
                    <th scope="col">{t('visao.col.ultima_leitura')}</th>
                    <th scope="col" className="numero">{t('visao.col.leituras')}</th>
                    <th scope="col" className="numero">{t('visao.col.excluidas')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.colmeiaId}>
                      <td data-rotulo={t('visao.col.apicultor')}>{c.apicultorNome}</td>
                      <td className="celula-titulo">
                        <Link to={`/colmeia/${encodeURIComponent(c.colmeiaId)}`} className="link-colmeia">
                          <Icone desenho="colmeia" tamanho={18} />
                          <span>{c.colmeiaNome}</span>
                          <Icone desenho="avancar" tamanho={16} />
                        </Link>
                      </td>
                      <td data-rotulo={t('visao.col.local')}>
                        <span className="celula-local">
                          {c.localNome}
                          <span className="etiqueta">{rotuloCriacao(c.criacao)}</span>
                        </span>
                      </td>
                      <td data-rotulo={t('visao.col.municipio')}>{rotuloMunicipio(c)}</td>
                      <td
                        data-rotulo={t('visao.col.ultima_leitura')}
                        title={c.ultimaLeituraMs === null ? undefined : t('data.utc', { quando: fmtDataHoraUtc(c.ultimaLeituraMs) })}
                      >
                        <span className="frescor">
                          <Icone desenho="relogio" tamanho={16} />
                          {frescor(c.ultimaLeituraMs, agora)}
                        </span>
                      </td>
                      <td data-rotulo={t('visao.col.leituras')} className="numero">{inteiro(c.leituras)}</td>
                      <td data-rotulo={t('visao.col.excluidas')} className="numero">{inteiro(c.excluidas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
