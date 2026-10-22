/**
 * Coletar pelo cabo (feature 005) — app de campo no navegador do computador.
 *
 * Passo a passo: ligue o cabo, aperte o botão da placa, toque em Coletar (em
 * até 30 s). "De qual colmeia é esta placa?" enquanto a placa não manda o
 * MAC; progresso em bytes e leituras; e o resultado com os MESMOS avisos de
 * toda coleta (`ResultadoDaColeta`). Onde não há porta serial, a tela explica
 * o caminho e não mostra botão de coletar que não faria nada (FR-032).
 *
 * Esta tela só desenha e encadeia. Quem toca a porta é `@/transports/cable`
 * (permitido a telas de conexão, Princípio IV); quem conversa com a placa e
 * grava ANTES de confirmar é `coletarPeloCabo`, que nunca lança; quem decide
 * o texto é `core/cabo` e `core/coleta/mensagens`. Todo texto vem do i18n.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useDb } from '@/data/provider';
import { coletarPeloCabo } from '@/data/coletaCabo';
import { CHAVE_ULTIMA_COLMEIA_DO_CABO, lerConfig, listarColmeias } from '@/data/repo';
import {
  abrirCanal, escolherPortaDeColeta, portaJaAutorizada, serialDeColeta, verificarCabo, vigiarPortas,
  type PortaDeColeta,
} from '@/transports/cable';
import {
  falhasDaPlacaDemo, placaDeDemonstracao, relogioDoCelular, TRANSPORTE_ATIVO,
} from '@/transports';
import { t, tp } from '@/core/i18n';
import { TransportError } from '@/core/ports/transport';
import type { CanalSerial } from '@/core/ports/canal';
import type { ProgressoDaSessao } from '@/core/cabo/sessao';
import {
  problemaDaPortaPorErro, textoDoProblemaDaPorta, textoSemCaboParaColeta, type ProblemaDaPorta,
} from '@/core/cabo/mensagens';
import {
  TEXTO_DA_FASE, fracaoDoProgresso, leiturasPelosBytes, pedeConfigurarPlacaNova, segundosAteDormir,
} from '@/core/cabo/passos';
import { resumir } from '@/core/coleta/mensagens';
import type { ResultadoColeta } from '@/core/coleta/resultado';
import { CHAVE_DEMO_FALHA, ehFalhaDemo, type FalhaDemo } from '@/core/preferencias';
import { fmtNumero } from '@/core/format';
import { IconeAlerta, IconeCheck } from '@/ui/Icones';
import { IconeRelogio, IconeTomada, IconeTomadaSolta } from '@/ui/IconesCabo';
import { ResultadoDaColeta } from '@/ui/ResultadoDaColeta';
import { darRetornoDeColeta } from '@/ui/retorno';
import { bipar, prepararBipe } from '@/ui/bipe';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';

const CANAIS_DE_RETORNO = {
  plataforma: Platform.OS,
  vibrar: (padrao: number[]) => Vibration.vibrate(padrao),
  anunciar: (texto: string) => AccessibilityInfo.announceForAccessibility(texto),
};

/** Texto, vibração (onde houver) e bipe: no computador não há vibração (FR-031). */
function darRetorno(resultado: ResultadoColeta) {
  const resumo = resumir(resultado);
  darRetornoDeColeta(resumo, CANAIS_DE_RETORNO);
  bipar(resumo.desfecho === 'sucesso' ? 1 : 2);
}

async function manterTelaLigada(ligar: boolean) {
  try {
    if (ligar) await activateKeepAwakeAsync('coleta-cabo');
    else await deactivateKeepAwake('coleta-cabo');
  } catch { /* conveniência, nunca pré-requisito */ }
}

function falhaDemoEscolhida(db: Parameters<typeof lerConfig>[0]): FalhaDemo {
  if (TRANSPORTE_ATIVO !== 'mock') return 'nenhuma';
  try {
    const f = lerConfig(db, CHAVE_DEMO_FALHA, 'nenhuma');
    return ehFalhaDemo(f) ? f : 'nenhuma';
  } catch {
    return 'nenhuma';
  }
}

