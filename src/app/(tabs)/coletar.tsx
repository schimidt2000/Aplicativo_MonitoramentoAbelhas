/**
 * Coletar — a interação principal. Ocioso -> transferindo -> resultado.
 *
 * Esta tela só DESENHA. Quem coleta é `executarColeta`, que nunca lança; quem
 * decide o que dizer é `montarAvisos`/`resumir`. Antes, a lógica vivia aqui
 * dentro, e um erro em qualquer ponto deixava a tela presa em "Procurando…".
 *
 * Todo texto vem do módulo de i18n.
 */
import { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text,
  Vibration, View,
} from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useDb } from '@/data/provider';
import { lerConfig } from '@/data/repo';
import { perdaDeEnergiaDaDemo } from '@/data/semente';
import { executarColeta, responderPergunta } from '@/data/coleta';
import { obterTransporte, relogioDoCelular, TRANSPORTE_ATIVO } from '@/transports';
import { t } from '@/core/i18n';
import { resumir, textoDepoisDaResposta, type PerguntaDeHora } from '@/core/coleta/mensagens';
import type { ResultadoColeta } from '@/core/coleta/resultado';
import { CHAVE_DEMO_FALHA, ehFalhaDemo, type FalhaDemo } from '@/core/preferencias';
import { fmtNumero } from '@/core/format';
import { IconeAlerta } from '@/ui/Icones';
import { ROTULO_DEMO } from '@/ui/demo';
import { ResultadoDaColeta } from '@/ui/ResultadoDaColeta';
import { darRetornoDeColeta } from '@/ui/retorno';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';

/**
 * Vibração e leitor de tela vêm de react-native (no navegador, o
 * react-native-web: vibra se houver `navigator.vibrate`, e o anúncio não faz
 * nada). `darRetornoDeColeta` já protege cada canal com try/catch.
 */
const CANAIS_DE_RETORNO = {
  plataforma: Platform.OS,
  vibrar: (padrao: number[]) => Vibration.vibrate(padrao),
  anunciar: (texto: string) => AccessibilityInfo.announceForAccessibility(texto),
};

function terminar(resultado: ResultadoColeta) {
  darRetornoDeColeta(resumir(resultado), CANAIS_DE_RETORNO);
}

/**
 * Manter a tela ligada é conveniência, nunca pré-requisito: se a API falhar
 * (aba em segundo plano, navegador sem suporte), a coleta segue. Perder uma
 * transferência por causa disso seria perder uma viagem a campo.
 */
async function manterTelaLigada(ligar: boolean) {
  try {
    if (ligar) await activateKeepAwakeAsync('coleta');
    else await deactivateKeepAwake('coleta');
  } catch {
    /* segue sem manter a tela ligada */
  }
}

/** A falha simulada é conveniência de demonstração: se não der para ler, coleta normal. */
function falhaDemoEscolhida(db: Parameters<typeof lerConfig>[0]): FalhaDemo {
  if (TRANSPORTE_ATIVO !== 'mock') return 'nenhuma';
  try {
    const escolhida = lerConfig(db, CHAVE_DEMO_FALHA, 'nenhuma');
    return ehFalhaDemo(escolhida) ? escolhida : 'nenhuma';
  } catch {
    return 'nenhuma';
  }
}

type Estado =
  | { fase: 'ocioso' }
  | { fase: 'procurando' }
  | { fase: 'transferindo'; nome: string; recebidas: number; total: number }
  | { fase: 'resultado'; resultado: ResultadoColeta };

