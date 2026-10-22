/**
 * Ler a placa pelo cabo (feature 004) — monitor de bancada.
 *
 * Mostra ao vivo o que a placa manda pela porta USB, no Chrome ou no Edge de
 * um computador. NÃO GRAVA NADA: as linhas de bancada não têm identificador
 * da placa nem número de leitura, que são a chave `(node_id, seq)`
 * (Princípio III). Um teste reprova se esta tela importar `src/data`.
 *
 * Esta tela só desenha. Quem lê a porta é `@/transports/cable`; quem entende
 * a linha é o leitor versionado `bancada-0`; quem guarda o que foi visto é
 * `SessaoDoMonitor`; quem decide o texto é `core/bancada`. Todo texto vem do
 * módulo de i18n.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, tp } from '@/core/i18n';
import { TransportError } from '@/core/ports/transport';
import { SessaoDoMonitor } from '@/core/bancada/sessao';
import { serieAoVivo, type Grandeza } from '@/core/bancada/serie';
import {
  fmtHoraBancada, leituraNaTela, mensagemNaTela, type NivelDoGas,
} from '@/core/bancada/apresentacao';
import {
  problemaDoCabo, textoDoProblema, textoSemCabo,
  type FaseDoCabo, type MotivoSemCabo, type ProblemaDoCabo,
} from '@/core/bancada/mensagens';
import { montarPlanilha } from '@/core/bancada/csv';
import {
  abrirLeitura, escolherPorta, serialDoNavegador, verificarCabo,
  type LeituraAberta, type PortaSerial,
} from '@/transports/cable';
import { GraficoAoVivo } from '@/ui/GraficoAoVivo';
import { IconeAlerta, IconeCheck } from '@/ui/Icones';
import { IconeBaixar, IconeRelogio, IconeTomada, IconeTomadaSolta } from '@/ui/IconesCabo';
import { baixarTexto } from '@/ui/baixarArquivo';
import { bipar, prepararBipe } from '@/ui/bipe';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';

export default function TelaCabo() {
  // O ambiente não muda com a tela aberta: verifica uma vez.
  const disponibilidade = useMemo(() => verificarCabo(), []);
  return (
    <View style={s.tela}>
      <AvisoNadaGravado />
      {disponibilidade.ok ? <Monitor /> : <SemCabo motivo={disponibilidade.motivo} />}
    </View>
  );
}

/** FR-014: fixo no topo, fora da rolagem, em qualquer estado. */
function AvisoNadaGravado() {
  return (
    <View style={s.avisoFixo}>
      <IconeAlerta cor={cores.texto} tamanho={22} />
      <Text style={s.avisoFixoTexto}>{t('cabo.aviso_nada_gravado')}</Text>
    </View>
  );
}

