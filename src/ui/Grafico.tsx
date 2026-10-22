/**
 * Gráfico de linha com faixa diária. Um <Path> por segmento contínuo, com o `d`
 * construído à mão a partir dos resumos diários — nenhuma biblioteca de
 * gráficos (Princípio II).
 *
 * Duas restrições vindas de issues abertas do react-native-svg:
 *  - width e height SEMPRE numéricos e explícitos (#2138: na web não deriva de viewBox);
 *  - nada de onPress em <Path> (#2865). Use Pressable por cima se precisar.
 *
 * Três decisões que sustentam o Princípio VI (Honestidade do Dado):
 *
 *  1. LACUNA É LACUNA. A linha quebra tanto quando o valor é null quanto quando
 *     um dia simplesmente não existe na série. O banco só devolve os dias que
 *     têm linha, então a ausência chega como elemento faltando, não como null —
 *     ligar 12/09 direto em 15/09 seria interpolar sobre o que não foi medido.
 *
 *  2. ESCALA COM PISO. Sem um span mínimo, um ninho estável em 34,6 °C vira uma
 *     montanha-russa: a escala automática amplia 0,05 °C até a altura inteira.
 *     Parece sinal e é ruído. `spanMinimo` fixa a menor janela que faz sentido
 *     para a grandeza.
 *
 *  3. A FAIXA É DESCRITIVA, NÃO É JUÍZO. O sombreado é o intervalo p5–p95 do
 *     próprio dia — dispersão medida, não "faixa saudável". Limiar por espécie
 *     está fora do escopo da 001 e o app não julga o que não sabe.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { fmtData } from '@/core/format';
import { t } from '@/core/i18n';
import { cores, espaco, tipo } from './tokens';

export interface PontoGrafico {
  day: number;
  valor: number | null;
  faixaMin?: number | null;
  faixaMax?: number | null;
}

const GUTTER_ESQ = 48;
const GUTTER_BAIXO = 22;
const PAD_TOPO = 12;
const PAD_DIR = 10;

/** Passo "redondo" para os rótulos do eixo: 1, 2, 2.5 ou 5 vezes uma potência de 10. */
function passoRedondo(span: number): number {
  const bruto = span / 2;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag >= bruto) return m * mag;
  }
  return 10 * mag;
}

/** Segmentos contínuos: quebra em valor ausente E em dia faltando. */
function segmentar(pontos: PontoGrafico[]): PontoGrafico[][] {
  const out: PontoGrafico[][] = [];
  let atual: PontoGrafico[] = [];
  let diaAnterior: number | null = null;

  for (const p of pontos) {
    const descontinuo = diaAnterior !== null && p.day !== diaAnterior + 1;
    if (p.valor === null || descontinuo) {
      if (atual.length) out.push(atual);
      atual = [];
    }
    if (p.valor !== null) atual.push(p);
    diaAnterior = p.day;
  }
  if (atual.length) out.push(atual);
  return out;
}