export default function Coletar() {
  const { db } = useDb();
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: 'ocioso' });
  // Lida a cada vez que a aba ganha foco: a escolha é feita em Ajustes.
  const [demo, setDemo] = useState<FalhaDemo>('nenhuma');

  useFocusEffect(
    useCallback(() => { setDemo(falhaDemoEscolhida(db)); }, [db]),
  );
  // Evita duas coletas ao mesmo tempo (toque duplo antes de a tela mudar).
  const emAndamento = useRef(false);
  // A demonstração da última coleta: a resposta à pergunta de hora usa a mesma.
  const demoDaColeta = useRef<FalhaDemo>('nenhuma');

  const coletar = useCallback(async () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setEstado({ fase: 'procurando' });
    await manterTelaLigada(true);

    try {
      demoDaColeta.current = falhaDemoEscolhida(db);
      const transporte = obterTransporte(
        demoDaColeta.current,
        { perdaDeEnergiaMs: perdaDeEnergiaDaDemo(db, demoDaColeta.current) },
      );
      const resultado = await executarColeta(db, transporte, {
        aoProgredir: (p) => setEstado({ fase: 'transferindo', ...p }),
        agora: relogioDoCelular(demoDaColeta.current),
      });
      setEstado({ fase: 'resultado', resultado });
      terminar(resultado);
    } catch {
      // `executarColeta` nunca lança, mas montar o transporte fica fora dela.
      // Rede de segurança: nenhuma saída deixa a tela presa em "Procurando…".
      const resultado: ResultadoColeta = { nos: [], desconhecidos: [], geral: 'inesperado' };
      setEstado({ fase: 'resultado', resultado });
      terminar(resultado);
    } finally {
      emAndamento.current = false;
      await manterTelaLigada(false);
    }
  }, [db]);

  // Feature 003 (FR-011): a mesma resposta para todas as colmeias da pergunta.
  const responderHora = useCallback(async (pergunta: PerguntaDeHora, resposta: 'sim' | 'nao') => {
    const falha = demoDaColeta.current;
    const r = await responderPergunta(
      db, () => obterTransporte(falha, { perdaDeEnergiaMs: perdaDeEnergiaDaDemo(db, falha) }),
      pergunta.alvos, resposta,
      { agora: relogioDoCelular(falha) },
    );
    return { texto: textoDepoisDaResposta(resposta, r), deuCerto: r.gravou };
  }, [db]);

  // O resultado tem rodapé fixo com os botões; os demais estados rolam inteiros.
  if (estado.fase === 'resultado') {
    return (
      <ResultadoDaColeta
        resultado={estado.resultado}
        aoResponderHora={responderHora}
        agora={relogioDoCelular(demoDaColeta.current)}
        aoTentarDeNovo={coletar}
        aoVerColmeias={() => router.replace('/')}
        aoAbrirDiagnostico={() => router.push('/diagnostico')}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={s.tela}>
      {estado.fase === 'ocioso' && (
        <>
          <Text style={s.titulo}>{t('coleta.ocioso.titulo')}</Text>
          <Text style={s.aviso}>{t('coleta.manter_tela')}</Text>
          {/* A simulação vale para TODAS as coletas até ser desligada: a tela diz isso. */}
          {demo !== 'nenhuma' && (
            <View style={s.linhaDemo}>
              <IconeAlerta cor={cores.atencao} tamanho={22} />
              <Text style={s.linhaDemoTexto}>
                {t('coleta.demo.ativa', { rotulo: t(ROTULO_DEMO[demo]) })}
              </Text>
            </View>
          )}
          <Pressable style={s.botao} onPress={coletar} accessibilityRole="button">
            <Text style={s.botaoTexto}>{t('coleta.botao.coletar')}</Text>
          </Pressable>
          {/* Feature 005: a placa ligada no cabo de um computador. Onde não há
              cabo, a própria tela explica o caminho (FR-032). */}
          <Text style={s.ajudaCabo}>{t('coleta.cabo.ajuda')}</Text>
          <Link href="/coleta-cabo" asChild>
            <Pressable style={s.botaoCabo} accessibilityRole="button">
              <Text style={s.botaoCaboTexto}>{t('coleta.cabo.link')}</Text>
            </Pressable>
          </Link>
        </>
      )}

      {estado.fase === 'procurando' && (
        <View style={s.centro}>
          <ActivityIndicator color={cores.acento} size="large"
            accessibilityLabel={t('coleta.procurando')} />
          <Text style={s.titulo}>{t('coleta.procurando')}</Text>
        </View>
      )}

      {estado.fase === 'transferindo' && (
        <View>
          <Text style={s.titulo}>{t('coleta.transferindo.titulo', { nome: estado.nome })}</Text>
          <View style={s.barraFundo}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('coleta.progresso.rotulo')}
            accessibilityValue={{
              min: 0, max: estado.total, now: estado.recebidas,
              text: t('coleta.transferindo.progresso', {
                recebidas: fmtNumero(estado.recebidas), total: fmtNumero(estado.total),
              }),
            }}
          >
            <View style={[s.barraPreenchida, {
              width: `${estado.total ? Math.round((estado.recebidas / estado.total) * 100) : 0}%`,
            }]} />
          </View>
          <Text style={s.progresso}>
            {t('coleta.transferindo.progresso', {
              recebidas: fmtNumero(estado.recebidas), total: fmtNumero(estado.total),
            })}
          </Text>
          <Text style={s.aviso}>{t('coleta.manter_tela')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flexGrow: 1, padding: espaco.xl, justifyContent: 'center', gap: espaco.md },
  centro: { alignItems: 'center', gap: espaco.lg },
  titulo: { fontSize: tipo.titulo, fontWeight: '700', color: cores.texto,
    textAlign: 'center' },
  aviso: { fontSize: tipo.corpo, color: cores.atencao, textAlign: 'center',
    fontWeight: '600' },
  linhaDemo: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    padding: espaco.md, borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.atencao, backgroundColor: cores.superficie },
  // Cor primária no texto: o ícone âmbar é o canal de cor, a frase é a palavra.
  linhaDemoTexto: { flex: 1, fontSize: tipo.corpo, color: cores.texto, fontWeight: '600' },
  progresso: { fontSize: tipo.leitura, fontWeight: '700', color: cores.texto,
    textAlign: 'center', fontVariant: ['tabular-nums'] },
  barraFundo: { height: 16, borderRadius: raio.sm, backgroundColor: cores.linha,
    overflow: 'hidden', marginVertical: espaco.lg },
  barraPreenchida: { height: '100%', backgroundColor: cores.acento },

  botao: { minHeight: alvo.minimo + 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, backgroundColor: cores.acento, marginTop: espaco.lg },
  botaoTexto: { fontSize: tipo.corpo + 2, color: '#FFFFFF', fontWeight: '700' },
  ajudaCabo: { fontSize: tipo.corpo, color: cores.textoFraco, textAlign: 'center',
    marginTop: espaco.lg },
  // A borda é o único limite do botão secundário: token de controle (>= 3:1).
  botaoCabo: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.bordaControle,
    backgroundColor: cores.superficie, paddingHorizontal: espaco.md },
  botaoCaboTexto: { fontSize: tipo.corpo, color: cores.texto, fontWeight: '700' },
});
