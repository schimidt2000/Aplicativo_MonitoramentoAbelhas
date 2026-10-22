/**
 * Detalhe da colmeia. Quatro grandezas em ORDEM FIXA — memória muscular
 * funciona mesmo com a tela mal legível ao sol.
 * O canal de gás se chama "Voláteis (COVs)" e NUNCA "CO2" (Princípio VI).
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '@/data/provider';
import {
  contarExcluidas, intervaloDaPlacaNoCadastro, noTemColetaPeloCabo, obterColmeia, resumosDiarios,
  type LinhaColmeia, type LinhaDiaria,
} from '@/data/repo';
import { contarSemHora, definirIntervaloDaPlaca } from '@/data/hora';
import { INTERVALO_PADRAO_S } from '@/core/hora';
import { OPCOES_INTERVALO_PLACA_S, rotuloDoIntervalo } from '@/core/cabo/passos';
import { Grafico } from '@/ui/Grafico';
import { t, tp, type ChaveTexto } from '@/core/i18n';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';
import {
  dadoEstaVelho, fmtBateria, fmtFrescor, fmtTemp, fmtUmidade, fmtVolateis,
} from '@/core/format';

type Serie = 'temp' | 'rh' | 'tvoc';

/** Nome completo no título do gráfico; curto na aba, onde o espaço é de um dedo. */
const NOME_SERIE: Record<Serie, { titulo: ChaveTexto; aba: ChaveTexto }> = {
  temp: { titulo: 'grandeza.temperatura', aba: 'grandeza.temperatura' },
  rh: { titulo: 'grandeza.umidade', aba: 'grandeza.umidade' },
  tvoc: { titulo: 'grandeza.volateis', aba: 'grandeza.volateis_curto' },
};

