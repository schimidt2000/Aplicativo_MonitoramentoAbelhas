/**
 * Colmeias — a tela inicial. Mostra dois eixos que NUNCA viram um crachá só:
 * frescor (há quanto tempo é o dado) e sincronização (já saiu do celular?).
 *
 * A barra de estado à esquerda do card codifica FRESCOR, e só frescor, em
 * escala de cinza: dado antigo não é erro e nunca aparece em vermelho. Cor
 * de alerta fica reservada à bateria, sempre acompanhada da palavra e do
 * ícone — nenhum estado é transmitido só por cor (Princípio V).
 */
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { useDb } from '@/data/provider';
import { lerConfig, listarColmeias, nomeDoApiario, type LinhaColmeia } from '@/data/repo';
import { CHAVE_INTERVALO, INTERVALO_PADRAO } from '@/core/preferencias';
import { t, tp } from '@/core/i18n';
import { IconeAlerta } from '@/ui/Icones';
import { useModoSol } from '@/ui/ModoSol';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';
import {
  diasDesde, estadoBateria, fmtBateria, fmtFrescor, fmtNivelColeta, fmtNumero,
  fmtTemp, fmtUmidade, fmtVolateis, nivelColeta,
  type EstadoBateria, type NivelColeta,
} from '@/core/format';

/**
 * A cor do frescor ESCALA até o vermelho conforme a coleta atrasa. Não é
 * "dado velho = erro": é ação pendente. O app existe para levar o apicultor
 * até a colmeia, e passar muito do intervalo significa arriscar encher o
 * buffer do nó. A palavra acompanha sempre a cor (Princípio V).
 */
const COR_NIVEL: Record<NivelColeta, string> = {
  'sem-coleta': cores.linha,
  'em-dia': cores.ok,
  'chegando': cores.acento,
  'atrasada': cores.atencao,
  'muito-atrasada': cores.perigo,
};

export default function Colmeias() {
  const { db } = useDb();
  const { sol, alternar } = useModoSol();
  const [linhas, setLinhas] = useState<LinhaColmeia[]>([]);
  const [local, setLocal] = useState<string | null>(null);
  const [intervalo, setIntervalo] = useState(INTERVALO_PADRAO);

  useFocusEffect(
    useCallback(() => {
      setLinhas(listarColmeias(db));
      setLocal(nomeDoApiario(db));
      setIntervalo(Number(lerConfig(db, CHAVE_INTERVALO, String(INTERVALO_PADRAO))));
    }, [db]),
  );

  const totais = useMemo(() => {
    const comDados = linhas.filter((l) => l.ultima_ms !== null);
    const atrasadas = comDados.filter((l) => {
      const n = nivelColeta(l.ultima_ms, intervalo);
      return n === 'atrasada' || n === 'muito-atrasada';
    });
    return {
      semColeta: linhas.length - comDados.length,
      pendentes: linhas.reduce((a, l) => a + (l.pendentes ?? 0), 0),
      atrasadas,
    };
  }, [linhas, intervalo]);

  const escala = sol ? 1.15 : 1;
  // Altura MÍNIMA, nunca fixa: com a fonte do sistema a 150-200% o card cresce
  // em vez de cortar o rodapé "No celular / Na nuvem" (Princípio I e V).
  const alturaMinima = sol ? 186 : 158;

  return (
    <View style={s.tela}>
      <View style={s.cabecalho}>
        <View style={{ flex: 1 }}>
          {local !== null && (
            <Text style={[s.local, { fontSize: tipo.rotulo * escala }]}>{local}</Text>
          )}
          <Text style={[s.resumo, { fontSize: tipo.titulo * escala }]}>
            {tp('colmeias.total', linhas.length)}
          </Text>
          {totais.semColeta > 0 && (
            <Text style={[s.sub, { fontSize: tipo.rotulo * escala }]}>
              {tp('colmeias.sem_coleta', totais.semColeta)}
            </Text>
          )}
          {totais.pendentes > 0 && (
            <Text style={[s.chipSync, { fontSize: tipo.rotulo * escala }]}>
              {tp('colmeias.para_enviar', totais.pendentes)}
            </Text>
          )}
        </View>
        <Pressable
          onPress={alternar}
          style={StyleSheet.flatten([s.botaoSol, sol && s.botaoSolAtivo])}
          accessibilityRole="switch"
          accessibilityState={{ checked: sol }}
          accessibilityLabel={t('colmeias.sol.alternar')}
        >
          <Text style={[s.botaoSolTexto, sol && s.botaoSolTextoAtivo]}>
            {t(sol ? 'colmeias.sol.ligado' : 'colmeias.sol.desligado')}
          </Text>
        </Pressable>
      </View>

      {totais.atrasadas.length > 0 && (
        <View style={s.avisoColeta}>
          <View style={[s.avisoBarra, {
            backgroundColor: totais.atrasadas.some(
              (l) => nivelColeta(l.ultima_ms, intervalo) === 'muito-atrasada')
              ? cores.perigo : cores.atencao,
          }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.avisoTitulo}>
              {tp('colmeias.atraso.titulo', totais.atrasadas.length)}
            </Text>
            <Text style={s.avisoTexto}>
              {tp('colmeias.atraso.intervalo', intervalo)}
            </Text>
            <Text style={s.avisoTexto}>
              {tp('colmeias.atraso.pior', Math.max(
                ...totais.atrasadas.map((l) => diasDesde(l.ultima_ms) ?? 0),
              ))}
            </Text>
          </View>
        </View>
      )}

      <FlatList
        data={linhas}
        keyExtractor={(i) => i.hive_id}
        // Sem getItemLayout: a altura real depende da fonte do sistema e do
        // marcador de coleta incompleta. A lista tem dezenas de colmeias, não
        // milhares, e a virtualização segue funcionando medindo cada card.
        removeClippedSubviews
        initialNumToRender={15}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: espaco.xl }}
        renderItem={({ item }) => (
          <LinhaCard item={item} sol={sol} alturaMinima={alturaMinima}
            intervalo={intervalo} />
        )}
      />

    </View>
  );
}

