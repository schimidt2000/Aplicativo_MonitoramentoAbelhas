/**
 * Início — a tela-base do app (feature 008). Sem abas: daqui o apicultor vê as
 * colmeias, coleta (botão fixo embaixo, ao alcance do polegar), envia e chega a
 * Ajustes.
 *
 * Cada cartão responde a uma pergunta só: "preciso fazer alguma coisa nesta
 * colmeia?". A resposta é UMA linha de situação, com cor + ícone + palavra
 * (Princípio V), escolhida por `situacaoDaColmeia`. Frescor (há quanto tempo é
 * o dado) e envio (já saiu do celular?) continuam eixos separados e nunca viram
 * um crachá só: "No celular" e "Na nuvem" ficam visíveis em cada cartão
 * (Princípio I).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '@/data/provider';
import {
  contarLeituras, diasDeVolateis, lerConfig, listarColmeias, nomeDoApiario, totalPendentes,
  type LinhaColmeia,
} from '@/data/repo';
import { enviando as haEnvioEmAndamento, enviarUmPorVez } from '@/data/envioUnico';
import { obterNuvem } from '@/nuvem';
import type { MotivoFalha } from '@/core/ports/nuvem';
import { mensagemDeParada } from '@/core/envio/mensagens';
import {
  classificarVolateis, diaDeReferencia, JANELA_DO_NORMAL_DIAS, normalDaColmeia, type NormalDaColmeia,
} from '@/core/volateis';
import {
  precisaVisita, situacaoDaColmeia, tomDaSituacao, type Situacao, type TomSituacao,
} from '@/core/situacao';
import { CHAVE_INTERVALO, INTERVALO_PADRAO } from '@/core/preferencias';
import { t, tp } from '@/core/i18n';
import { IconeAlerta, IconeCheck } from '@/ui/Icones';
import { IconeRelogio } from '@/ui/IconesCabo';
import { useModoSol } from '@/ui/ModoSol';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';
import {
  diasDesde, fmtFrescor, fmtNumero, fmtTemp, fmtUmidade, fmtVolateisRelativo,
  type EstadoBateria,
} from '@/core/format';

const COR_DO_TOM: Record<TomSituacao, string> = {
  perigo: cores.perigo,
  atencao: cores.atencao,
  neutro: cores.neutro,
  ok: cores.ok,
};

/** A barra lateral do cartão: tudo certo e "ainda sem coleta" ficam discretos. */
const BARRA_DO_TOM: Record<TomSituacao, string> = {
  perigo: cores.perigo,
  atencao: cores.atencao,
  neutro: cores.linha,
  ok: cores.ok,
};

interface Envio {
  noCelular: number;
  pendentes: number;
  enviando: boolean;
  /** Por que o último envio parou; null quando terminou ou nunca houve. */
  parou: MotivoFalha | null;
}

