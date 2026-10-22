/**
 * Gráfico dos últimos minutos da tela de cabo (feature 004). Um <Path> de
 * react-native-svg por trecho contínuo — nenhuma biblioteca de gráfico
 * (Princípio II). Não reaproveita o Grafico.tsx da 001 porque aquele tem o
 * DIA como eixo, quebra a linha por dia faltando e escreve datas; aqui o eixo
 * é em segundos.
 *
 * Só desenha. Os trechos, as lacunas e a escala vêm de `core/bancada/serie.ts`,
 * que é puro e testado: a linha se interrompe onde não chegou leitura válida,
 * e o período em que o sensor de gás não estava pronto aparece como faixa.
 *
 * Mesmas restrições do Grafico.tsx: width/height numéricos (na web o SVG não
 * deriva tamanho do viewBox) e nada de onPress em <Path>.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { t } from '@/core/i18n';
import { escalaVertical, type SerieAoVivo } from '@/core/bancada/serie';
import { fmtHoraBancada } from '@/core/bancada/apresentacao';
import { cores, espaco, tipo } from './tokens';

const GUTTER_ESQ = 48;
const GUTTER_BAIXO = 22;
const PAD_TOPO = 12;
const PAD_DIR = 10;

export function GraficoAoVivo({
  serie, largura, altura = 200, divisor, casas, spanMinimo,
}: {
  serie: SerieAoVivo;
  largura: number;
  altura?: number;
  /** Unidade bruta → unidade mostrada (100 para centésimos). */
  divisor: number;
  casas: number;
  spanMinimo: number;
}) {
  const escala = escalaVertical(serie.trechos, spanMinimo);

  if (!escala || largura <= 0) {
    return (
      <View style={[st.vazio, { height: altura }]}>
        <Text style={st.vazioTexto}>{t('cabo.grafico.vazio')}</Text>
      </View>
    );
  }

  const x0 = GUTTER_ESQ;
  const x1 = Math.max(x0 + 1, largura - PAD_DIR);
  const y0 = PAD_TOPO;
  const y1 = Math.max(y0 + 1, altura - GUTTER_BAIXO);
  const tspan = serie.fimMs - serie.inicioMs || 1;
  const vspan = escala.hi - escala.lo || 1;

  const X = (ms: number) => x0 + ((ms - serie.inicioMs) / tspan) * (x1 - x0);
  const Y = (v: number) => y0 + (1 - (v - escala.lo) / vspan) * (y1 - y0);
  const fmt = (v: number) => (v / divisor).toFixed(casas).replace('.', ',');

  return (
    <View>
      <Svg width={largura} height={altura}>
        {escala.marcas.map((v) => (
          <Line key={`g${v}`} x1={x0} y1={Y(v)} x2={x1} y2={Y(v)}
            stroke={cores.linha} strokeWidth={1} />
        ))}
        {escala.marcas.map((v) => (
          <SvgText key={`t${v}`} x={x0 - 6} y={Y(v) + 4} textAnchor="end"
            fontSize={11} fill={cores.textoFraco}>
            {fmt(v)}
          </SvgText>
        ))}

        {/* Sensor de gás não pronto: faixa, com legenda. No mínimo 3 px para ser vista. */}
        {serie.gasNaoPronto.map((f) => {
          const xa = Math.max(x0, X(f.inicioMs) - 1.5);
          const xb = Math.min(x1, Math.max(X(f.fimMs) + 1.5, xa + 3));
          return (
            <Rect key={`f${f.inicioMs}`} x={xa} y={y0} width={xb - xa} height={y1 - y0}
              fill={cores.atencao} fillOpacity={0.16} />
          );
        })}

        {serie.trechos.map((trecho) => {
          const k = `l${trecho[0].tMs}`;
          if (trecho.length === 1) {
            const p = trecho[0];
            return <Circle key={k} cx={X(p.tMs)} cy={Y(p.valor)} r={3} fill={cores.acento} />;
          }
          const d = trecho
            .map((p, j) => `${j === 0 ? 'M' : 'L'}${X(p.tMs).toFixed(1)} ${Y(p.valor).toFixed(1)}`)
            .join(' ');
          return (
            <Path key={k} d={d} stroke={cores.acento} strokeWidth={2.5} fill="none"
              strokeLinejoin="round" strokeLinecap="round" />
          );
        })}

        <SvgText x={x0} y={altura - 6} fontSize={11} fill={cores.textoFraco}>
          {fmtHoraBancada(serie.inicioMs)}
        </SvgText>
        <SvgText x={x1} y={altura - 6} textAnchor="end" fontSize={11} fill={cores.textoFraco}>
          {fmtHoraBancada(serie.fimMs)}
        </SvgText>
      </Svg>

      <View style={st.legenda}>
        <View style={st.amostraLinha} />
        <Text style={st.legendaTexto}>{t('cabo.grafico.legenda.linha')}</Text>
        {serie.gasNaoPronto.length > 0 && (
          <>
            <View style={st.amostraFaixa} />
            <Text style={st.legendaTexto}>{t('cabo.grafico.legenda.gas_nao_pronto')}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  vazio: { alignItems: 'center', justifyContent: 'center', padding: espaco.md,
    borderWidth: 1, borderColor: cores.linha, borderRadius: 10,
    backgroundColor: cores.superficie },
  vazioTexto: { fontSize: tipo.corpo, color: cores.textoFraco, textAlign: 'center' },
  legenda: { flexDirection: 'row', alignItems: 'center', gap: espaco.xs,
    marginTop: espaco.sm, flexWrap: 'wrap' },
  amostraLinha: { width: 16, height: 3, borderRadius: 2, backgroundColor: cores.acento },
  amostraFaixa: { width: 16, height: 12, borderRadius: 2, marginLeft: espaco.md,
    backgroundColor: cores.atencao, opacity: 0.3 },
  legendaTexto: { fontSize: tipo.corpo, color: cores.textoFraco },
});
