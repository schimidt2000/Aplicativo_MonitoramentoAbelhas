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

  return (
    <section>
      <h1>{t('visao.titulo')}</h1>
      <p className="secundario-texto">{t('visao.explicacao')}</p>

      {carga.estado === 'carregando' ? <Carregando /> : null}
      {carga.estado === 'problema' ? <Problema motivo={carga.motivo} onTentar={tentar} /> : null}

      {carga.estado === 'ok' && carga.dados.length === 0 ? (
        <p className="caixa">{t('visao.sem_colmeias')}</p>
      ) : null}

      {carga.estado === 'ok' && carga.dados.length > 0 ? (
        <>
          <div className="linha-campos">
            <div className="campo">
              <label htmlFor="busca">{t('visao.busca.rotulo')}</label>
              <input
                id="busca" type="search" value={busca} autoComplete="off"
                placeholder={t('visao.busca.dica')}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            {busca ? (
              <div className="campo">
                <button type="button" className="secundario" onClick={() => setBusca('')}>
                  {t('visao.busca.limpar')}
                </button>
              </div>
            ) : null}
          </div>
          <p role="status">{tp('visao.contagem', lista.length)}</p>

          {lista.length === 0 ? <p className="caixa">{t('visao.vazio')}</p> : (
            <div className="tabela-rolavel">
              <table>
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
                      <td>{c.apicultorNome}</td>
                      <td><Link to={`/colmeia/${encodeURIComponent(c.colmeiaId)}`}>{c.colmeiaNome}</Link></td>
                      <td>
                        {c.localNome}
                        <br />
                        <span className="secundario-texto">{rotuloCriacao(c.criacao)}</span>
                      </td>
                      <td>{rotuloMunicipio(c)}</td>
                      <td title={c.ultimaLeituraMs === null ? undefined : t('data.utc', { quando: fmtDataHoraUtc(c.ultimaLeituraMs) })}>
                        {frescor(c.ultimaLeituraMs, agora)}
                      </td>
                      <td className="numero">{inteiro(c.leituras)}</td>
                      <td className="numero">{inteiro(c.excluidas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
