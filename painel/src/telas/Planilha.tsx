/**
 * Planilha sob demanda (US5, FR-034, FR-035).
 *
 * A pesquisadora marca colmeias e período; o painel busca as leituras, monta
 * o arquivo no navegador e baixa. Nada é guardado: o arquivo existe só no
 * download (FR-032). Recorte grande demais não trava a tela: o painel pede
 * para estreitar (US5, cenário 3).
 *
 * O filtro por apicultor e a seleção ficam em estado do componente. Quando a
 * pesquisadora vem da tela da colmeia, a pré-seleção chega por estado de
 * navegação, não por parâmetro de endereço (FR-033).
 */
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { diaDeMs, isoDeDia } from '../dominio/calendario';
import { recortePlanilha } from '../dominio/periodo';
import { inteiro } from '../dominio/formato';
import { LIMITE_LEITURAS, gerarPlanilha, nomeDoArquivo } from '../dominio/planilha';
import { filtrarPorApicultor, ordenarVisao } from '../dominio/visao';
import type { MotivoProblema } from '../dados/porta';
import { t, tp } from '../textos';
import { Carregando, Problema } from '../ui/Estados';
import { motivoDe, useCarregar, useFonte } from '../ui/carregar';
import { rotuloMunicipio } from '../ui/rotulos';

interface PreSelecao {
  colmeiaIds?: string[];
  deIso?: string;
  ateIso?: string;
}

type Situacao =
  | { tipo: 'parada' }
  | { tipo: 'montando' }
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'pronta'; leituras: number }
  | { tipo: 'problema'; motivo: MotivoProblema };

function baixar(conteudo: string, nome: string) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Dá tempo ao navegador de começar o download antes de soltar a memória.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function Planilha() {
  const fonte = useFonte();
  const pre = (useLocation().state ?? {}) as PreSelecao;
  const [carga, tentar] = useCarregar(() => fonte.visaoGeral(), [fonte]);

  const hoje = diaDeMs(Date.now());
  const [deIso, setDeIso] = useState(pre.deIso ?? isoDeDia(hoje - 29));
  const [ateIso, setAteIso] = useState(pre.ateIso ?? isoDeDia(hoje));
  const [filtro, setFiltro] = useState('');
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(pre.colmeiaIds ?? []));
  const [situacao, setSituacao] = useState<Situacao>({ tipo: 'parada' });

  const todas = useMemo(() => (carga.estado === 'ok' ? ordenarVisao(carga.dados) : []), [carga]);
  const mostradas = useMemo(() => filtrarPorApicultor(todas, filtro), [todas, filtro]);

  function alternar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function montar() {
    const recorte = recortePlanilha(deIso, ateIso);
    if (!recorte.ok) {
      setSituacao({ tipo: 'aviso', texto: t('colmeia.periodo.invalido') });
      return;
    }
    const { deDia: de, ateDia: ate } = recorte;
    const escolhidas = todas.filter((c) => marcadas.has(c.colmeiaId));
    if (escolhidas.length === 0) {
      setSituacao({ tipo: 'aviso', texto: t('planilha.nenhuma') });
      return;
    }
    setSituacao({ tipo: 'montando' });
    try {
      const ids = escolhidas.map((c) => c.colmeiaId);
      const [nos, leituras] = await Promise.all([
        fonte.nosSensores(ids),
        fonte.leituras(ids, recorte.deMs, recorte.ateMs, LIMITE_LEITURAS),
      ]);
      if (leituras.length > LIMITE_LEITURAS) {
        setSituacao({ tipo: 'aviso', texto: t('planilha.grande', { limite: inteiro(LIMITE_LEITURAS) }) });
        return;
      }
      if (leituras.length === 0) {
        setSituacao({ tipo: 'aviso', texto: t('planilha.vazia') });
        return;
      }
      const conteudo = gerarPlanilha({
        geradaEmMs: Date.now(), deDia: de, ateDia: ate, colmeias: escolhidas, nos, leituras,
      });
      baixar(conteudo, nomeDoArquivo(de, ate));
      setSituacao({ tipo: 'pronta', leituras: leituras.length });
    } catch (e) {
      setSituacao({ tipo: 'problema', motivo: motivoDe(e) });
    }
  }

  return (
    <section>
      <h1>{t('planilha.titulo')}</h1>
      <p>{t('planilha.explicacao')}</p>
      <p className="secundario-texto">{t('planilha.sobre')}</p>

      {carga.estado === 'carregando' ? <Carregando /> : null}
      {carga.estado === 'problema' ? <Problema motivo={carga.motivo} onTentar={tentar} /> : null}
      {carga.estado === 'ok' && todas.length === 0 ? <p className="caixa">{t('visao.sem_colmeias')}</p> : null}

      {carga.estado === 'ok' && todas.length > 0 ? (
        <>
          <h2>{t('planilha.colmeias')}</h2>
          <div className="campo">
            <label htmlFor="filtro">{t('planilha.filtro')}</label>
            <input
              id="filtro" type="search" value={filtro} autoComplete="off"
              placeholder={t('visao.busca.dica')}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
          <div className="acoes">
            <button
              type="button" className="secundario"
              onClick={() => setMarcadas((m) => new Set([...m, ...mostradas.map((c) => c.colmeiaId)]))}
            >
              {t('planilha.marcar_todas')}
            </button>
            <button type="button" className="secundario" onClick={() => setMarcadas(new Set())}>
              {t('planilha.desmarcar_todas')}
            </button>
          </div>
          {mostradas.length === 0 ? <p className="caixa">{t('visao.vazio')}</p> : (
            <ul className="lista-colmeias">
              {mostradas.map((c) => (
                <li key={c.colmeiaId}>
                  <label>
                    <input
                      type="checkbox" checked={marcadas.has(c.colmeiaId)}
                      onChange={() => alternar(c.colmeiaId)}
                    />
                    <span>
                      <strong>{c.colmeiaNome}</strong>
                      {' · '}
                      {c.localNome}
                      {' · '}
                      <span className="secundario-texto">{c.apicultorNome}, {rotuloMunicipio(c)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p role="status">{tp('planilha.marcadas', marcadas.size)}</p>

          <h2>{t('planilha.periodo')}</h2>
          <div className="linha-campos">
            <div className="campo">
              <label htmlFor="p-de">{t('colmeia.periodo.inicio')}</label>
              <input id="p-de" type="date" value={deIso} onChange={(e) => setDeIso(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="p-ate">{t('colmeia.periodo.fim')}</label>
              <input id="p-ate" type="date" value={ateIso} onChange={(e) => setAteIso(e.target.value)} />
            </div>
          </div>

          <div className="acoes">
            <button type="button" onClick={() => void montar()} disabled={situacao.tipo === 'montando'}>
              {situacao.tipo === 'montando' ? t('planilha.montando') : t('planilha.botao')}
            </button>
          </div>

          {situacao.tipo === 'aviso' ? <p className="caixa aviso" role="alert">{situacao.texto}</p> : null}
          {situacao.tipo === 'pronta' ? (
            <p className="caixa" role="status">{tp('planilha.pronta', situacao.leituras)}</p>
          ) : null}
          {situacao.tipo === 'problema' ? (
            <Problema motivo={situacao.motivo} onTentar={() => void montar()} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
