/**
 * Uma colmeia (US4, FR-026 a FR-030).
 *
 *  - Período: 7 ou 30 dias até a última leitura, ou datas livres.
 *  - Gráficos a partir dos resumos diários, montados pelo calendário: dia sem
 *    linha é lacuna, e cada trilha (nó sensor + época) é uma série separada.
 *  - Temperatura com 1 casa e umidade sem casa (exatidão do sensor); correção
 *    do nó aplicada só aqui, na exibição.
 *  - Voláteis só como índice da própria trilha, nunca número cru (FR-031).
 *  - Contagem de amostras excluídas ao lado de todo agregado: no dia apontado
 *    e no resumo do período (FR-029).
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { NoSensorPainel, ResumoDiario } from '../dados/porta';
import { diaDeMs, isoDeDia } from '../dominio/calendario';
import { decimal, fmtDia, fmtTemp, fmtUmid, frescor, inteiro } from '../dominio/formato';
import { MAX_DIAS_PERIODO, resolverPeriodo, type EscolhaPeriodo } from '../dominio/periodo';
import {
  agregarPorTrilha, diasSemLeitura, montarSerie, trocasDeSensor, type Trilha,
} from '../dominio/serie';
import { MIN_DIAS_LINHA_BASE, indiceVolateis } from '../dominio/volateis';
import { t, tp } from '../textos';
import { Carregando, Problema } from '../ui/Estados';
import { Grafico, type SerieGrafico } from '../ui/Grafico';
import { useCarregar, useFonte } from '../ui/carregar';
import { rotuloCriacao, rotuloMunicipio } from '../ui/rotulos';

/** Uma cor por trilha; todas com contraste ≥ 3:1 sobre o branco. */
const CORES = ['#0b3d91', '#8a3b00', '#1e5e1e', '#6b1d5c'];

const eixoTemp = (v: number) => decimal(v, 1);
const eixoInteiro = (v: number) => String(Math.round(v));

/** Correção em °C × 100 -> "-0,5" ou "+0,25": exata, sem zero sobrando. */
function valorCorrecao(c100: number): string {
  const v = decimal(c100 / 100, 2).replace(/0$/, '');
  return c100 > 0 ? `+${v}` : v;
}

function chaveDia(noId: string, epoca: number, dia: number): string {
  return `${noId}|${epoca}|${dia}`;
}