export default function Inicio() {
  const { db } = useDb();
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const { sol, alternar } = useModoSol();
  const nuvem = useMemo(() => obterNuvem(), []);
  const [linhas, setLinhas] = useState<LinhaColmeia[]>([]);
  // Feature 007: o normal de voláteis de cada colmeia, calculado ao carregar, nunca no render.
  const [normais, setNormais] = useState<Map<string, NormalDaColmeia>>(new Map());
  const [local, setLocal] = useState<string | null>(null);
  const [intervalo, setIntervalo] = useState(INTERVALO_PADRAO);
  const [envio, setEnvio] = useState<Envio>({ noCelular: 0, pendentes: 0, enviando: false, parou: null });
  const montada = useRef(true);

  const recarregar = useCallback(() => {
    const lista = listarColmeias(db);
    setLinhas(lista);
    const m = new Map<string, NormalDaColmeia>();
    for (const c of lista) {
      if (c.node_id === null) continue;
      try {
        const ref = diaDeReferencia(c.ultima_ms, Date.now());
        m.set(c.hive_id, normalDaColmeia(diasDeVolateis(db, c.node_id, ref, JANELA_DO_NORMAL_DIAS), ref));
      } catch { /* sem normal: a linha diz que está aprendendo */ }
    }
    setNormais(m);
    setLocal(nomeDoApiario(db));
    setIntervalo(Number(lerConfig(db, CHAVE_INTERVALO, String(INTERVALO_PADRAO))));
    setEnvio((e) => ({ ...e, noCelular: contarLeituras(db), pendentes: totalPendentes(db) }));
  }, [db]);

  /**
   * Envia em segundo plano. Nunca no render; um envio por vez (`envioUnico`).
   * `pedido` distingue o toque em "Enviar agora" do envio automático: só o
   * toque leva a ligar o celular ao projeto.
   */
  const enviar = useCallback(async (pedido: boolean) => {
    const vinculo = await nuvem.vinculoAtual();
    if (!vinculo) {
      if (pedido) router.push('/vincular');
      return;
    }
    if (totalPendentes(db) === 0) return;
    setEnvio((e) => ({ ...e, enviando: true, parou: null }));
    const r = await enviarUmPorVez(db, nuvem);
    if (!montada.current) return;
    setEnvio({ noCelular: contarLeituras(db), pendentes: totalPendentes(db), enviando: false, parou: r.parou });
    recarregar();
  }, [db, nuvem, router, recarregar]);

  useFocusEffect(
    useCallback(() => {
      montada.current = true;
      recarregar();
      // FR-007: com o celular ligado ao projeto, as leituras saem sozinhas.
      if (!haEnvioEmAndamento()) void enviar(false);
      return () => { montada.current = false; };
    }, [recarregar, enviar]),
  );

  const situacoes = useMemo(() => {
    const m = new Map<string, Situacao>();
    for (const l of linhas) {
      m.set(l.hive_id, situacaoDaColmeia({
        coletadaMs: l.coletada_ms, intervaloDias: intervalo,
        battMv: l.batt_mv, ultimoResultado: l.ultimo_resultado,
      }));
    }
    return m;
  }, [linhas, intervalo]);

  const paraVisitar = useMemo(
    () => [...situacoes.values()].filter(precisaVisita).length, [situacoes]);

  const escala = sol ? 1.15 : 1;
  // Altura MÍNIMA, nunca fixa: com a fonte do sistema a 150-200% o card cresce.
  const alturaMinima = sol ? 172 : 148;

  return (
    <View style={[s.tela, { paddingTop: top }]}>
      <View style={s.cabecalho}>
        <View style={{ flex: 1 }}>
          {local !== null && (
            <Text style={[s.local, { fontSize: tipo.rotulo * escala }]}>{local}</Text>
          )}
          <Text style={[s.resumo, { fontSize: tipo.titulo * escala }]} accessibilityRole="header">
            {tp('colmeias.total', linhas.length)}
          </Text>
          {paraVisitar > 0 && (
            <Text style={[s.paraVisitar, { fontSize: tipo.corpo * escala }]}>
              {tp('inicio.para_visitar', paraVisitar)}
            </Text>
          )}
        </View>
        {/* Modo sol: um toque, no topo da tela (.claude/rules/ui.md). */}
        <Pressable
          onPress={alternar}
          style={StyleSheet.flatten([s.botaoTopo, sol && s.botaoTopoAtivo])}
          accessibilityRole="switch"
          accessibilityState={{ checked: sol }}
          accessibilityLabel={t('inicio.sol.alternar')}
        >
          <Text style={[s.botaoTopoTexto, sol && s.botaoTopoTextoAtivo]}>
            {t(sol ? 'inicio.sol.ligado' : 'inicio.sol.desligado')}
          </Text>
        </Pressable>
        <Link href="/ajustes" asChild>
          <Pressable style={s.botaoTopo} accessibilityRole="button">
            <Text style={s.botaoTopoTexto}>{t('inicio.ajustes')}</Text>
          </Pressable>
        </Link>
      </View>

      <LinhaDeEnvio envio={envio} escala={escala}
        aoEnviar={() => { void enviar(true); }}
        aoVerDetalhes={() => router.push('/enviar')} />

      <FlatList
        data={linhas}
        keyExtractor={(i) => i.hive_id}
        // Sem getItemLayout: a altura real depende da fonte do sistema.
        removeClippedSubviews
        initialNumToRender={15}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: espaco.lg }}
        ListEmptyComponent={
          <Text style={[s.vazio, { fontSize: tipo.corpo * escala }]}>{t('inicio.nenhuma')}</Text>
        }
        renderItem={({ item }) => (
          <LinhaCard item={item} sol={sol} alturaMinima={alturaMinima}
            situacao={situacoes.get(item.hive_id) ?? 'sem-coleta'}
            normal={normais.get(item.hive_id) ?? SEM_NORMAL} />
        )}
      />

      {/* A ação principal, no terço inferior (Princípio V). */}
      <View style={[s.rodape, { paddingBottom: espaco.lg + bottom }]}>
        <Link href="/coleta-cabo" asChild>
          <Pressable style={s.botaoColetar} accessibilityRole="button">
            <Text style={[s.botaoColetarTexto, { fontSize: (tipo.corpo + 4) * escala }]}>
              {t('inicio.coletar')}
            </Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const SEM_NORMAL: NormalDaColmeia = { ppb: null, dias: 0 };