interface Colmeia { id: string; nome: string }

type Estado =
  | { fase: 'pronto' }
  | { fase: 'escolhendo' }
  | { fase: 'coletando'; progresso: ProgressoDaSessao }
  | { fase: 'porta'; problema: ProblemaDaPorta }
  | { fase: 'resultado'; resultado: ResultadoColeta; simulada: boolean };

export default function ColetaPeloCabo() {
  const { db } = useDb();
  const router = useRouter();
  // O ambiente não muda com a tela aberta.
  const disponibilidade = useMemo(() => verificarCabo(), []);
  const temDemo = TRANSPORTE_ATIVO === 'mock';

  const [colmeias, setColmeias] = useState<Colmeia[]>([]);
  const [hiveId, setHiveId] = useState<string | null>(null);
  const [simulada, setSimulada] = useState(!disponibilidade.ok);
  const [estado, setEstado] = useState<Estado>({ fase: 'pronto' });
  const [acordouMs, setAcordouMs] = useState<number | null>(null);
  const [placaLigada, setPlacaLigada] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  const porta = useRef<PortaDeColeta | null>(null);
  const emAndamento = useRef(false);
  const montada = useRef(true);
  // A placa simulada termina o ciclo dela (medir, dormir) depois da conversa.
  const cicloDaSimulada = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    montada.current = true;
    return () => { montada.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    try {
      // Uma linha por colmeia (a consulta traz uma por nó).
      const vistas = new Map<string, string>();
      for (const c of listarColmeias(db)) if (!vistas.has(c.hive_id)) vistas.set(c.hive_id, c.nome);
      const lista = [...vistas].map(([id, nome]) => ({ id, nome }));
      setColmeias(lista);
      const ultima = lerConfig(db, CHAVE_ULTIMA_COLMEIA_DO_CABO, '');
      setHiveId((atual) => {
        if (atual && vistas.has(atual)) return atual;
        return vistas.has(ultima) ? ultima : lista[0]?.id ?? null;
      });
    } catch {
      setColmeias([]);
    }
  }, [db]));

  // A placa que acorda faz a porta aparecer; a que dorme, sumir (D-512).
  useEffect(() => {
    if (!disponibilidade.ok) return;
    const serial = serialDeColeta();
    void portaJaAutorizada(serial).then((p) => {
      if (!montada.current || !p) return;
      porta.current = p;
      setPlacaLigada(true);
    });
    return vigiarPortas(serial,
      (p) => { porta.current = p; setPlacaLigada(true); setAcordouMs(Date.now()); },
      (p) => {
        if (porta.current === p) porta.current = null;
        setPlacaLigada(false);
        setAcordouMs(null);
      });
  }, [disponibilidade.ok]);

  // A contagem dos 30 s só anda quando há o que contar.
  useEffect(() => {
    if (acordouMs === null || estado.fase !== 'pronto') return;
    const id = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(id);
  }, [acordouMs, estado.fase]);

  const coletarCom = useCallback(async (
    abrir: () => Promise<CanalSerial>, ehSimulada: boolean, falha: FalhaDemo, escolhida: string,
  ) => {
    let canal: CanalSerial;
    try {
      canal = await abrir();
    } catch (e) {
      if (montada.current) {
        setEstado({ fase: 'porta', problema: problemaDaPortaPorErro(e instanceof TransportError ? e.code : null, 'abrir') });
        bipar(2);
      }
      return;
    }
    if (montada.current) setEstado({ fase: 'coletando', progresso: { fase: 'conversando' } });
    await manterTelaLigada(true);
    const resultado = await coletarPeloCabo(db, canal, {
      hiveId: escolhida,
      src: ehSimulada ? 'mock' : 'cable',
      // A data adiantada da demonstração vale para o celular, não para a placa de verdade.
      agora: ehSimulada ? relogioDoCelular(falha) : Date.now,
      aoProgredir: (p) => { if (montada.current) setEstado({ fase: 'coletando', progresso: p }); },
    });
    await manterTelaLigada(false);
    setAcordouMs(null);
    if (!montada.current) return;
    setEstado({ fase: 'resultado', resultado, simulada: ehSimulada });
    darRetorno(resultado);
  }, [db]);

  function coletar() {
    if (emAndamento.current || !hiveId) return;
    emAndamento.current = true;
    prepararBipe();
    const escolhida = hiveId;
    const falha = falhaDemoEscolhida(db);
    const fim = () => { emAndamento.current = false; };

    if (simulada) {
      setEstado({ fase: 'coletando', progresso: { fase: 'conversando' } });
      const placa = placaDeDemonstracao();
      placa.falhas = falhasDaPlacaDemo(falha);
      void coletarCom(async () => {
        // Um ciclo da placa por vez: o anterior ainda pode estar medindo.
        await cicloDaSimulada.current;
        const { canal, terminou } = placa.acordar('botao');
        cicloDaSimulada.current = terminou.catch(() => {});
        return canal;
      }, true, falha, escolhida).finally(fim);
      return;
    }

    const conhecida = porta.current;
    // Sem placa autorizada à vista, a lista do navegador TEM de abrir direto do toque.
    const pedido = conhecida ? Promise.resolve(conhecida) : escolherPortaDeColeta(serialDeColeta());
    setEstado(conhecida ? { fase: 'coletando', progresso: { fase: 'conversando' } } : { fase: 'escolhendo' });
    void (async () => {
      let p: PortaDeColeta;
      try {
        p = await pedido;
      } catch (e) {
        if (montada.current) {
          setEstado({ fase: 'porta', problema: problemaDaPortaPorErro(e instanceof TransportError ? e.code : null, 'escolher') });
          bipar(2);
        }
        return;
      }
      porta.current = p;
      await coletarCom(() => abrirCanal(p), false, falha, escolhida);
    })().finally(fim);
  }

  function voltar() {
    setEstado({ fase: 'pronto' });
  }

  if (estado.fase === 'resultado') {
    const desfecho = estado.resultado.nos[0]?.cabo?.desfecho;
    const placaNova = desfecho !== undefined && pedeConfigurarPlacaNova(desfecho);
    return (
      <ResultadoDaColeta
        resultado={estado.resultado}
        aoTentarDeNovo={voltar}
        aoVerColmeias={() => router.replace('/')}
        topo={(estado.simulada || placaNova) ? (
          <>
            {estado.simulada && <RotuloSimulada />}
            {/* FR-025: a placa sem arquivo precisa da hora inicial, não de outra coleta. */}
            {placaNova && (
              <View style={s.topoAcao}>
                <Pressable style={s.botaoSecundario} accessibilityRole="button"
                  onPress={() => router.replace('/placa-nova')}>
                  <Text style={s.botaoSecundarioTexto}>{t('placaNova.link')}</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : undefined}
      />
    );
  }

  const podeColetarDeVerdade = disponibilidade.ok;
  const usandoSimulada = simulada || !podeColetarDeVerdade;
  const semColmeia = colmeias.length === 0;
  const restam = usandoSimulada ? null : segundosAteDormir(acordouMs, agora);
  const ocupado = estado.fase === 'escolhendo' || estado.fase === 'coletando';
  // Sem cabo e sem demonstração não há o que coletar: nenhum botão (FR-032).
  const mostraColetar = (podeColetarDeVerdade || temDemo) && !semColmeia;

  return (
    <View style={s.tela}>
      {usandoSimulada && temDemo && <RotuloSimulada />}
      <ScrollView contentContainerStyle={s.conteudo}>
        {!podeColetarDeVerdade && <SemCabo motivo={disponibilidade.motivo} comDemo={temDemo} />}

        {estado.fase === 'coletando' ? (
          <Progresso progresso={estado.progresso} />
        ) : !(podeColetarDeVerdade || temDemo) ? null : (
          <>
            <Text style={s.corpo}>{t('caboColeta.intro')}</Text>

            {podeColetarDeVerdade && temDemo && (
              <View style={s.opcoesLinha} accessibilityRole="radiogroup">
                <Opcao rotulo={t('caboColeta.botao.real')} marcada={!simulada}
                  aoTocar={() => setSimulada(false)} desligada={ocupado} />
                <Opcao rotulo={t('caboColeta.botao.simulada')} marcada={simulada}
                  aoTocar={() => setSimulada(true)} desligada={ocupado} />
              </View>
            )}

            <Text style={s.titulo} accessibilityRole="header">{t('caboColeta.colmeia.titulo')}</Text>
            {semColmeia ? (
              <>
                <Text style={s.corpo}>{t('caboColeta.colmeia.nenhuma')}</Text>
                <Pressable style={s.botaoSecundario} accessibilityRole="button"
                  onPress={() => router.replace('/')}>
                  <Text style={s.botaoSecundarioTexto}>{t('coleta.botao.ver_colmeias')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={s.ajuda}>{t('caboColeta.colmeia.ajuda')}</Text>
                <View style={s.lista} accessibilityRole="radiogroup">
                  {colmeias.map((c) => (
                    <Opcao key={c.id} rotulo={c.nome} marcada={c.id === hiveId} linha
                      aoTocar={() => setHiveId(c.id)} desligada={ocupado} />
                  ))}
                </View>
              </>
            )}

            {(podeColetarDeVerdade || temDemo) && (
              <Passos simulada={usandoSimulada} placaLigada={placaLigada} restam={restam} />
            )}

            {estado.fase === 'escolhendo' && (
              <Text style={s.corpo}>{t('caboColeta.estado.escolhendo')}</Text>
            )}
            {estado.fase === 'porta' && <ProblemaDaPortaCartao problema={estado.problema} />}
          </>
        )}
      </ScrollView>

      {/* Ação primária no terço inferior, ao alcance do polegar (Princípio V). */}
      {mostraColetar && (
        <View style={s.rodape}>
          {estado.fase === 'coletando' && (
            <Text style={s.ajuda}>{t('caboColeta.manter_ligado')}</Text>
          )}
          <Pressable style={[s.botao, ocupado && s.botaoOcupado]} accessibilityRole="button"
            accessibilityState={{ disabled: ocupado, busy: ocupado }}
            disabled={ocupado} onPress={coletar}>
            <Text style={s.botaoTexto}>
              {t(estado.fase === 'porta' ? 'coleta.botao.tentar_de_novo' : 'coleta.botao.coletar')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Sempre visível na placa simulada (FR-033): cor + ícone + palavra. */
function RotuloSimulada() {
  return (
    <View style={s.rotuloSimulada} accessibilityRole="text">
      <IconeAlerta cor={cores.atencao} tamanho={22} />
      <Text style={s.rotuloSimuladaTexto}>{t('caboColeta.simulada.rotulo')}</Text>
    </View>
  );
}

function SemCabo({ motivo, comDemo }: { motivo: Parameters<typeof textoSemCaboParaColeta>[0]; comDemo: boolean }) {
  const texto = textoSemCaboParaColeta(motivo);
  return (
    <View style={[s.cartao, s.cartaoAtencao]}>
      <View style={s.linhaIcone}>
        <IconeTomadaSolta cor={cores.texto} />
        <Text style={s.cartaoTitulo}>{texto.titulo}</Text>
      </View>
      <Text style={s.corpo}>{texto.detalhe}</Text>
      {comDemo && <Text style={s.corpo}>{t('caboColeta.demo_disponivel')}</Text>}
    </View>
  );
}

function Passos({ simulada, placaLigada, restam }: {
  simulada: boolean; placaLigada: boolean; restam: number | null;
}) {
  const passos = [
    { n: 1, texto: t('caboColeta.passo.cabo'), feito: placaLigada },
    { n: 2, texto: t(simulada ? 'caboColeta.simulada.botao_junto' : 'caboColeta.passo.botao'), feito: restam !== null && restam > 0 },
    { n: 3, texto: t('caboColeta.passo.coletar'), feito: false },
  ];
  return (
    <View style={s.passos}>
      {passos.map((p) => (
        <View key={p.n} style={s.passo}
          accessible accessibilityLabel={t('caboColeta.passo.rotulo_acessivel', { n: p.n, texto: p.texto })}>
          <View style={[s.passoNumero, p.feito && s.passoNumeroFeito]}>
            {p.feito
              ? <IconeCheck cor={cores.superficie} tamanho={20} />
              : <Text style={s.passoNumeroTexto}>{fmtNumero(p.n)}</Text>}
          </View>
          <View style={s.passoCorpo}>
            <Text style={s.passoRotulo}>{t('caboColeta.passo.rotulo', { n: p.n })}</Text>
            <Text style={s.corpo}>{p.texto}</Text>
          </View>
        </View>
      ))}
      {restam !== null && (
        <View style={s.contagem} accessibilityLiveRegion="polite">
          <IconeRelogio cor={restam > 0 ? cores.texto : cores.atencao} />
          <View style={s.passoCorpo}>
            {restam > 0 ? (
              <>
                <Text style={s.contagemNumero}>{fmtNumero(restam)}</Text>
                <Text style={s.corpo}>{tp('caboColeta.contagem.restam', restam)}</Text>
                <Text style={s.corpo}>{t('caboColeta.placa_acordou')}</Text>
              </>
            ) : (
              <Text style={s.corpo}>{t('caboColeta.contagem.acabou')}</Text>
            )}
          </View>
        </View>
      )}
      {restam === null && placaLigada && !simulada && (
        <View style={s.linhaIcone}>
          <IconeTomada cor={cores.ok} />
          <Text style={s.corpo}>{t('caboColeta.placa_ligada')}</Text>
        </View>
      )}
    </View>
  );
}

function Progresso({ progresso }: { progresso: ProgressoDaSessao }) {
  const fracao = fracaoDoProgresso(progresso);
  return (
    <View style={s.progresso} accessibilityLiveRegion="polite">
      <Text style={s.titulo} accessibilityRole="header">{t(TEXTO_DA_FASE[progresso.fase])}</Text>
      {progresso.fase === 'recebendo' && (
        <>
          <Text style={s.contagemNumero}>
            {tp('caboColeta.progresso.leituras', leiturasPelosBytes(progresso.recebidos))}
          </Text>
          <Text style={s.corpo}>
            {t('caboColeta.progresso.bytes', {
              recebidos: fmtNumero(progresso.recebidos), total: fmtNumero(progresso.total),
            })}
          </Text>
        </>
      )}
      {fracao !== null && (
        <View style={s.barraFundo} accessibilityRole="progressbar"
          accessibilityLabel={t('caboColeta.progresso.rotulo')}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(fracao * 100) }}>
          <View style={[s.barraPreenchida, { width: `${Math.round(fracao * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

function ProblemaDaPortaCartao({ problema }: { problema: ProblemaDaPorta }) {
  const texto = textoDoProblemaDaPorta(problema);
  return (
    <View style={[s.cartao, s.cartaoProblema]} accessible accessibilityRole="alert">
      <View style={s.linhaIcone}>
        <IconeAlerta cor={cores.perigo} tamanho={24} />
        <Text style={s.cartaoTitulo}>{texto.titulo}</Text>
      </View>
      <Text style={s.corpo}>{texto.detalhe}</Text>
    </View>
  );
}

/** Opção de escolha única: borda grossa + marca + palavra; nunca só a cor. */
function Opcao({ rotulo, marcada, aoTocar, desligada, linha }: {
  rotulo: string; marcada: boolean; aoTocar: () => void; desligada?: boolean; linha?: boolean;
}) {
  return (
    <Pressable onPress={aoTocar} disabled={desligada}
      accessibilityRole="radio" accessibilityState={{ checked: marcada, disabled: desligada }}
      style={[s.opcao, linha && s.opcaoLinha, marcada && s.opcaoMarcada]}>
      <View style={[s.marca, marcada && s.marcaCheia]}>
        {marcada && <IconeCheck cor={cores.superficie} tamanho={18} />}
      </View>
      <Text style={[s.opcaoTexto, marcada && s.opcaoTextoMarcada]}>{rotulo}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.xl, gap: espaco.md },
  corpo: { fontSize: tipo.corpo, color: cores.texto, lineHeight: 24 },
  ajuda: { fontSize: tipo.corpo, color: cores.textoFraco, lineHeight: 24 },
  titulo: { fontSize: tipo.titulo, fontWeight: '700', color: cores.texto, marginTop: espaco.sm },

  rotuloSimulada: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    paddingHorizontal: espaco.xl, paddingVertical: espaco.md, backgroundColor: cores.superficie,
    borderBottomWidth: 2, borderBottomColor: cores.atencao },
  rotuloSimuladaTexto: { flex: 1, fontSize: tipo.corpo, color: cores.texto, fontWeight: '600' },

  cartao: { backgroundColor: cores.superficie, borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.bordaControle, padding: espaco.lg, gap: espaco.sm },
  cartaoAtencao: { borderLeftWidth: 6, borderLeftColor: cores.atencao },
  cartaoProblema: { borderLeftWidth: 6, borderLeftColor: cores.perigo },
  cartaoTitulo: { flex: 1, fontSize: tipo.corpo + 2, fontWeight: '700', color: cores.texto },
  linhaIcone: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },

  lista: { gap: alvo.espacamento },
  opcoesLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: alvo.espacamento },
  opcao: { minHeight: alvo.minimo, flexGrow: 1, flexDirection: 'row', alignItems: 'center',
    gap: espaco.md, paddingHorizontal: espaco.lg, borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.bordaControle, backgroundColor: cores.superficie },
  opcaoLinha: { minHeight: alvo.linha },
  opcaoMarcada: { borderWidth: 3, borderColor: cores.texto },
  opcaoTexto: { flexShrink: 1, fontSize: tipo.corpo + 1, color: cores.texto },
  opcaoTextoMarcada: { fontWeight: '700' },
  marca: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: cores.bordaControle,
    alignItems: 'center', justifyContent: 'center' },
  marcaCheia: { backgroundColor: cores.texto, borderColor: cores.texto },

  passos: { gap: espaco.md, marginTop: espaco.sm },
  passo: { flexDirection: 'row', gap: espaco.md, alignItems: 'flex-start' },
  passoNumero: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: cores.texto,
    alignItems: 'center', justifyContent: 'center', backgroundColor: cores.superficie },
  passoNumeroFeito: { backgroundColor: cores.ok, borderColor: cores.ok },
  passoNumeroTexto: { fontSize: tipo.corpo + 2, fontWeight: '700', color: cores.texto },
  passoCorpo: { flex: 1, gap: 2 },
  passoRotulo: { fontSize: tipo.rotulo, fontWeight: '700', color: cores.textoFraco },

  contagem: { flexDirection: 'row', gap: espaco.md, alignItems: 'center', padding: espaco.lg,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.bordaControle,
    backgroundColor: cores.superficie },
  contagemNumero: { fontSize: tipo.leitura, fontWeight: '700', color: cores.texto,
    fontVariant: ['tabular-nums'] },

  progresso: { gap: espaco.md, paddingVertical: espaco.xl },
  barraFundo: { height: 16, borderRadius: raio.sm, backgroundColor: cores.linha, overflow: 'hidden' },
  barraPreenchida: { height: '100%', backgroundColor: cores.texto },

  topoAcao: { paddingHorizontal: espaco.xl, paddingTop: espaco.md },
  rodape: { paddingHorizontal: espaco.xl, paddingVertical: espaco.lg, gap: alvo.espacamento,
    borderTopWidth: 1, borderTopColor: cores.linha, backgroundColor: cores.fundo },
  // Fundo quase preto com texto branco: 19:1. Branco sobre o âmbar dá só 5,9:1.
  botao: { minHeight: alvo.minimo + 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, backgroundColor: cores.texto },
  botaoOcupado: { opacity: 0.6 },
  botaoTexto: { fontSize: tipo.corpo + 2, color: cores.superficie, fontWeight: '700' },
  botaoSecundario: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.bordaControle,
    backgroundColor: cores.superficie },
  botaoSecundarioTexto: { fontSize: tipo.corpo, color: cores.texto, fontWeight: '700' },
});