export function Grafico({
  pontos, largura, altura = 200, sufixo = '', divisor = 1, casas = 1, spanMinimo = 0,
}: {
  pontos: PontoGrafico[];
  largura: number;
  altura?: number;
  sufixo?: string;
  divisor?: number;
  casas?: number;
  /** Menor janela vertical aceitável, em unidades brutas. Evita ampliar ruído. */
  spanMinimo?: number;
}) {
  const validos = pontos.filter((p) => p.valor !== null) as Required<PontoGrafico>[];

  if (validos.length === 0 || largura <= 0) {
    return (
      <View style={[st.vazio, { height: altura }]}>
        <Text style={st.vazioTexto}>{t('grafico.sem_leitura')}</Text>
      </View>
    );
  }

  // Limites considerando a faixa diária, não só a mediana.
  const todos: number[] = [];
  for (const p of validos) {
    todos.push(p.valor as number);
    if (p.faixaMin != null) todos.push(p.faixaMin);
    if (p.faixaMax != null) todos.push(p.faixaMax);
  }
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);

  // Piso de escala: centraliza os dados numa janela mínima em vez de ampliar ruído.
  const spanReal = hi - lo;
  const spanAlvo = Math.max(spanReal, spanMinimo, Math.abs(hi) * 1e-6, 1e-6);
  if (spanAlvo > spanReal) {
    const centro = (hi + lo) / 2;
    lo = centro - spanAlvo / 2;
    hi = centro + spanAlvo / 2;
  }

  const passo = passoRedondo(hi - lo);
  const loR = Math.floor(lo / passo) * passo;
  const hiR = Math.ceil(hi / passo) * passo;
  const span = hiR - loR || 1;

  const marcas: number[] = [];
  for (let v = loR; v <= hiR + passo * 0.001; v += passo) marcas.push(v);

  const x0 = GUTTER_ESQ;
  const x1 = Math.max(x0 + 1, largura - PAD_DIR);
  const y0 = PAD_TOPO;
  const y1 = Math.max(y0 + 1, altura - GUTTER_BAIXO);

  const dayMin = Math.min(...pontos.map((p) => p.day));
  const dayMax = Math.max(...pontos.map((p) => p.day));
  const dspan = dayMax - dayMin || 1;

  const X = (d: number) => x0 + ((d - dayMin) / dspan) * (x1 - x0);
  const Y = (v: number) => y0 + (1 - (v - loR) / span) * (y1 - y0);

  const segmentos = segmentar(pontos);
  const fmt = (v: number) => (v / divisor).toFixed(casas).replace('.', ',');
  const temFaixa = validos.some((p) => p.faixaMin != null && p.faixaMax != null);

  return (
    <View>
      <Svg width={largura} height={altura}>
        {/* Grade e rótulos do eixo vertical */}
        {marcas.map((v) => (
          <Line key={`g${v}`} x1={x0} y1={Y(v)} x2={x1} y2={Y(v)}
            stroke={cores.linha} strokeWidth={1} />
        ))}
        {marcas.map((v) => (
          <SvgText key={`t${v}`} x={x0 - 6} y={Y(v) + 4} textAnchor="end"
            fontSize={11} fill={cores.textoFraco}>
            {fmt(v)}
          </SvgText>
        ))}

        {/* Faixa diária p5-p95: dispersão medida, não limiar de saúde. */}
        {segmentos.map((seg, i) => {
          const comFaixa = seg.filter((p) => p.faixaMin != null && p.faixaMax != null);
          if (comFaixa.length < 2) return null;
          const ida = comFaixa
            .map((p) => `${X(p.day).toFixed(1)} ${Y(p.faixaMax as number).toFixed(1)}`)
            .join(' L');
          const volta = [...comFaixa].reverse()
            .map((p) => `${X(p.day).toFixed(1)} ${Y(p.faixaMin as number).toFixed(1)}`)
            .join(' L');
          return (
            <Path key={`f${i}`} d={`M${ida} L${volta} Z`}
              fill={cores.acento} fillOpacity={0.13} stroke="none" />
          );
        })}

        {/* Mediana diária: um path por segmento contínuo. */}
        {segmentos.map((seg, i) => {
          if (seg.length === 1) {
            const p = seg[0];
            return (
              <Circle key={`p${i}`} cx={X(p.day)} cy={Y(p.valor as number)} r={3}
                fill={cores.acento} />
            );
          }
          const d = seg
            .map((p, j) => `${j === 0 ? 'M' : 'L'}${X(p.day).toFixed(1)} ${Y(p.valor as number).toFixed(1)}`)
            .join(' ');
          return (
            <Path key={`l${i}`} d={d} stroke={cores.acento} strokeWidth={2.5} fill="none"
              strokeLinejoin="round" strokeLinecap="round" />
          );
        })}

        {/* Datas nas pontas */}
        <SvgText x={x0} y={altura - 6} fontSize={11} fill={cores.textoFraco}>
          {fmtData(dayMin * 86400000)}
        </SvgText>
        <SvgText x={x1} y={altura - 6} textAnchor="end" fontSize={11} fill={cores.textoFraco}>
          {fmtData(dayMax * 86400000)}
        </SvgText>
      </Svg>

      <View style={st.legenda}>
        <View style={st.amostraLinha} />
        <Text style={st.legendaTexto}>{t('grafico.legenda.mediana')}</Text>
        {temFaixa && (
          <>
            <View style={st.amostraFaixa} />
            <Text style={st.legendaTexto}>{t('grafico.legenda.faixa')}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  vazio: { alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: cores.linha, borderRadius: 10,
    backgroundColor: cores.superficie },
  vazioTexto: { fontSize: tipo.rotulo, color: cores.textoFraco },
  legenda: { flexDirection: 'row', alignItems: 'center', gap: espaco.xs,
    marginTop: espaco.sm, flexWrap: 'wrap' },
  amostraLinha: { width: 16, height: 3, borderRadius: 2,
    backgroundColor: cores.acento },
  amostraFaixa: { width: 16, height: 10, borderRadius: 2, marginLeft: espaco.md,
    backgroundColor: cores.acento, opacity: 0.18 },
  legendaTexto: { fontSize: tipo.rotulo, color: cores.textoFraco },
});