/**
 * Os dois estados do envio, distintos e lado a lado (Princípio I), uma frase em
 * tom neutro e o "Enviar agora", que precisa estar visível (.claude/rules/sync.md).
 * Falta de internet nunca aparece como erro.
 */
function LinhaDeEnvio({ envio, escala, aoEnviar, aoVerDetalhes }: {
  envio: Envio; escala: number; aoEnviar: () => void; aoVerDetalhes: () => void;
}) {
  const naNuvem = envio.noCelular - envio.pendentes;
  const msg = envio.parou !== null && envio.parou !== 'sem-rede' ? mensagemDeParada(envio.parou) : null;
  const frase = envio.enviando ? t('inicio.envio.enviando')
    : envio.pendentes > 0 ? tp('inicio.envio.esperando', envio.pendentes)
    : envio.noCelular > 0 ? t('inicio.envio.tudo') : null;

  return (
    <View style={s.envio}>
      <Pressable onPress={aoVerDetalhes} accessibilityRole="button"
        accessibilityHint={t('inicio.envio.ver')} style={s.envioCorpo}>
        <View style={s.envioNumeros}>
          <Text style={[s.envioRotulo, { fontSize: tipo.rotulo * escala }]}>
            {t('inicio.envio.celular')}{' '}
            <Text style={s.envioNumero}>{fmtNumero(envio.noCelular)}</Text>
          </Text>
          <Text style={[s.envioRotulo, { fontSize: tipo.rotulo * escala }]}>
            {t('inicio.envio.nuvem')}{' '}
            <Text style={[s.envioNumero, envio.pendentes === 0 && envio.noCelular > 0 && s.envioCompleto]}>
              {fmtNumero(naNuvem)}
            </Text>
          </Text>
        </View>
        {frase !== null && (
          <Text style={[s.envioFrase, { fontSize: tipo.rotulo * escala }]}
            accessibilityLiveRegion="polite">{frase}</Text>
        )}
        {msg && (
          <View style={s.envioAviso}>
            <IconeAlerta cor={cores.atencao} tamanho={18} />
            <Text style={[s.envioAvisoTexto, { fontSize: tipo.rotulo * escala }]}>{msg.titulo}</Text>
          </View>
        )}
      </Pressable>
      {envio.pendentes > 0 && (
        <Pressable onPress={aoEnviar} disabled={envio.enviando}
          accessibilityRole="button" accessibilityState={{ disabled: envio.enviando, busy: envio.enviando }}
          style={StyleSheet.flatten([s.botaoEnviar, envio.enviando && s.botaoEnviarOcupado])}>
          <Text style={s.botaoEnviarTexto}>{t('inicio.envio.botao')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function textoDaSituacao(sit: Situacao, item: LinhaColmeia): string {
  switch (sit) {
    case 'incompleta': return t('situacao.incompleta');
    case 'bateria-agora': return t('situacao.bateria_agora');
    case 'muito-atrasada': return tp('situacao.muito_atrasada', diasDesde(item.coletada_ms) ?? 0);
    case 'atrasada': return tp('situacao.atrasada', diasDesde(item.coletada_ms) ?? 0);
    case 'bateria-breve': return t('situacao.bateria_breve');
    case 'chegando': return t('situacao.chegando');
    case 'sem-coleta': return t('situacao.sem_coleta');
    case 'em-dia': return t('situacao.em_dia');
  }
}

function IconeDaSituacao({ sit, cor, tamanho }: { sit: Situacao; cor: string; tamanho: number }) {
  switch (sit) {
    case 'bateria-agora': return <IconeBateria estado="trocar-agora" />;
    case 'bateria-breve': return <IconeBateria estado="trocar-em-breve" />;
    case 'em-dia': return <IconeCheck cor={cor} tamanho={tamanho} />;
    case 'chegando':
    case 'sem-coleta': return <IconeRelogio cor={cor} tamanho={tamanho} />;
    default: return <IconeAlerta cor={cor} tamanho={tamanho} />;
  }
}

function LinhaCard({ item, sol, alturaMinima, situacao, normal }: {
  item: LinhaColmeia; sol: boolean; alturaMinima: number; situacao: Situacao; normal: NormalDaColmeia;
}) {
  const escala = sol ? 1.15 : 1;
  const semDados = item.ultima_ms === null;
  // Coletada, mas nenhuma leitura com hora ainda (nó sem noção de tempo).
  const semHora = semDados && item.total > 0;
  const tom = tomDaSituacao(situacao);
  const cor = COR_DO_TOM[tom];

  return (
    <Link href={{ pathname: '/colmeia/[id]', params: { id: item.hive_id } }} asChild>
      <Pressable style={StyleSheet.flatten([
        s.card, { minHeight: alturaMinima }, sol && s.cardSol,
      ])}>
        <View style={[s.barraEstado, { backgroundColor: BARRA_DO_TOM[tom] }]} />

        <View style={s.cardCorpo}>
          <View style={s.cardTopo}>
            <Text style={[s.cardNome, { fontSize: (tipo.corpo + 2) * escala }]} numberOfLines={2}>
              {item.nome}
            </Text>
            {/* Frescor em cinza, nunca vermelho: dado antigo não é erro. */}
            {!semDados && (
              <Text style={[s.cardFrescor, { fontSize: tipo.rotulo * escala }]}>
                {fmtFrescor(item.ultima_ms)}
              </Text>
            )}
          </View>

          {/* A única linha de situação: ícone na cor, palavra na cor primária (>= 7:1). */}
          <View style={s.linhaSituacao}>
            <IconeDaSituacao sit={situacao} cor={cor} tamanho={Math.round(18 * escala)} />
            <Text style={[s.situacaoTexto, { fontSize: tipo.corpo * escala }]}>
              {textoDaSituacao(situacao, item)}
            </Text>
          </View>

          {semDados ? (
            semHora && (
              <Text style={[s.semDados, { fontSize: tipo.rotulo * escala }]}>
                {t('colmeias.cartao.sem_hora')}
              </Text>
            )
          ) : (
            <View style={s.linhaHero}>
              <Text style={[s.heroValor, { fontSize: (tipo.leitura - 2) * escala }]}>
                {fmtTemp(item.temp_c100, item.temp_offset_c100)}
              </Text>
              <View style={s.secundarios}>
                <Text style={[s.secundario, { fontSize: tipo.rotulo * escala }]}>
                  {t('grandeza.umidade')}{' '}
                  <Text style={s.secundarioForte}>{fmtUmidade(item.rh_x100)}</Text>
                </Text>
                <Text style={[s.secundario, { fontSize: tipo.rotulo * escala }]}>
                  {t('grandeza.volateis_curto')}{' '}
                  <Text style={s.secundarioForte}>
                    {fmtVolateisRelativo(classificarVolateis(item.tvoc_ppb, normal), 'curta')}
                  </Text>
                </Text>
              </View>
            </View>
          )}

          {/* Princípio I: "no celular" e "na nuvem" distintos e visíveis por colmeia. */}
          {item.total > 0 && (
            <Text style={[s.sync, { fontSize: tipo.rotulo * escala }]}>
              {t('colmeias.cartao.no_celular')}{' '}
              <Text style={s.syncForte}>{fmtNumero(item.total)}</Text>
              {'   '}
              {t('colmeias.cartao.na_nuvem')}{' '}
              <Text style={[s.syncForte, item.pendentes === 0 && s.syncCompleto]}>
                {fmtNumero(item.total - item.pendentes)}
              </Text>
            </Text>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

/**
 * Bateria desenhada com View, não com caractere de fonte: glifo de bloco cai
 * em "tofu" dependendo da fonte do sistema, e fonte de ícone está proibida.
 * O nível é qualitativo de propósito (FR-022 da 001): a palavra vem ao lado.
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
  batCorpo: { width: 20, height: 12, borderWidth: 1.5, borderRadius: 2.5,
    flexDirection: 'row', padding: 1.5 },
  batPonta: { width: 2, height: 5, borderTopRightRadius: 1,
    borderBottomRightRadius: 1, marginLeft: 1 },

  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: alvo.espacamento,
    paddingHorizontal: espaco.lg, paddingTop: espaco.md, paddingBottom: espaco.md },
  local: { color: cores.textoFraco },
  resumo: { color: cores.texto, fontWeight: '700', marginTop: 2 },
  paraVisitar: { color: cores.texto, fontWeight: '600', marginTop: 2 },
  botaoTopo: { minHeight: alvo.minimo, minWidth: alvo.minimo, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: espaco.md, borderWidth: 1,
    borderColor: cores.bordaControle, borderRadius: raio.md, backgroundColor: cores.superficie },
  botaoTopoAtivo: { borderColor: cores.acento, borderWidth: 2 },
  botaoTopoTexto: { fontSize: tipo.rotulo, color: cores.texto, fontWeight: '700' },
  botaoTopoTextoAtivo: { color: cores.acento },

  envio: { flexDirection: 'row', alignItems: 'center', gap: alvo.espacamento,
    marginHorizontal: espaco.lg, marginBottom: espaco.md, padding: espaco.md,
    backgroundColor: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderColor: cores.linha },
  envioCorpo: { flex: 1, gap: 2, minHeight: alvo.minimo, justifyContent: 'center' },
  envioNumeros: { flexDirection: 'row', flexWrap: 'wrap', columnGap: espaco.lg, rowGap: 2 },
  envioRotulo: { color: cores.neutro },
  envioNumero: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  envioCompleto: { color: cores.ok },
  envioFrase: { color: cores.textoFraco, lineHeight: 20 },
  envioAviso: { flexDirection: 'row', alignItems: 'center', gap: espaco.xs + 2 },
  envioAvisoTexto: { flex: 1, color: cores.texto, fontWeight: '600' },
  botaoEnviar: { minHeight: alvo.minimo, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: espaco.md, borderRadius: raio.md, borderWidth: 2,
    borderColor: cores.acento, backgroundColor: cores.fundo },
  botaoEnviarOcupado: { opacity: 0.5 },
  botaoEnviarTexto: { fontSize: tipo.rotulo + 1, fontWeight: '700', color: cores.acento,
    textAlign: 'center' },

  vazio: { color: cores.textoFraco, paddingHorizontal: espaco.lg, lineHeight: 24 },

  // O card inteiro é o alvo de toque, e a borda é o limite dele: >= 3:1.
  card: { flexDirection: 'row', marginHorizontal: espaco.lg, marginBottom: espaco.md,
    backgroundColor: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderColor: cores.bordaControle, overflow: 'hidden' },
  cardSol: { borderWidth: 2 },
  barraEstado: { width: 8 },
  cardCorpo: { flex: 1, padding: espaco.md, gap: espaco.xs + 2 },

  // Todas as linhas do card quebram em vez de cortar: fonte do sistema em 200%.
  cardTopo: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    alignItems: 'center', columnGap: espaco.sm, rowGap: 2 },
  cardNome: { fontWeight: '700', color: cores.texto, flexShrink: 1 },
  cardFrescor: { color: cores.textoFraco },

  linhaSituacao: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  situacaoTexto: { flex: 1, color: cores.texto, fontWeight: '700' },
  semDados: { color: cores.textoFraco },

  linhaHero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    columnGap: espaco.lg, rowGap: 2 },
  heroValor: { fontWeight: '700', color: cores.texto, fontVariant: ['tabular-nums'] },
  secundarios: { flexShrink: 1, gap: 2 },
  secundario: { color: cores.textoFraco },
  secundarioForte: { color: cores.texto, fontWeight: '700', fontVariant: ['tabular-nums'] },

  sync: { color: cores.neutro },
  syncForte: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  syncCompleto: { color: cores.ok },

  rodape: { paddingHorizontal: espaco.lg, paddingTop: espaco.md,
    borderTopWidth: 1, borderTopColor: cores.linha, backgroundColor: cores.fundo },
  // Fundo quase preto com texto branco: 19:1, como o Coletar da 005.
  botaoColetar: { minHeight: alvo.minimo + 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, backgroundColor: cores.texto },
  botaoColetarTexto: { color: cores.superficie, fontWeight: '700' },
});
