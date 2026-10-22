/**
 * Enviar — a segunda metade do propósito: as leituras saem do celular e chegam
 * às pesquisadoras.
 *
 * O botão "Enviar agora" é obrigatório e sempre visível: trabalho de fundo é
 * cortesia opcional nos aparelhos que são o nosso alvo, nunca o caminho
 * principal. Ausência de rede nunca aparece como erro — é o estado normal.
 *
 * Ligar o celular ao projeto acontece SÓ a partir daqui (FR-014), em tela
 * própria (`/vincular`). Coletar nunca pede código.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useDb } from '@/data/provider';
import { contarLeituras, pendenteMaisAntiga, totalPendentes } from '@/data/repo';
import { enviarPendentes } from '@/data/sync';
import { obterNuvem } from '@/nuvem';
import type { MotivoFalha, Vinculo } from '@/core/ports/nuvem';
import { mensagemDeParada } from '@/core/envio/mensagens';
import { t, tp } from '@/core/i18n';
import { fmtData, fmtNumero } from '@/core/format';
import { IconeAlerta, IconeCheck } from '@/ui/Icones';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';

export default function Enviar() {
  const { db } = useDb();
  const router = useRouter();
  const nuvem = obterNuvem();

  const [pendentes, setPendentes] = useState(0);
  const [total, setTotal] = useState(0);
  const [antiga, setAntiga] = useState<number | null>(null);
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [parada, setParada] = useState<MotivoFalha | null>(null);
  const [concluido, setConcluido] = useState(0);

  const atualizar = useCallback(() => {
    setPendentes(totalPendentes(db));
    setTotal(contarLeituras(db));
    setAntiga(pendenteMaisAntiga(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      atualizar();
      nuvem.vinculoAtual().then(setVinculo);
    }, [atualizar, nuvem]),
  );

  const ligar = () => router.push('/vincular');

  async function enviar() {
    // Sem vínculo, o primeiro "Enviar agora" leva a ligar o celular (US2-1).
    if (!(await nuvem.vinculoAtual())) {
      ligar();
      return;
    }
    setEnviando(true);
    setParada(null);
    setConcluido(0);
    try {
      const r = await enviarPendentes(db, nuvem, {
        aoProgredir: (p) => setProgresso(p.enviadas),
      });
      setParada(r.parou);
      setConcluido(r.enviadas);
    } finally {
      setEnviando(false);
      setProgresso(0);
      atualizar();
      nuvem.vinculoAtual().then(setVinculo);
    }
  }

  const naNuvem = total - pendentes;
  const msg = parada !== null ? mensagemDeParada(parada) : null;

  return (
    <View style={s.tela}>
      <ScrollView contentContainerStyle={s.conteudo}>
        {/* Os dois estados, distintos e simultaneamente visíveis (Princípio I) */}
        <View style={s.painelEstados}>
          <Estado rotulo={t('envio.estado.celular')} valor={total} cor={cores.texto} />
          <View style={s.divisor} />
          <Estado rotulo={t('envio.estado.nuvem')} valor={naNuvem} cor={cores.ok} />
        </View>

        <Text style={s.resumo}>
          {pendentes > 0
            ? [tp('envio.pendentes', pendentes),
               antiga !== null ? t('envio.pendentes.mais_antiga', { data: fmtData(antiga) }) : '']
                .filter(Boolean).join(' ')
            : total > 0 ? t('envio.tudo_enviado') : t('envio.nada_para_enviar')}
        </Text>

        {enviando && (
          <View style={s.progresso}>
            <ActivityIndicator color={cores.acento} accessibilityLabel={t('envio.botao.enviando')} />
            <Text style={s.progressoTexto}>
              {t('envio.progresso', { feitas: fmtNumero(progresso), total: fmtNumero(pendentes) })}
            </Text>
          </View>
        )}

        {!enviando && concluido > 0 && parada === null && (
          <View style={s.sucesso}>
            {/* Ícone em SVG, não glifo: caractere de fonte vira quadradinho em Android antigo. */}
            <IconeCheck cor={cores.ok} tamanho={24} />
            <Text style={s.sucessoTexto}>{tp('envio.concluido', concluido)}</Text>
          </View>
        )}

        {msg && (
          <View style={[s.aviso, { borderLeftColor: msg.tom === 'neutro' ? cores.neutro : cores.atencao }]}>
            <View style={s.avisoCabeca}>
              <IconeAlerta cor={msg.tom === 'neutro' ? cores.neutro : cores.atencao} tamanho={20} />
              <Text style={s.avisoTitulo}>{msg.titulo}</Text>
            </View>
            <Text style={s.avisoTexto}>{msg.texto}</Text>
          </View>
        )}

        {/* Ligar ao projeto: só aqui, nunca no fluxo de coleta */}
        {vinculo ? (
          <View style={s.bloco}>
            <Text style={s.blocoTitulo}>{t('envio.vinculo.ligado.titulo')}</Text>
            <Text style={s.blocoTexto}>
              {t('envio.vinculo.ligado.texto', {
                apicultor: vinculo.apicultorNome, projeto: vinculo.projetoNome,
              })}
            </Text>
          </View>
        ) : (
          <View style={s.bloco}>
            <Text style={s.blocoTitulo}>{t('envio.vinculo.pedir.titulo')}</Text>
            <Text style={s.blocoTexto}>{t('envio.vinculo.pedir.texto')}</Text>
            <Pressable onPress={ligar} style={s.botaoSecundario} accessibilityRole="button">
              <Text style={s.botaoSecundarioTexto}>{t('envio.vinculo.pedir.botao')}</Text>
            </Pressable>
          </View>
        )}

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>{t('envio.garantia.titulo')}</Text>
          <Text style={s.blocoTexto}>{t('envio.garantia.texto')}</Text>
        </View>
      </ScrollView>

      {/* Obrigatório, sempre visível, no terço inferior */}
      <View style={s.barra}>
        <Pressable
          onPress={enviar}
          disabled={enviando || pendentes === 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: enviando || pendentes === 0, busy: enviando }}
          style={StyleSheet.flatten([
            s.botaoPrimario,
            (enviando || pendentes === 0) && s.botaoInativo,
          ])}
        >
          <Text style={s.botaoPrimarioTexto}>
            {enviando ? t('envio.botao.enviando') : t('envio.botao.enviar')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Estado({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <View style={s.estado}>
      <Text style={s.estadoRotulo}>{rotulo}</Text>
      <Text style={[s.estadoValor, { color: cor }]}>{fmtNumero(valor)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.md, paddingBottom: 120 },

  painelEstados: { flexDirection: 'row', backgroundColor: cores.superficie,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.linha,
    paddingVertical: espaco.lg },
  estado: { flex: 1, alignItems: 'center' },
  estadoRotulo: { fontSize: tipo.corpo, color: cores.textoFraco },
  estadoValor: { fontSize: tipo.leitura, fontWeight: '700', marginTop: 2,
    fontVariant: ['tabular-nums'] },
  divisor: { width: 1, backgroundColor: cores.linha },

  resumo: { fontSize: tipo.corpo, color: cores.textoFraco, lineHeight: 22 },

  progresso: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    padding: espaco.md, backgroundColor: cores.superficie,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.linha },
  progressoTexto: { fontSize: tipo.corpo, color: cores.texto,
    fontVariant: ['tabular-nums'] },

  sucesso: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    padding: espaco.md, backgroundColor: cores.superficie,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.ok },
  sucessoTexto: { flex: 1, fontSize: tipo.corpo + 2, fontWeight: '700', color: cores.ok },

  aviso: { padding: espaco.md, backgroundColor: cores.superficie,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.linha,
    borderLeftWidth: 4, gap: espaco.xs },
  avisoCabeca: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  avisoTitulo: { flex: 1, fontSize: tipo.corpo, fontWeight: '700', color: cores.texto },
  avisoTexto: { fontSize: tipo.corpo, color: cores.textoFraco, lineHeight: 22 },

  bloco: { backgroundColor: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderColor: cores.linha, padding: espaco.md, gap: espaco.sm },
  blocoTitulo: { fontSize: tipo.corpo, fontWeight: '700', color: cores.texto },
  blocoTexto: { fontSize: tipo.corpo, color: cores.textoFraco, lineHeight: 22 },

  botaoSecundario: { minHeight: alvo.minimo, alignItems: 'center',
    justifyContent: 'center', borderRadius: raio.md, borderWidth: 2,
    borderColor: cores.acento, backgroundColor: cores.fundo,
    paddingHorizontal: espaco.md },
  botaoSecundarioTexto: { fontSize: tipo.corpo, fontWeight: '700', color: cores.acento,
    textAlign: 'center' },

  barra: { position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: espaco.lg, backgroundColor: cores.fundo,
    borderTopWidth: 1, borderTopColor: cores.linha },
  botaoPrimario: { minHeight: alvo.minimo, alignItems: 'center',
    justifyContent: 'center', borderRadius: raio.md, backgroundColor: cores.acento },
  botaoInativo: { opacity: 0.45 },
  botaoPrimarioTexto: { fontSize: tipo.corpo + 2, color: cores.superficie, fontWeight: '700' },
});