/** FR-016: onde não dá, explica o motivo e a alternativa. Nenhum botão inerte. */
function SemCabo({ motivo }: { motivo: MotivoSemCabo }) {
  const router = useRouter();
  const texto = textoSemCabo(motivo);
  return (
    <ScrollView contentContainerStyle={s.conteudo}>
      <View style={[s.cartao, s.cartaoAtencao]}>
        <View style={s.linhaIcone}>
          <IconeTomadaSolta cor={cores.texto} />
          <Text style={s.cartaoTitulo}>{texto.titulo}</Text>
        </View>
        <Text style={s.corpo}>{texto.detalhe}</Text>
      </View>
      {texto.oferecerColeta && (
        <Pressable style={s.botaoSecundario} accessibilityRole="button"
          onPress={() => router.replace('/coletar')}>
          <Text style={s.botaoSecundarioTexto}>{t('cabo.botao.ir_coletar')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

type Fase = 'desconectado' | 'escolhendo' | 'conectando' | 'conectado';

const GRANDEZAS: Grandeza[] = ['temperatura', 'umidade', 'volateis'];
const ROTULO: Record<Grandeza, Parameters<typeof t>[0]> = {
  temperatura: 'cabo.grandeza.temperatura',
  umidade: 'cabo.grandeza.umidade',
  volateis: 'cabo.grandeza.volateis',
};
/** Unidade bruta → mostrada, casas (Princípio VI) e menor janela vertical. */
const ESCALA: Record<Grandeza, { divisor: number; casas: number; spanMinimo: number }> = {
  temperatura: { divisor: 100, casas: 1, spanMinimo: 100 },  // 1 °C
  umidade: { divisor: 100, casas: 0, spanMinimo: 500 },      // 5 %
  volateis: { divisor: 1, casas: 0, spanMinimo: 50 },        // 50 ppb
};

const COR_DO_GAS: Record<NivelDoGas, string> = {
  pronto: cores.ok,
  aguardando: cores.atencao,
  invalido: cores.perigo,
};

function Monitor() {
  // Recuo da barra de navegação do sistema (Android 10+), para a barra de baixo não ficar atrás dela.
  const { bottom } = useSafeAreaInsets();
  const [sessao] = useState(() => new SessaoDoMonitor());
  const [, setVersao] = useState(0);
  const [fase, setFase] = useState<Fase>('desconectado');
  const [problema, setProblema] = useState<ProblemaDoCabo | null>(null);
  const [saiuPelaPessoa, setSaiuPelaPessoa] = useState(false);
  const [grandeza, setGrandeza] = useState<Grandeza>('temperatura');
  const [largura, setLargura] = useState(0);
  const [salvo, setSalvo] = useState<{ ok: boolean; arquivo: string } | null>(null);

  const leitura = useRef<LeituraAberta | null>(null);
  const montada = useRef(true);

  // Sair da tela solta a porta, para outro programa poder abri-la.
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
      void leitura.current?.fechar();
    };
  }, []);

  const falhou = useCallback((e: unknown, faseDoProblema: FaseDoCabo) => {
    if (!montada.current) return;
    setFase('desconectado');
    setProblema(e instanceof TransportError ? problemaDoCabo(e.code, faseDoProblema) : 'inesperado');
  }, []);

  function conectar() {
    setProblema(null);
    setSaiuPelaPessoa(false);
    prepararBipe();
    setFase('escolhendo');
    // Chamado direto do toque: o navegador só abre a lista de portas assim.
    const pedido = escolherPorta(serialDoNavegador());

    void (async () => {
      let porta: PortaSerial;
      try {
        porta = await pedido;
      } catch (e) {
        falhou(e, 'escolher');
        return;
      }
      if (!montada.current) return;
      setFase('conectando');

      let aberta: LeituraAberta;
      try {
        aberta = await abrirLeitura(porta, {
          aoReceberLinha: (l) => {
            sessao.receber(l, Date.now());
            if (montada.current) setVersao((v) => v + 1);
          },
        });
      } catch (e) {
        falhou(e, 'abrir');
        return;
      }
      if (!montada.current) {
        await aberta.fechar();
        return;
      }
      leitura.current = aberta;
      setFase('conectado');
      bipar(1);

      const fim = await aberta.fim;
      leitura.current = null;
      if (!montada.current) return;
      setFase('desconectado');
      if (fim.tipo === 'problema') {
        setProblema(problemaDoCabo(fim.erro.code, 'ler'));
        bipar(2);
      } else {
        setSaiuPelaPessoa(true);
      }
    })();
  }

  function desconectar() {
    void leitura.current?.fechar();
  }

  function salvar() {
    const planilha = montarPlanilha({
      formato: sessao.formato,
      leituras: sessao.leituras,
      inicioMs: sessao.inicioMs,
      ilegiveis: sessao.contagens.ilegiveis,
      descartadas: sessao.contagens.descartadas,
    }, Date.now());
    setSalvo({ ok: baixarTexto(planilha.nomeDoArquivo, planilha.conteudo), arquivo: planilha.nomeDoArquivo });
  }

  // A sessão é mutável; `versao` faz a tela redesenhar a cada linha.
  const ultima = sessao.ultimaLeitura();
  const naTela = ultima ? leituraNaTela(ultima.leitura) : null;
  const fimDoGrafico = sessao.ultimaChegadaMs ?? 0;
  const nLeituras = sessao.leituras.length;
  const serie = useMemo(
    () => serieAoVivo(sessao.leituras, grandeza, { fimMs: fimDoGrafico }),
    // nLeituras e fimDoGrafico mudam a cada leitura que chega.
    [sessao, grandeza, fimDoGrafico, nLeituras],
  );
  const mensagens = sessao.mensagensRecentes();
  const c = sessao.contagens;

  return (
    <>
      <ScrollView contentContainerStyle={s.conteudo}>
        <EstadoDaConexao fase={fase} temLeitura={c.leituras > 0} saiu={saiuPelaPessoa} />

        {problema && <CartaoDeProblema problema={problema} />}

        {fase === 'desconectado' && c.leituras === 0 && !problema && (
          <Text style={s.corpo}>{t('cabo.intro')}</Text>
        )}

        {/* Valores atuais */}
        {naTela && ultima ? (
          <View style={s.bloco}>
            <View style={s.cartoes}>
              <Valor rotulo={t('cabo.grandeza.temperatura')} valor={naTela.temperatura}
                nota={naTela.temperaturaNota} naLinha />
              <Valor rotulo={t('cabo.grandeza.umidade')} valor={naTela.umidade}
                nota={naTela.umidadeNota} naLinha />
            </View>
            <Text style={s.nota}>{t('cabo.aviso_aquecimento_cruzado')}</Text>

            <Valor rotulo={t('cabo.grandeza.volateis')} valor={naTela.volateis}
              nota={naTela.volateisNota} />
            <Text style={s.estimado}>{naTela.gasEstimado}</Text>

            <View style={[s.gas, { borderColor: COR_DO_GAS[naTela.gas.nivel] }]}>
              <IconeDoGas nivel={naTela.gas.nivel} />
              <Text style={s.gasTexto}>{naTela.gas.texto}</Text>
            </View>

            <Text style={s.nota}>{t('cabo.ultima_leitura', { hora: fmtHoraBancada(ultima.chegadaMs) })}</Text>
          </View>
        ) : (
          fase === 'conectado' && <Text style={s.corpo}>{t('cabo.sem_leitura')}</Text>
        )}

        {/* Gráfico dos últimos 5 minutos */}
        {c.leituras > 0 && (
          <View style={s.bloco}>
            <Text style={s.tituloBloco}>{t('cabo.grafico.titulo')}</Text>
            <View style={s.abas}>
              {GRANDEZAS.map((g) => {
                const ativa = g === grandeza;
                return (
                  <Pressable key={g} onPress={() => setGrandeza(g)}
                    style={StyleSheet.flatten([s.aba, ativa && s.abaAtiva])}
                    accessibilityRole="tab" accessibilityState={{ selected: ativa }}>
                    <Text style={[s.abaTexto, ativa && s.abaTextoAtivo]}>{t(ROTULO[g])}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View onLayout={(e: LayoutChangeEvent) => setLargura(Math.round(e.nativeEvent.layout.width))}>
              <GraficoAoVivo serie={serie} largura={largura} altura={210} {...ESCALA[grandeza]} />
            </View>
            <Text style={s.nota}>{t('cabo.grafico.lacunas')}</Text>
            {grandeza === 'volateis' && <Text style={s.nota}>{t('cabo.grafico.lacunas_gas')}</Text>}
          </View>
        )}

        {/* Registro das mensagens da placa */}
        <View style={s.bloco}>
          <Text style={s.tituloBloco}>{t('cabo.registro.titulo')}</Text>
          {mensagens.length === 0 ? (
            <Text style={s.nota}>{t('cabo.registro.vazio')}</Text>
          ) : (
            mensagens.map((m, i) => {
              const v = mensagemNaTela(m);
              return (
                <View key={`${m.chegadaMs}-${i}`} style={s.mensagem}>
                  <Text style={s.mensagemHora}>{v.hora}</Text>
                  <View style={{ flex: 1 }}>
                    {v.aviso && (
                      <View style={s.linhaIcone}>
                        <IconeAlerta cor={cores.atencao} tamanho={18} />
                        <Text style={s.mensagemAviso}>{v.aviso}</Text>
                      </View>
                    )}
                    <Text style={s.mensagemTexto}>{v.texto}</Text>
                  </View>
                </View>
              );
            })
          )}
          {c.textos + c.ilegiveis > mensagens.length && (
            <Text style={s.nota}>{t('cabo.registro.limite', { n: mensagens.length })}</Text>
          )}
        </View>

        {/* Contagens e planilha */}
        <View style={s.bloco}>
          <Text style={s.corpo}>
            {tp('cabo.contagem.leituras', c.leituras)}
            {c.ilegiveis > 0 ? ` · ${tp('cabo.contagem.ilegiveis', c.ilegiveis)}` : ''}
          </Text>
          {c.descartadas > 0 && <Text style={s.nota}>{tp('cabo.contagem.descartadas', c.descartadas)}</Text>}

          {nLeituras > 0 ? (
            <>
              <Text style={s.nota}>{t('cabo.salvar.ajuda')}</Text>
              <Pressable style={s.botaoSecundario} onPress={salvar} accessibilityRole="button">
                <IconeBaixar cor={cores.texto} />
                <Text style={s.botaoSecundarioTexto}>{t('cabo.botao.salvar')}</Text>
              </Pressable>
              {salvo && (
                <Text style={[s.nota, !salvo.ok && s.notaProblema]}>
                  {salvo.ok ? t('cabo.salvar.feito', { arquivo: salvo.arquivo }) : t('cabo.salvar.nao_baixou')}
                </Text>
              )}
            </>
          ) : (
            <Text style={s.nota}>{t('cabo.salvar.sem_leitura')}</Text>
          )}
        </View>
      </ScrollView>

      {/* Ação primária no terço inferior, ao alcance do polegar. */}
      <View style={StyleSheet.flatten([s.barra, { paddingBottom: espaco.lg + bottom }])}>
        {fase === 'conectado' ? (
          <Pressable style={s.botaoPrimario} onPress={desconectar} accessibilityRole="button">
            <Text style={s.botaoPrimarioTexto}>{t('cabo.botao.desconectar')}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={StyleSheet.flatten([s.botaoPrimario, fase !== 'desconectado' && s.botaoOcupado])}
            onPress={conectar} disabled={fase !== 'desconectado'} accessibilityRole="button"
            accessibilityState={{ disabled: fase !== 'desconectado', busy: fase !== 'desconectado' }}>
            <Text style={s.botaoPrimarioTexto}>
              {fase === 'conectando'
                ? t('cabo.estado.conectando')
                : c.leituras > 0 || problema ? t('cabo.botao.conectar_de_novo') : t('cabo.botao.conectar')}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

function EstadoDaConexao({ fase, temLeitura, saiu }: { fase: Fase; temLeitura: boolean; saiu: boolean }) {
  let texto: string;
  if (fase === 'escolhendo') texto = t('cabo.estado.escolhendo');
  else if (fase === 'conectando') texto = t('cabo.estado.conectando');
  else if (fase === 'conectado') texto = temLeitura ? t('cabo.estado.conectado') : t('cabo.estado.esperando');
  else texto = saiu ? t('cabo.estado.saiu') : t('cabo.estado.desconectado');

  const ligado = fase === 'conectado';
  return (
    <View style={[s.estado, ligado ? s.estadoLigado : s.estadoDesligado]}>
      {ligado
        ? <IconeTomada cor={cores.ok} />
        : fase === 'desconectado' ? <IconeTomadaSolta cor={cores.textoFraco} /> : <IconeRelogio cor={cores.texto} />}
      <Text style={s.estadoTexto}>{texto}</Text>
    </View>
  );
}

function CartaoDeProblema({ problema }: { problema: ProblemaDoCabo }) {
  const { titulo, detalhe } = textoDoProblema(problema);
  return (
    <View style={[s.cartao, s.cartaoProblema]} accessibilityRole="alert">
      <View style={s.linhaIcone}>
        <IconeAlerta cor={cores.perigo} />
        <Text style={s.cartaoTitulo}>{titulo}</Text>
      </View>
      <Text style={s.corpo}>{detalhe}</Text>
    </View>
  );
}

function IconeDoGas({ nivel }: { nivel: NivelDoGas }) {
  if (nivel === 'pronto') return <IconeCheck cor={cores.ok} tamanho={26} />;
  if (nivel === 'aguardando') return <IconeRelogio cor={cores.atencao} />;
  return <IconeAlerta cor={cores.perigo} />;
}

function Valor({ rotulo, valor, nota, naLinha = false }: {
  rotulo: string; valor: string; nota: string | null; naLinha?: boolean;
}) {
  return (
    <View style={[s.valor, naLinha && s.valorNaLinha]}>
      <Text style={s.valorRotulo}>{rotulo}</Text>
      <Text style={s.valorNumero}>{valor}</Text>
      {nota && <Text style={s.nota}>{nota}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.lg, paddingBottom: espaco.xxl },

  avisoFixo: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    paddingHorizontal: espaco.lg, paddingVertical: espaco.sm,
    backgroundColor: '#FDF6EC', borderBottomWidth: 1, borderBottomColor: cores.linha },
  avisoFixoTexto: { flex: 1, fontSize: tipo.corpo, color: cores.texto, fontWeight: '600', lineHeight: 22 },

  corpo: { fontSize: tipo.corpo, color: cores.texto, lineHeight: 22 },
  nota: { fontSize: tipo.corpo, color: cores.textoFraco, lineHeight: 22 },
  notaProblema: { color: cores.perigo, fontWeight: '600' },
  linhaIcone: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },

  estado: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm, padding: espaco.md,
    borderRadius: raio.md, borderWidth: 2, backgroundColor: cores.superficie },
  estadoLigado: { borderColor: cores.ok },
  estadoDesligado: { borderColor: cores.linha },
  estadoTexto: { flex: 1, fontSize: tipo.corpo, fontWeight: '700', color: cores.texto },

  cartao: { padding: espaco.md, gap: espaco.sm, borderRadius: raio.md, borderWidth: 2,
    backgroundColor: cores.superficie },
  cartaoProblema: { borderColor: cores.perigo },
  cartaoAtencao: { borderColor: cores.atencao },
  cartaoTitulo: { flex: 1, fontSize: tipo.corpo + 2, fontWeight: '700', color: cores.texto },

  bloco: { gap: espaco.md, padding: espaco.md, borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.linha, backgroundColor: cores.superficie },
  tituloBloco: { fontSize: tipo.corpo + 1, fontWeight: '700', color: cores.texto },

  cartoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.md },
  valor: { gap: 2 },
  valorNaLinha: { flexGrow: 1, flexBasis: '45%' },
  valorRotulo: { fontSize: tipo.corpo, color: cores.textoFraco, fontWeight: '600' },
  valorNumero: { fontSize: tipo.leitura, fontWeight: '700', color: cores.texto,
    fontVariant: ['tabular-nums'] },
  estimado: { fontSize: tipo.corpo, color: cores.textoFraco, fontVariant: ['tabular-nums'] },

  gas: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm, padding: espaco.md,
    borderRadius: raio.md, borderWidth: 2, minHeight: alvo.minimo },
  gasTexto: { flex: 1, fontSize: tipo.corpo, fontWeight: '700', color: cores.texto },

  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: alvo.espacamento },
  aba: { minHeight: alvo.minimo, paddingHorizontal: espaco.md, justifyContent: 'center',
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.linha, backgroundColor: cores.fundo },
  abaAtiva: { borderColor: cores.acento, borderWidth: 2, backgroundColor: '#FDF6EC' },
  abaTexto: { fontSize: tipo.corpo, color: cores.textoFraco, fontWeight: '600' },
  abaTextoAtivo: { color: cores.texto, fontWeight: '700' },

  mensagem: { flexDirection: 'row', gap: espaco.md, paddingVertical: espaco.xs,
    borderTopWidth: 1, borderTopColor: cores.linha },
  mensagemHora: { fontSize: tipo.corpo, color: cores.textoFraco, fontVariant: ['tabular-nums'] },
  mensagemAviso: { flex: 1, fontSize: tipo.corpo, color: cores.texto, fontWeight: '700' },
  mensagemTexto: { fontSize: tipo.corpo, color: cores.texto, lineHeight: 22 },

  barra: { padding: espaco.lg, borderTopWidth: 1, borderTopColor: cores.linha,
    backgroundColor: cores.fundo },
  botaoPrimario: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    // Fundo quase preto: branco sobre o âmbar `acento` dá ~5,9:1, abaixo dos 7:1 do Princípio V.
    borderRadius: raio.md, backgroundColor: cores.texto, paddingHorizontal: espaco.md },
  botaoOcupado: { opacity: 0.7 },
  botaoPrimarioTexto: { fontSize: tipo.corpo + 1, color: '#FFFFFF', fontWeight: '700' },
  botaoSecundario: { minHeight: alvo.minimo, flexDirection: 'row', gap: espaco.sm,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaco.md,
    borderRadius: raio.md, borderWidth: 2, borderColor: cores.texto, backgroundColor: cores.superficie },
  botaoSecundarioTexto: { fontSize: tipo.corpo, fontWeight: '700', color: cores.texto },
});