export default function DetalheColmeia() {
  // O fim da rolagem não pode ficar atrás da barra de navegação do sistema.
  const { bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useDb();
  const [colmeia, setColmeia] = useState<LinhaColmeia | null>(null);
  const [diarias, setDiarias] = useState<LinhaDiaria[]>([]);
  const [excluidas, setExcluidas] = useState(0);
  const [semHora, setSemHora] = useState(0);
  const [janela, setJanela] = useState<7 | 30>(7);
  const [serie, setSerie] = useState<Serie>('temp');
  const [largura, setLargura] = useState(0);
  // Feature 005: só a placa que já veio pelo cabo tem intervalo a escolher.
  const [placa, setPlaca] = useState<{ intervaloS: number } | null>(null);
  const [intervaloFalhou, setIntervaloFalhou] = useState(false);

  const recarregar = useCallback(() => {
    const c = obterColmeia(db, id);
    setColmeia(c);
    if (c?.node_id) {
      setDiarias(resumosDiarios(db, c.node_id, janela));
      setExcluidas(contarExcluidas(db, c.node_id));
      setSemHora(contarSemHora(db, c.node_id));
      setPlaca(noTemColetaPeloCabo(db, c.node_id)
        ? { intervaloS: intervaloDaPlacaNoCadastro(db, c.node_id) ?? INTERVALO_PADRAO_S }
        : null);
    }
  }, [db, id, janela]);

  useFocusEffect(recarregar);

  /** Grava o intervalo e refaz as horas por versão nova; nenhuma leitura muda (FR-019). */
  async function escolherIntervalo(segundos: number) {
    const nodeId = colmeia?.node_id;
    if (!nodeId || !placa || placa.intervaloS === segundos) return;
    try {
      definirIntervaloDaPlaca(db, nodeId, segundos === INTERVALO_PADRAO_S ? null : segundos);
      await db.persist();
      setIntervaloFalhou(false);
    } catch {
      setIntervaloFalhou(true);
    }
    recarregar();
  }

  if (!colmeia) {
    return <View style={s.tela}><Text style={s.aviso}>{t('colmeia.nao_encontrada')}</Text></View>;
  }

  const velho = dadoEstaVelho(colmeia.ultima_ms);
  const semDados = colmeia.ultima_ms === null;

  // Uma linha por dia. Dia ausente vira lacuna — o Grafico quebra o traço tanto
  // em valor null quanto em dia faltando, porque o banco só devolve dias com linha.
  const pontos = diarias.map((d) => ({
    day: d.day,
    valor: serie === 'temp' ? d.temp_med : serie === 'rh' ? d.rh_med : d.tvoc_med,
    // Só a temperatura tem p5/p95 no resumo diário.
    faixaMin: serie === 'temp' ? d.temp_p5 : null,
    faixaMax: serie === 'temp' ? d.temp_p95 : null,
  }));

  // `spanMinimo` é a menor janela vertical que faz sentido para a grandeza. Sem
  // ele, um ninho estável em 34,6 °C vira montanha-russa: a escala automática
  // amplia 0,05 °C até a altura toda, e ruído passa a parecer sinal.
  const cfg = {
    temp: { sufixo: ' °C', divisor: 100, casas: 1, spanMinimo: 200 },
    rh: { sufixo: ' %', divisor: 100, casas: 0, spanMinimo: 1000 },
    tvoc: { sufixo: ' ppb', divisor: 1, casas: 0, spanMinimo: 200 },
  }[serie];

  return (
    <ScrollView style={s.tela} contentContainerStyle={{ padding: espaco.lg, gap: espaco.lg, paddingBottom: espaco.lg + bottom }}>
      <View>
        <Text style={s.nome}>{colmeia.nome}</Text>
        <Text style={s.frescor}>{fmtFrescor(colmeia.ultima_ms)}</Text>
        {velho && !semDados && (
          <Text style={s.velho}>{t('colmeia.leituras_antigas')}</Text>
        )}
        {colmeia.total > 0 && (
          <Text style={s.sync}>
            {colmeia.pendentes > 0
              ? tp('colmeia.pendentes', colmeia.pendentes)
              : t('colmeia.tudo_salvo')}
          </Text>
        )}
      </View>

      {semDados ? (
        <Text style={s.aviso}>{t('colmeia.sem_leitura')}</Text>
      ) : (
        <>
          {/* Ordem FIXA, sempre a mesma */}
          <View style={s.cards}>
            <Card rotulo={t('grandeza.temperatura')}
              valor={fmtTemp(colmeia.temp_c100, colmeia.temp_offset_c100)} />
            <Card rotulo={t('grandeza.umidade')} valor={fmtUmidade(colmeia.rh_x100)} />
            <Card rotulo={t('grandeza.volateis')} valor={fmtVolateis(colmeia.tvoc_ppb)} />
            <Card rotulo={t('grandeza.bateria')} valor={fmtBateria(colmeia.batt_mv)} />
          </View>

          {/* O texto que impede o erro metodológico. Não é tooltip, é o cartão. */}
          <View style={s.explicacao}>
            <Text style={s.explicacaoTitulo}>{t('colmeia.volateis.titulo')}</Text>
            <Text style={s.explicacaoTexto}>
              {t('colmeia.volateis.texto')}
              {'\n'}
              <Text style={s.negrito}>{t('colmeia.volateis.nao_e')}</Text>{' '}
              {t('colmeia.volateis.uso')}
            </Text>
          </View>

          <View>
            <View style={s.abas} accessibilityRole="radiogroup">
              {(['temp', 'rh', 'tvoc'] as Serie[]).map((k) => (
                <Pressable key={k} onPress={() => setSerie(k)}
                  accessibilityRole="radio" accessibilityState={{ checked: serie === k }}
                  accessibilityLabel={t(NOME_SERIE[k].titulo)}
                  style={StyleSheet.flatten([s.aba, serie === k && s.abaAtiva])}>
                  <Text style={[s.abaTexto, serie === k && s.abaTextoAtivo]}>
                    {t(NOME_SERIE[k].aba)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={s.abas} accessibilityRole="radiogroup">
              {([7, 30] as const).map((d) => (
                <Pressable key={d} onPress={() => setJanela(d)}
                  accessibilityRole="radio" accessibilityState={{ checked: janela === d }}
                  style={StyleSheet.flatten([s.aba, janela === d && s.abaAtiva])}>
                  <Text style={[s.abaTexto, janela === d && s.abaTextoAtivo]}>
                    {tp('colmeia.janela', d)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.graficoTitulo}>{t(NOME_SERIE[serie].titulo)}</Text>
            <View onLayout={(e: LayoutChangeEvent) =>
              setLargura(Math.round(e.nativeEvent.layout.width))}>
              {/* width numérico explícito — na web o SVG não deriva de viewBox */}
              <Grafico pontos={pontos} largura={largura} altura={210}
                sufixo={cfg.sufixo} divisor={cfg.divisor} casas={cfg.casas}
                spanMinimo={cfg.spanMinimo} />
            </View>
            <Text style={s.rodapeGrafico}>{tp('colmeia.grafico.dias', diarias.length)}</Text>
            {excluidas > 0 && (
              <Text style={s.rodapeGrafico}>{tp('colmeia.grafico.excluidas', excluidas)}</Text>
            )}
            {/* Feature 003 (FR-017): fora do gráfico, mas contadas — em tom neutro (FR-020). */}
            {semHora > 0 && <Text style={s.notaSemHora}>{tp('hora.sem_hora', semHora)}</Text>}
          </View>
        </>
      )}

      {placa && (
        <View style={s.intervalo}>
          <Text style={s.graficoTitulo} accessibilityRole="header">{t('colmeia.intervalo.titulo')}</Text>
          <Text style={s.notaSemHora}>{t('colmeia.horas_estimadas')}</Text>
          <Text style={s.notaSemHora}>{t('colmeia.intervalo.ajuda')}</Text>
          <View style={s.opcoes} accessibilityRole="radiogroup">
            {OPCOES_INTERVALO_PLACA_S.map((seg) => {
              const marcada = placa.intervaloS === seg;
              return (
                <Pressable key={seg} onPress={() => { void escolherIntervalo(seg); }}
                  accessibilityRole="radio" accessibilityState={{ checked: marcada }}
                  style={StyleSheet.flatten([s.opcao, marcada && s.opcaoMarcada])}>
                  <View style={StyleSheet.flatten([s.marca, marcada && s.marcaCheia])} />
                  <Text style={[s.opcaoTexto, marcada && s.opcaoTextoMarcada]}>{rotuloDoIntervalo(seg)}</Text>
                </Pressable>
              );
            })}
          </View>
          {intervaloFalhou && (
            <Text style={s.velho} accessibilityRole="alert">{t('colmeia.intervalo.nao_salvou')}</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function Card({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={s.card}>
      <Text style={s.cardRotulo}>{rotulo}</Text>
      <Text style={s.cardValor}>{valor}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  nome: { fontSize: tipo.titulo + 4, fontWeight: '700', color: cores.texto },
  frescor: { fontSize: tipo.corpo, color: cores.textoFraco, marginTop: 2 },
  velho: { fontSize: tipo.corpo, color: cores.atencao, marginTop: espaco.sm,
    fontWeight: '600' },
  sync: { fontSize: tipo.rotulo, color: cores.neutro, marginTop: espaco.xs },
  aviso: { fontSize: tipo.corpo, color: cores.textoFraco, padding: espaco.lg },

  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.md },
  card: { flexGrow: 1, flexBasis: '45%', padding: espaco.md,
    backgroundColor: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderColor: cores.linha },
  cardRotulo: { fontSize: tipo.rotulo, color: cores.textoFraco },
  cardValor: { fontSize: tipo.leitura, fontWeight: '700', color: cores.texto,
    marginTop: 2, fontVariant: ['tabular-nums'] },

  explicacao: { padding: espaco.md, backgroundColor: cores.superficie,
    borderRadius: raio.md, borderLeftWidth: 4, borderLeftColor: cores.acento,
    borderWidth: 1, borderColor: cores.linha },
  explicacaoTitulo: { fontSize: tipo.corpo, fontWeight: '700', color: cores.texto },
  explicacaoTexto: { fontSize: tipo.rotulo + 1, color: cores.textoFraco,
    marginTop: espaco.xs, lineHeight: 21 },
  negrito: { fontWeight: '700', color: cores.texto },

  // Alvos de 56 dp com 12 dp entre eles (Princípio V); a borda é o limite do
  // alvo, então usa o token de controle (>= 3:1).
  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: alvo.espacamento,
    marginBottom: alvo.espacamento },
  aba: { minHeight: alvo.minimo, paddingHorizontal: espaco.md,
    justifyContent: 'center', borderRadius: raio.sm, borderWidth: 1,
    borderColor: cores.bordaControle, backgroundColor: cores.superficie },
  abaAtiva: { borderColor: cores.acento, borderWidth: 2, backgroundColor: '#FDF6EC' },
  abaTexto: { fontSize: tipo.rotulo, color: cores.textoFraco, fontWeight: '600' },
  abaTextoAtivo: { color: cores.acento },
  graficoTitulo: { fontSize: tipo.corpo, fontWeight: '700', color: cores.texto,
    marginBottom: espaco.sm, marginTop: espaco.xs },
  rodapeGrafico: { fontSize: tipo.rotulo, color: cores.textoFraco, marginTop: espaco.sm,
    lineHeight: 20 },
  // Intervalo da placa (005): opção = borda grossa + marca cheia + texto em
  // negrito quando escolhida; nunca só a cor.
  intervalo: { gap: espaco.sm },
  opcoes: { gap: alvo.espacamento, marginTop: espaco.sm },
  opcao: { minHeight: alvo.minimo, flexDirection: 'row', alignItems: 'center', gap: espaco.md,
    paddingHorizontal: espaco.lg, borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.bordaControle, backgroundColor: cores.superficie },
  opcaoMarcada: { borderWidth: 3, borderColor: cores.texto },
  opcaoTexto: { flexShrink: 1, fontSize: tipo.corpo, color: cores.texto },
  opcaoTextoMarcada: { fontWeight: '700' },
  marca: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: cores.bordaControle },
  marcaCheia: { backgroundColor: cores.texto, borderColor: cores.texto },
  // Texto novo da 003 já nasce no mínimo de corpo (Princípio V: ≥ 16 sp).
  notaSemHora: { fontSize: tipo.corpo, color: cores.textoFraco, marginTop: espaco.sm,
    lineHeight: 22 },
});