function LinhaCard({ item, sol, alturaMinima, intervalo }: {
  item: LinhaColmeia; sol: boolean; alturaMinima: number; intervalo: number;
}) {
  const escala = sol ? 1.15 : 1;
  const semDados = item.ultima_ms === null;
  const bat = estadoBateria(item.batt_mv);
  const nivel = nivelColeta(item.ultima_ms, intervalo);
  const corBarra = COR_NIVEL[nivel];
  const alerta = nivel === 'atrasada' || nivel === 'muito-atrasada';
  // Fica visível até uma coleta terminar bem: o problema não some só porque a
  // pessoa saiu da tela de Coletar.
  const incompleta = item.ultimo_resultado !== null && item.ultimo_resultado !== 'ok';

  return (
    <Link href={{ pathname: '/colmeia/[id]', params: { id: item.hive_id } }} asChild>
      <Pressable style={StyleSheet.flatten([
        s.card, { minHeight: alturaMinima }, sol && s.cardSol,
      ])}>
        <View style={[s.barraEstado, { backgroundColor: corBarra }]} />

        <View style={s.cardCorpo}>
          <View style={s.cardTopo}>
            <Text style={[s.cardNome, { fontSize: tipo.corpo * escala }]}
              numberOfLines={1}>
              {item.nome}
            </Text>
            <View style={s.frescorConjunto}>
              <Text style={[s.cardFrescor, { fontSize: tipo.rotulo * escala }]}>
                {fmtFrescor(item.ultima_ms)}
              </Text>
              {alerta && (
                <Text style={[s.cardNivel, {
                  fontSize: tipo.rotulo * escala, color: corBarra,
                }]}>
                  {fmtNivelColeta(nivel)}
                </Text>
              )}
            </View>
          </View>

          {/*
            Linha própria, de largura total, e sem truncar: espremida ao lado do
            nome, a 200% a frase virava "Última cole…" e perdia justamente a
            palavra, que é o canal que diz o que houve. Ícone em âmbar é a cor;
            o texto fica na cor primária (>= 7:1).
          */}
          {incompleta && (
            <View style={s.linhaIncompleta}>
              <IconeAlerta cor={cores.atencao} tamanho={Math.round(16 * escala)} />
              <Text style={[s.cardIncompleta, { fontSize: tipo.rotulo * escala }]}>
                {t('colmeias.cartao.coleta_incompleta')}
              </Text>
            </View>
          )}

          {semDados ? (
            <Text style={[s.semDados, { fontSize: tipo.corpo * escala }]}>
              {t('colmeias.cartao.sem_leitura')}
            </Text>
          ) : (
            <>
              <View style={s.linhaHero}>
                <Text style={[s.heroValor, { fontSize: (tipo.leitura - 2) * escala }]}>
                  {fmtTemp(item.temp_c100, item.temp_offset_c100)}
                </Text>
                <View style={StyleSheet.flatten([
                  s.chipBateria,
                  bat === 'trocar-agora' && s.chipPerigo,
                  bat === 'trocar-em-breve' && s.chipAtencao,
                ])}>
                  <IconeBateria estado={bat} />
                  <Text style={[s.chipBateriaTexto, {
                    fontSize: tipo.rotulo * escala,
                    color: bat === 'trocar-agora' ? cores.perigo
                      : bat === 'trocar-em-breve' ? cores.atencao : cores.textoFraco,
                  }]} numberOfLines={1}>
                    {fmtBateria(item.batt_mv)}
                  </Text>
                </View>
              </View>

              <View style={s.linhaSecundaria}>
                <Text style={[s.secundario, { fontSize: tipo.rotulo * escala }]}>
                  {t('grandeza.umidade')}{' '}
                  <Text style={s.secundarioForte}>{fmtUmidade(item.rh_x100)}</Text>
                </Text>
                <Text style={[s.secundario, { fontSize: tipo.rotulo * escala }]}>
                  {t('grandeza.volateis_curto')}{' '}
                  <Text style={s.secundarioForte}>{fmtVolateis(item.tvoc_ppb)}</Text>
                </Text>
              </View>
            </>
          )}

          {/*
            Princípio I: "salvo no celular" e "salvo na nuvem" são estados
            DISTINTOS e simultaneamente visíveis. Nunca viram um crachá só.
          */}
          {item.total > 0 && (
            <View style={s.cardRodape}>
              <Text style={[s.sync, { fontSize: tipo.rotulo * escala }]}>
                {t('colmeias.cartao.no_celular')}{' '}
                <Text style={s.syncForte}>{fmtNumero(item.total)}</Text>
              </Text>
              <Text style={[
                s.sync,
                { fontSize: tipo.rotulo * escala },
                item.pendentes === 0 && s.syncCompleto,
              ]}>
                {t('colmeias.cartao.na_nuvem')}{' '}
                <Text style={[
                  s.syncForte, item.pendentes === 0 && s.syncCompleto,
                ]}>
                  {fmtNumero(item.total - item.pendentes)}
                </Text>
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

/**
 * Bateria desenhada com View, não com caractere de fonte: glifo de bloco cai
 * em "tofu" dependendo da fonte do sistema, e fonte de ícone está proibida.
 * O nível é qualitativo de propósito — a curva de descarga é plana e depois
 * despenca, então porcentagem mentiria (FR-022). A palavra vem ao lado.
 */
function IconeBateria({ estado }: { estado: EstadoBateria }) {
  const cor = estado === 'trocar-agora' ? cores.perigo
    : estado === 'trocar-em-breve' ? cores.atencao
    : estado === 'boa' ? cores.ok : cores.textoFraco;
  const nivel = estado === 'boa' ? 1 : estado === 'trocar-em-breve' ? 0.45 : 0.15;

  return (
    <View style={s.batConjunto}>
      <View style={[s.batCorpo, { borderColor: cor }]}>
        <View style={{ flex: nivel, backgroundColor: cor, borderRadius: 1 }} />
        <View style={{ flex: 1 - nivel }} />
      </View>
      <View style={[s.batPonta, { backgroundColor: cor }]} />
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },

  batConjunto: { flexDirection: 'row', alignItems: 'center' },
  batCorpo: { width: 17, height: 10, borderWidth: 1.5, borderRadius: 2.5,
    flexDirection: 'row', padding: 1.5 },
  batPonta: { width: 2, height: 4, borderTopRightRadius: 1,
    borderBottomRightRadius: 1, marginLeft: 1 },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: espaco.md,
    paddingHorizontal: espaco.lg, paddingTop: espaco.md, paddingBottom: espaco.md },
  local: { color: cores.textoFraco },
  resumo: { color: cores.texto, fontWeight: '700', marginTop: 2 },
  sub: { color: cores.textoFraco, marginTop: 2 },
  chipSync: { color: cores.neutro, marginTop: espaco.xs },
  botaoSol: { minHeight: alvo.minimo, justifyContent: 'center',
    paddingHorizontal: espaco.md, borderWidth: 1, borderColor: cores.bordaControle,
    borderRadius: raio.md, backgroundColor: cores.superficie },
  botaoSolAtivo: { borderColor: cores.acento, borderWidth: 2 },
  botaoSolTexto: { fontSize: tipo.rotulo, color: cores.textoFraco, fontWeight: '600' },
  botaoSolTextoAtivo: { color: cores.acento },

  avisoColeta: { flexDirection: 'row', marginHorizontal: espaco.lg,
    marginBottom: espaco.md, backgroundColor: cores.superficie,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.linha,
    overflow: 'hidden' },
  avisoBarra: { width: 6 },
  avisoTitulo: { fontSize: tipo.corpo, fontWeight: '700', color: cores.texto,
    paddingTop: espaco.md, paddingHorizontal: espaco.md },
  avisoTexto: { fontSize: tipo.rotulo, color: cores.textoFraco,
    paddingHorizontal: espaco.md, paddingBottom: espaco.md, paddingTop: 2,
    lineHeight: 20 },

  linhaIncompleta: { flexDirection: 'row', alignItems: 'center', gap: espaco.xs + 2 },
  cardIncompleta: { color: cores.texto, fontWeight: '700', flex: 1 },
  frescorConjunto: { alignItems: 'flex-end' },
  cardNivel: { fontWeight: '700', marginTop: 1 },

  // O card inteiro é o alvo de toque, e a borda é o limite dele: >= 3:1.
  card: { flexDirection: 'row', marginHorizontal: espaco.lg, marginBottom: espaco.md,
    backgroundColor: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderColor: cores.bordaControle, overflow: 'hidden' },
  cardSol: { borderWidth: 2 },
  barraEstado: { width: 6 },
  cardCorpo: { flex: 1, padding: espaco.md, justifyContent: 'space-between',
    gap: espaco.xs },

  cardTopo: { flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', gap: espaco.sm },
  cardNome: { fontWeight: '700', color: cores.texto, flexShrink: 1 },
  cardFrescor: { color: cores.textoFraco },
  semDados: { color: cores.textoFraco },

  linhaHero: { flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: espaco.sm },
  heroValor: { fontWeight: '700', color: cores.texto, fontVariant: ['tabular-nums'] },
  chipBateria: { flexDirection: 'row', alignItems: 'center', gap: espaco.xs + 2,
    paddingHorizontal: espaco.sm, paddingVertical: 4,
    borderRadius: raio.sm, borderWidth: 1, borderColor: cores.linha,
    backgroundColor: cores.fundo, flexShrink: 1 },
  chipAtencao: { borderColor: cores.atencao },
  chipPerigo: { borderColor: cores.perigo },
  chipBateriaTexto: { fontWeight: '700' },

  linhaSecundaria: { flexDirection: 'row', gap: espaco.lg },
  secundario: { color: cores.textoFraco },
  secundarioForte: { color: cores.texto, fontWeight: '700',
    fontVariant: ['tabular-nums'] },

  cardRodape: { flexDirection: 'row', justifyContent: 'space-between',
    gap: espaco.sm },
  sync: { color: cores.neutro },
  syncForte: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  syncCompleto: { color: cores.ok },

});