export function Colmeia() {
  const { id = '' } = useParams();
  const fonte = useFonte();
  const navegar = useNavigate();

  const [cab, tentarCab] = useCarregar(async () => {
    const [colmeia, nos] = await Promise.all([fonte.colmeia(id), fonte.nosSensores([id])]);
    return { colmeia, nos };
  }, [fonte, id]);

  const [escolha, setEscolha] = useState<EscolhaPeriodo>({ tipo: '30' });
  const [diaApontado, setDiaApontado] = useState<number | null>(null);

  const colmeia = cab.estado === 'ok' ? cab.dados.colmeia : null;
  const nos: NoSensorPainel[] = cab.estado === 'ok' ? cab.dados.nos : [];
  const ultimoDia = colmeia?.ultimaLeituraMs != null ? diaDeMs(colmeia.ultimaLeituraMs) : null;
  const periodo = resolverPeriodo(escolha, ultimoDia);
  const deDia = periodo.ok ? periodo.deDia : null;
  const ateDia = periodo.ok ? periodo.ateDia : null;

  const [res, tentarRes] = useCarregar<ResumoDiario[]>(
    () => (deDia !== null && ateDia !== null && colmeia
      ? fonte.resumosDiarios(id, deDia, ateDia)
      : Promise.resolve([])),
    [fonte, id, deDia, ateDia, colmeia !== null],
  );

  const resumos = res.estado === 'ok' ? res.dados : null;

  const desenho = useMemo(() => {
    if (!resumos || deDia === null || ateDia === null) return null;
    const correcao = new Map(nos.map((n) => [n.noId, n.correcaoTempC100]));
    const c = (r: ResumoDiario) => correcao.get(r.noId) ?? 0;
    const temp = (v: number | null, r: ResumoDiario) => (v === null ? null : (v + c(r)) / 100);

    const media = montarSerie(resumos, deDia, ateDia, (r) => temp(r.tempMedC100, r));
    const menor = montarSerie(resumos, deDia, ateDia, (r) => temp(r.tempMinC100, r));
    const maior = montarSerie(resumos, deDia, ateDia, (r) => temp(r.tempMaxC100, r));
    const umid = montarSerie(resumos, deDia, ateDia, (r) => (r.umidMedX100 === null ? null : r.umidMedX100 / 100));
    const vol = indiceVolateis(montarSerie(resumos, deDia, ateDia, (r) => r.tvocMedPpb));

    const variosNos = new Set(media.trilhas.map((tr) => tr.noId)).size > 1;
    const rotulo = (tr: Trilha) => (variosNos
      ? t('colmeia.trilha.no_epoca', { no: tr.noId, epoca: tr.epoca })
      : t('colmeia.trilha.epoca', { epoca: tr.epoca }));

    const seriesTemp: SerieGrafico[] = media.trilhas.flatMap((tr, i) => [
      { rotulo: `${t('grafico.temp.media')} · ${rotulo(tr)}`, y: tr.y, cor: CORES[i % CORES.length] },
      { rotulo: `${t('grafico.temp.menor')} · ${rotulo(tr)}`, y: menor.trilhas[i].y, cor: CORES[i % CORES.length], tracejado: true },
      { rotulo: `${t('grafico.temp.maior')} · ${rotulo(tr)}`, y: maior.trilhas[i].y, cor: CORES[i % CORES.length], tracejado: true },
    ]);
    const seriesUmid: SerieGrafico[] = umid.trilhas.map((tr, i) => ({
      rotulo: `${t('grafico.umid.media')} · ${rotulo(tr)}`, y: tr.y, cor: CORES[i % CORES.length],
    }));
    const seriesVol: SerieGrafico[] = vol.trilhas.map((tr, i) => ({
      rotulo: `${t('grafico.vol.indice')} · ${rotulo(tr)}`, y: tr.y, cor: CORES[i % CORES.length],
    }));

    // Correção é grandeza derivada: o gráfico diz que ela está aplicada, e
    // quanto, no próprio rótulo (Princípio VI), não só no resumo lá embaixo.
    const nosDoPeriodo = [...new Set(media.trilhas.map((tr) => tr.noId))];
    const corrigidos = nosDoPeriodo.filter((n) => (correcao.get(n) ?? 0) !== 0);
    const legendaTemp = corrigidos.length === 0 ? t('grafico.legenda.lacuna') : `${t('grafico.legenda.lacuna')} ${t('grafico.temp.correcao', {
      correcoes: corrigidos
        .map((n) => t('grafico.temp.correcao_item', { no: n, valor: valorCorrecao(correcao.get(n) ?? 0) }))
        .join('; '),
    })}`;

    const porDia = new Map(resumos.map((r) => [chaveDia(r.noId, r.epocaSensor, r.dia), r]));
    return {
      dias: media.dias,
      trilhas: media.trilhas as Trilha[],
      rotulo,
      seriesTemp,
      legendaTemp,
      seriesUmid,
      seriesVol,
      semBase: vol.trilhas.filter((tr) => tr.base === null),
      porDia,
      correcao,
      lacunas: diasSemLeitura(resumos, deDia, ateDia),
      trocas: trocasDeSensor(resumos, deDia, ateDia),
      agregados: agregarPorTrilha(resumos, deDia, ateDia),
    };
  }, [resumos, deDia, ateDia, nos]);

  if (cab.estado === 'carregando') return <Carregando />;
  if (cab.estado === 'problema') return <Problema motivo={cab.motivo} onTentar={tentarCab} />;
  if (!colmeia) {
    return (
      <section>
        <p className="caixa">{t('colmeia.nao_encontrada')}</p>
        <Link to="/">{t('colmeia.voltar')}</Link>
      </section>
    );
  }

  function escolher(tipo: EscolhaPeriodo['tipo']) {
    setDiaApontado(null);
    if (tipo !== 'livre') {
      setEscolha({ tipo });
      return;
    }
    const ate = ateDia ?? diaDeMs(Date.now());
    const de = deDia ?? ate - 29;
    setEscolha({ tipo: 'livre', deIso: isoDeDia(de), ateIso: isoDeDia(ate) });
  }

  const diaAtual = desenho && diaApontado !== null ? desenho.dias[diaApontado] : undefined;

  return (
    <section>
      <p><Link to="/">{t('colmeia.voltar')}</Link></p>
      <h1>{colmeia.colmeiaNome}</h1>
      <p>
        {t('colmeia.de', {
          local: colmeia.localNome, apicultor: colmeia.apicultorNome, municipio: rotuloMunicipio(colmeia),
        })}
        <br />
        <span className="secundario-texto">
          {rotuloCriacao(colmeia.criacao)}
          {' · '}
          {t('colmeia.ultima_leitura', { quando: frescor(colmeia.ultimaLeituraMs, Date.now()) })}
        </span>
      </p>

      <fieldset className="periodo">
        <legend>{t('colmeia.periodo')}</legend>
        {(['7', '30', 'livre'] as const).map((tipo) => (
          <label key={tipo}>
            <input
              type="radio" name="periodo" checked={escolha.tipo === tipo}
              onChange={() => escolher(tipo)}
            />
            {t(`colmeia.periodo.${tipo}`)}
          </label>
        ))}
      </fieldset>
      {escolha.tipo === 'livre' ? (
        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="de">{t('colmeia.periodo.inicio')}</label>
            <input
              id="de" type="date" value={escolha.deIso}
              onChange={(e) => setEscolha({ ...escolha, deIso: e.target.value })}
            />
          </div>
          <div className="campo">
            <label htmlFor="ate">{t('colmeia.periodo.fim')}</label>
            <input
              id="ate" type="date" value={escolha.ateIso}
              onChange={(e) => setEscolha({ ...escolha, ateIso: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      {!periodo.ok ? (
        <p className="caixa aviso" role="status">
          {periodo.motivo === 'invalido' ? t('colmeia.periodo.invalido')
            : periodo.motivo === 'longo' ? t('colmeia.periodo.longo', { n: inteiro(MAX_DIAS_PERIODO) })
              : t('colmeia.periodo.sem_leitura')}
        </p>
      ) : (
        <p className="secundario-texto">
          {t('colmeia.periodo.mostrando', { de: fmtDia(periodo.deDia), ate: fmtDia(periodo.ateDia) })}
        </p>
      )}

      {periodo.ok && res.estado === 'carregando' ? <Carregando /> : null}
      {periodo.ok && res.estado === 'problema' ? <Problema motivo={res.motivo} onTentar={tentarRes} /> : null}

      {periodo.ok && desenho && desenho.trilhas.length === 0 ? (
        <p className="caixa">{t('colmeia.sem_dados')}</p>
      ) : null}

      {periodo.ok && desenho && desenho.trilhas.length > 0 ? (
        <>
          {desenho.lacunas > 0 ? (
            <p className="caixa aviso">{tp('colmeia.lacunas', desenho.lacunas)}</p>
          ) : null}
          {desenho.trocas.map((d) => (
            <p key={d} className="caixa aviso">{t('colmeia.troca_sensor', { data: fmtDia(d) })}</p>
          ))}

          <div className="dia" aria-live="polite">
            {diaAtual === undefined ? (
              <span className="secundario-texto">{t('colmeia.dia.dica')}</span>
            ) : (
              <>
                <strong>{t('colmeia.dia.titulo', { data: fmtDia(diaAtual) })}</strong>
                <DiaApontado
                  dia={diaAtual}
                  trilhas={desenho.trilhas}
                  rotulo={desenho.rotulo}
                  porDia={desenho.porDia}
                  correcao={desenho.correcao}
                />
              </>
            )}
          </div>

          <Grafico
            titulo={t('grafico.temp.titulo')}
            subtitulo={desenho.legendaTemp}
            dias={desenho.dias}
            series={desenho.seriesTemp}
            formatoY={eixoTemp}
            onDia={setDiaApontado}
          />
          <Grafico
            titulo={t('grafico.umid.titulo')}
            dias={desenho.dias}
            series={desenho.seriesUmid}
            formatoY={eixoInteiro}
            onDia={setDiaApontado}
          />
          <Grafico
            titulo={t('grafico.vol.titulo')}
            subtitulo={t('grafico.vol.subtitulo')}
            dias={desenho.dias}
            series={desenho.seriesVol}
            formatoY={eixoInteiro}
            onDia={setDiaApontado}
          />
          {desenho.semBase.map((tr) => (
            <p key={`${tr.noId}-${tr.epoca}`} className="caixa aviso">
              {t('grafico.vol.sem_base', { trilha: desenho.rotulo(tr), n: MIN_DIAS_LINHA_BASE })}
            </p>
          ))}

          <h2>{t('colmeia.resumo.titulo')}</h2>
          <p className="secundario-texto">{t('colmeia.resumo.explicacao')}</p>
          <div className="tabela-rolavel">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('colmeia.resumo.trilha')}</th>
                  <th scope="col" className="numero">{t('colmeia.resumo.dias')}</th>
                  <th scope="col">{t('colmeia.resumo.temp')}</th>
                  <th scope="col">{t('colmeia.resumo.umid')}</th>
                  <th scope="col" className="numero">{t('colmeia.resumo.validas')}</th>
                  <th scope="col" className="numero">{t('colmeia.resumo.excluidas')}</th>
                </tr>
              </thead>
              <tbody>
                {desenho.agregados.map((a) => {
                  const corr = desenho.correcao.get(a.noId) ?? 0;
                  return (
                    <tr key={`${a.noId}-${a.epoca}`}>
                      <th scope="row">{desenho.rotulo(a)}</th>
                      <td className="numero">{inteiro(a.diasComLinha)}</td>
                      <td>{t('colmeia.resumo.faixa', { min: fmtTemp(a.tempMenorC100, corr), max: fmtTemp(a.tempMaiorC100, corr) })}</td>
                      <td>{t('colmeia.resumo.faixa', { min: fmtUmid(a.umidMediaMenorX100), max: fmtUmid(a.umidMediaMaiorX100) })}</td>
                      <td className="numero">{inteiro(a.validas)}</td>
                      <td className="numero">{inteiro(a.excluidas)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="acoes">
            <button
              type="button"
              onClick={() => navegar('/planilha', {
                // Por estado de navegação, nunca por parâmetro de endereço (FR-033).
                state: { colmeiaIds: [id], deIso: isoDeDia(periodo.deDia), ateIso: isoDeDia(periodo.ateDia) },
              })}
            >
              {t('colmeia.baixar_planilha')}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

interface PropsDia {
  dia: number;
  trilhas: Trilha[];
  rotulo: (tr: Trilha) => string;
  porDia: Map<string, ResumoDiario>;
  correcao: Map<string, number>;
}

/** Os números de um dia, por trilha, com válidas e excluídas ao lado. */
function DiaApontado({ dia, trilhas, rotulo, porDia, correcao }: PropsDia) {
  const linhas = trilhas
    .map((tr) => ({ tr, r: porDia.get(chaveDia(tr.noId, tr.epoca, dia)) }))
    .filter((x): x is { tr: Trilha; r: ResumoDiario } => x.r !== undefined);
  if (linhas.length === 0) return <p>{t('colmeia.dia.sem_dado')}</p>;
  return (
    <ul>
      {linhas.map(({ tr, r }) => {
        const c = correcao.get(r.noId) ?? 0;
        return (
          <li key={`${tr.noId}-${tr.epoca}`}>
            {trilhas.length > 1 ? `${rotulo(tr)}: ` : null}
            {t(c === 0 ? 'colmeia.dia.temp' : 'colmeia.dia.temp_corrigida', {
              media: fmtTemp(r.tempMedC100, c), min: fmtTemp(r.tempMinC100, c), max: fmtTemp(r.tempMaxC100, c),
            })}
            {' · '}
            {t('colmeia.dia.umid', { umid: fmtUmid(r.umidMedX100) })}
            {' · '}
            {tp('colmeia.dia.validas', r.validas)}
            {' · '}
            {tp('colmeia.dia.excluidas', r.excluidas)}
          </li>
        );
      })}
    </ul>
  );
}
