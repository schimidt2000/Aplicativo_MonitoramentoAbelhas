/**
 * Configurar placa nova (feature 005, US5, FR-024).
 *
 * Uma placa que acabou de receber o programa não conversa: espera UMA linha
 * com a hora inicial. Esta tela manda a hora do computador em segundos Unix —
 * só se ela for plausível (`core/relogio.ts`); com a data errada, o botão não
 * aparece e a tela diz para acertar a data primeiro (nunca botão inerte).
 *
 * Só desenha e encadeia: a porta é de `@/transports/cable`, a conversa de
 * `core/cabo/placaNova.ts` (via `executarPlacaNova`), os textos do i18n.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  abrirCanal, escolherPortaDeColeta, portaJaAutorizada, serialDeColeta, verificarCabo, vigiarPortas,
  type PortaDeColeta,
} from '@/transports/cable';
import { placaNovaDeDemonstracao, TRANSPORTE_ATIVO } from '@/transports';
import { t } from '@/core/i18n';
import { TransportError } from '@/core/ports/transport';
import type { CanalSerial } from '@/core/ports/canal';
import { executarPlacaNova } from '@/core/cabo/sessao';
import {
  problemaDaPortaPorErro, textoDaPlacaNova, textoDoProblemaDaPorta, textoSemCaboParaColeta,
  type ProblemaDaPorta,
} from '@/core/cabo/mensagens';
import { avaliarRelogioDoCelular } from '@/core/relogio';
import { fmtDataHoraPartes } from '@/core/format';
import { IconeAlerta, IconeCheck } from '@/ui/Icones';
import { IconeTomadaSolta } from '@/ui/IconesCabo';
import { bipar, prepararBipe } from '@/ui/bipe';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';

type Estado =
  | { fase: 'pronto' }
  | { fase: 'enviando' }
  | { fase: 'porta'; problema: ProblemaDaPorta }
  | { fase: 'fim'; titulo: string; detalhe: string; ok: boolean; jaConfigurada: boolean };

export default function PlacaNova() {
  const router = useRouter();
  const disponibilidade = useMemo(() => verificarCabo(), []);
  const temDemo = TRANSPORTE_ATIVO === 'mock';
  const [simulada, setSimulada] = useState(!disponibilidade.ok);
  const [estado, setEstado] = useState<Estado>({ fase: 'pronto' });
  const [agora, setAgora] = useState(() => Date.now());
  const porta = useRef<PortaDeColeta | null>(null);
  const montada = useRef(true);
  const emAndamento = useRef(false);

  useEffect(() => {
    montada.current = true;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => { montada.current = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!disponibilidade.ok) return;
    const serial = serialDeColeta();
    void portaJaAutorizada(serial).then((p) => { if (p && montada.current) porta.current = p; });
    return vigiarPortas(serial, (p) => { porta.current = p; },
      (p) => { if (porta.current === p) porta.current = null; });
  }, [disponibilidade.ok]);

  const plausivel = avaliarRelogioDoCelular(agora, null).plausivel;
  const usandoSimulada = simulada || !disponibilidade.ok;
  const pode = disponibilidade.ok || temDemo;
  const partes = fmtDataHoraPartes(agora);

  async function enviarPor(abrir: () => Promise<CanalSerial>) {
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
    // A hora lida AGORA, no instante do envio, e conferida de novo.
    const agoraMs = Date.now();
    if (!avaliarRelogioDoCelular(agoraMs, null).plausivel) {
      await canal.fechar();
      if (montada.current) setEstado({ fase: 'pronto' });
      return;
    }
    const { desfecho } = await executarPlacaNova(canal, Math.floor(agoraMs / 1000));
    await canal.fechar();
    if (!montada.current) return;
    const texto = textoDaPlacaNova(desfecho);
    setEstado({ fase: 'fim', ...texto, jaConfigurada: desfecho.resultado === 'ja-configurada' });
    bipar(texto.ok ? 1 : 2);
  }

  function enviar() {
    if (emAndamento.current || !plausivel) return;
    emAndamento.current = true;
    prepararBipe();
    setEstado({ fase: 'enviando' });
    const fim = () => { emAndamento.current = false; };
    if (usandoSimulada) {
      void enviarPor(async () => placaNovaDeDemonstracao().acordar('desconhecida').canal).finally(fim);
      return;
    }
    const conhecida = porta.current;
    // Sem placa autorizada à vista, a lista do navegador TEM de abrir direto do toque.
    const pedido = conhecida ? Promise.resolve(conhecida) : escolherPortaDeColeta(serialDeColeta());
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
      await enviarPor(() => abrirCanal(p));
    })().finally(fim);
  }

  const ocupado = estado.fase === 'enviando';

  return (
    <View style={s.tela}>
      {usandoSimulada && temDemo && (
        <View style={s.rotuloSimulada}>
          <IconeAlerta cor={cores.atencao} tamanho={22} />
          <Text style={s.rotuloSimuladaTexto}>{t('caboColeta.simulada.rotulo')}</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={s.conteudo}>
        {!disponibilidade.ok && (
          <View style={[s.cartao, s.cartaoAtencao]}>
            <View style={s.linhaIcone}>
              <IconeTomadaSolta cor={cores.texto} />
              <Text style={s.cartaoTitulo}>{textoSemCaboParaColeta(disponibilidade.motivo).titulo}</Text>
            </View>
            <Text style={s.corpo}>{textoSemCaboParaColeta(disponibilidade.motivo).detalhe}</Text>
            {temDemo && <Text style={s.corpo}>{t('caboColeta.demo_disponivel')}</Text>}
          </View>
        )}

        <Text style={s.corpo}>{t('placaNova.intro')}</Text>

        {disponibilidade.ok && temDemo && (
          <View style={s.opcoesLinha} accessibilityRole="radiogroup">
            {([false, true] as const).map((sim) => (
              <Pressable key={String(sim)} onPress={() => setSimulada(sim)} disabled={ocupado}
                accessibilityRole="radio" accessibilityState={{ checked: simulada === sim, disabled: ocupado }}
                style={[s.opcao, simulada === sim && s.opcaoMarcada]}>
                <View style={[s.marca, simulada === sim && s.marcaCheia]}>
                  {simulada === sim && <IconeCheck cor={cores.superficie} tamanho={18} />}
                </View>
                <Text style={[s.opcaoTexto, simulada === sim && s.opcaoTextoMarcada]}>
                  {t(sim ? 'caboColeta.botao.simulada' : 'caboColeta.botao.real')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={s.corpo}>{t('placaNova.passo.cabo')}</Text>
        <Text style={s.corpo}>{t('placaNova.passo.enviar')}</Text>

        <View style={s.cartao}>
          <Text style={s.ajuda}>{t('placaNova.computador_marca')}</Text>
          <Text style={s.hora}>{t('hora.data_hora', partes)}</Text>
        </View>

        {!plausivel && (
          <View style={[s.cartao, s.cartaoProblema]} accessible accessibilityRole="alert">
            <View style={s.linhaIcone}>
              <IconeAlerta cor={cores.perigo} tamanho={24} />
              <Text style={s.cartaoTitulo}>{t('placaNova.relogio_errado.titulo')}</Text>
            </View>
            <Text style={s.corpo}>{t('placaNova.relogio_errado.detalhe')}</Text>
          </View>
        )}

        {estado.fase === 'enviando' && <Text style={s.titulo}>{t('placaNova.estado.enviando')}</Text>}

        {estado.fase === 'porta' && (
          <View style={[s.cartao, s.cartaoProblema]} accessible accessibilityRole="alert">
            <View style={s.linhaIcone}>
              <IconeAlerta cor={cores.perigo} tamanho={24} />
              <Text style={s.cartaoTitulo}>{textoDoProblemaDaPorta(estado.problema).titulo}</Text>
            </View>
            <Text style={s.corpo}>{textoDoProblemaDaPorta(estado.problema).detalhe}</Text>
          </View>
        )}

        {estado.fase === 'fim' && (
          <View style={[s.cartao, estado.ok ? s.cartaoOk : s.cartaoAtencao]} accessible accessibilityRole="alert">
            <View style={s.linhaIcone}>
              {estado.ok
                ? <IconeCheck cor={cores.ok} tamanho={26} />
                : <IconeAlerta cor={cores.atencao} tamanho={24} />}
              <Text style={s.cartaoTitulo}>{estado.titulo}</Text>
            </View>
            <Text style={s.corpo}>{estado.detalhe}</Text>
          </View>
        )}

        {estado.fase === 'fim' && estado.jaConfigurada && (
          <Pressable style={s.botaoSecundario} accessibilityRole="button"
            onPress={() => router.replace('/coleta-cabo')}>
            <Text style={s.botaoSecundarioTexto}>{t('placaNova.botao.ir_coleta')}</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Com a data errada não há botão: a tela já disse o que fazer (FR-024). */}
      {pode && plausivel && (
        <View style={s.rodape}>
          <Pressable style={[s.botao, ocupado && s.botaoOcupado]} accessibilityRole="button"
            accessibilityState={{ disabled: ocupado, busy: ocupado }} disabled={ocupado} onPress={enviar}>
            <Text style={s.botaoTexto}>
              {t(estado.fase === 'fim' || estado.fase === 'porta' ? 'placaNova.botao.de_novo' : 'placaNova.botao.enviar')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.xl, gap: espaco.md },
  corpo: { fontSize: tipo.corpo, color: cores.texto, lineHeight: 24 },
  ajuda: { fontSize: tipo.corpo, color: cores.textoFraco },
  titulo: { fontSize: tipo.titulo, fontWeight: '700', color: cores.texto },
  hora: { fontSize: tipo.leitura, fontWeight: '700', color: cores.texto, fontVariant: ['tabular-nums'] },

  rotuloSimulada: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    paddingHorizontal: espaco.xl, paddingVertical: espaco.md, backgroundColor: cores.superficie,
    borderBottomWidth: 2, borderBottomColor: cores.atencao },
  rotuloSimuladaTexto: { flex: 1, fontSize: tipo.corpo, color: cores.texto, fontWeight: '600' },

  cartao: { backgroundColor: cores.superficie, borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.bordaControle, padding: espaco.lg, gap: espaco.sm },
  cartaoAtencao: { borderLeftWidth: 6, borderLeftColor: cores.atencao },
  cartaoProblema: { borderLeftWidth: 6, borderLeftColor: cores.perigo },
  cartaoOk: { borderLeftWidth: 6, borderLeftColor: cores.ok },
  cartaoTitulo: { flex: 1, fontSize: tipo.corpo + 2, fontWeight: '700', color: cores.texto },
  linhaIcone: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },

  opcoesLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: alvo.espacamento },
  opcao: { minHeight: alvo.minimo, flexGrow: 1, flexDirection: 'row', alignItems: 'center',
    gap: espaco.md, paddingHorizontal: espaco.lg, borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.bordaControle, backgroundColor: cores.superficie },
  opcaoMarcada: { borderWidth: 3, borderColor: cores.texto },
  opcaoTexto: { flexShrink: 1, fontSize: tipo.corpo + 1, color: cores.texto },
  opcaoTextoMarcada: { fontWeight: '700' },
  marca: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: cores.bordaControle,
    alignItems: 'center', justifyContent: 'center' },
  marcaCheia: { backgroundColor: cores.texto, borderColor: cores.texto },

  rodape: { paddingHorizontal: espaco.xl, paddingVertical: espaco.lg,
    borderTopWidth: 1, borderTopColor: cores.linha, backgroundColor: cores.fundo },
  botao: { minHeight: alvo.minimo + 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, backgroundColor: cores.texto },
  botaoOcupado: { opacity: 0.6 },
  botaoTexto: { fontSize: tipo.corpo + 2, color: cores.superficie, fontWeight: '700' },
  botaoSecundario: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.bordaControle,
    backgroundColor: cores.superficie },
  botaoSecundarioTexto: { fontSize: tipo.corpo, color: cores.texto, fontWeight: '700' },
});
