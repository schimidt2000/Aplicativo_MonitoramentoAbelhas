/**
 * Diagnóstico de conexão. É P0, não polimento: no Android 8-10 a varredura BLE
 * devolve zero resultados EM SILÊNCIO se a Localização do sistema estiver
 * desligada, mesmo com a permissão concedida. Sem esta tela o app parece quebrado.
 *
 * A tela é renderização pura de Transport.preflight() — toda a lógica de
 * pré-condição vive num lugar só. O transporte vem do registro
 * (`obterTransporte`), nunca de uma implementação importada aqui (Princípio IV).
 *
 * Todo texto vem do módulo de i18n; os rótulos de cada item já chegam em pt-BR
 * do transporte, que também os tira de lá.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { obterTransporte } from '@/transports';
import type { PreflightItem } from '@/core/ports/transport';
import { t } from '@/core/i18n';
import { IconeAlerta, IconeCheck } from '@/ui/Icones';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';

export default function Diagnostico() {
  // O fim da rolagem não pode ficar atrás da barra de navegação do sistema.
  const { bottom } = useSafeAreaInsets();
  const [itens, setItens] = useState<PreflightItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  // Verificação que não respondeu é dita na tela, nunca uma lista vazia muda.
  const [naoVerificou, setNaoVerificou] = useState(false);

  const verificar = useCallback(async () => {
    setCarregando(true);
    try {
      setItens(await obterTransporte().preflight());
      setNaoVerificou(false);
    } catch {
      // Sem lista, a tela diz o que houve e o que fazer; o botão continua ali.
      setItens([]);
      setNaoVerificou(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void verificar(); }, [verificar]);

  return (
    <ScrollView style={s.tela} contentContainerStyle={{ padding: espaco.lg, gap: espaco.md, paddingBottom: espaco.lg + bottom }}>
      <Text style={s.intro}>{t('diagnostico.intro')}</Text>

      {naoVerificou && !carregando && (
        <View style={[s.item, s.itemPendente]} accessible
          accessibilityLabel={t('diagnostico.item.rotulo_acessivel_dica', {
            estado: t('diagnostico.item.pendente'),
            rotulo: t('diagnostico.nao_verificou.titulo'),
            dica: t('diagnostico.nao_verificou.detalhe'),
          })}>
          <IconeAlerta cor={cores.atencao} tamanho={24} />
          <View style={{ flex: 1 }}>
            <Text style={[s.itemEstado, { color: cores.atencao }]}>
              {t('diagnostico.item.pendente')}
            </Text>
            <Text style={s.itemLabel}>{t('diagnostico.nao_verificou.titulo')}</Text>
            <Text style={s.itemHint}>{t('diagnostico.nao_verificou.detalhe')}</Text>
          </View>
        </View>
      )}

      {/* Cor + ícone + palavra (Princípio V): o estado nunca depende só da cor. */}
      {itens.map((i) => {
        const estado = t(i.ok ? 'diagnostico.item.ok' : 'diagnostico.item.pendente');
        return (
          <View key={i.id} style={[s.item, i.ok ? s.itemOk : s.itemPendente]}
            accessible
            accessibilityLabel={i.hint
              ? t('diagnostico.item.rotulo_acessivel_dica', { estado, rotulo: i.label, dica: i.hint })
              : t('diagnostico.item.rotulo_acessivel', { estado, rotulo: i.label })}>
            {i.ok
              ? <IconeCheck cor={cores.ok} tamanho={24} />
              : <IconeAlerta cor={cores.atencao} tamanho={24} />}
            <View style={{ flex: 1 }}>
              <Text style={[s.itemEstado, { color: i.ok ? cores.ok : cores.atencao }]}>
                {estado}
              </Text>
              <Text style={s.itemLabel}>{i.label}</Text>
              {i.hint && <Text style={s.itemHint}>{i.hint}</Text>}
            </View>
          </View>
        );
      })}

      <View style={s.nota}>
        <Text style={s.notaTitulo}>{t('diagnostico.nesta_versao.titulo')}</Text>
        <Text style={s.notaTexto}>{t('diagnostico.nesta_versao.texto')}</Text>
      </View>

      <Pressable style={s.botao} onPress={verificar} disabled={carregando}
        accessibilityRole="button" accessibilityState={{ busy: carregando, disabled: carregando }}>
        {carregando && (
          <ActivityIndicator color="#FFFFFF" accessibilityLabel={t('diagnostico.verificando')} />
        )}
        <Text style={s.botaoTexto}>
          {t(carregando ? 'diagnostico.verificando' : 'diagnostico.verificar_de_novo')}
        </Text>
      </Pressable>

      {/* Feature 004: monitor de bancada pelo cabo. Em qualquer plataforma — onde
          não dá, a própria tela explica a alternativa (FR-016). */}
      <View style={s.nota}>
        <Text style={s.notaTitulo}>{t('cabo.diagnostico.titulo')}</Text>
        <Text style={s.notaTexto}>{t('cabo.diagnostico.ajuda')}</Text>
      </View>
      <Link href="/cabo" asChild>
        <Pressable style={s.botaoCabo} accessibilityRole="button">
          <Text style={s.botaoCaboTexto}>{t('cabo.titulo')}</Text>
        </Pressable>
      </Link>

      {/* Feature 005: a coleta de verdade pelo cabo, e a placa nova. */}
      <View style={s.nota}>
        <Text style={s.notaTitulo}>{t('cabo.diagnostico.coleta_titulo')}</Text>
        <Text style={s.notaTexto}>{t('cabo.diagnostico.coleta_ajuda')}</Text>
      </View>
      <Link href="/coleta-cabo" asChild>
        <Pressable style={s.botaoCabo} accessibilityRole="button">
          <Text style={s.botaoCaboTexto}>{t('titulo.coleta_cabo')}</Text>
        </Pressable>
      </Link>
      <Link href="/placa-nova" asChild>
        <Pressable style={s.botaoCabo} accessibilityRole="button">
          <Text style={s.botaoCaboTexto}>{t('placaNova.link')}</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  intro: { fontSize: tipo.corpo, color: cores.textoFraco, lineHeight: 22 },
  item: { flexDirection: 'row', gap: espaco.md, alignItems: 'flex-start',
    padding: espaco.md, borderRadius: raio.md, borderWidth: 1,
    backgroundColor: cores.superficie, minHeight: alvo.linha },
  itemOk: { borderColor: cores.ok },
  itemPendente: { borderColor: cores.atencao, borderWidth: 2 },
  itemEstado: { fontSize: tipo.rotulo, fontWeight: '700' },
  itemLabel: { fontSize: tipo.corpo, fontWeight: '600', color: cores.texto },
  itemHint: { fontSize: tipo.rotulo, color: cores.textoFraco, marginTop: 2, lineHeight: 20 },
  nota: { padding: espaco.md, borderRadius: raio.md, backgroundColor: '#FDF6EC',
    borderWidth: 1, borderColor: cores.linha },
  notaTitulo: { fontSize: tipo.rotulo, fontWeight: '700', color: cores.texto },
  notaTexto: { fontSize: tipo.rotulo, color: cores.textoFraco, marginTop: espaco.xs,
    lineHeight: 20 },
  botao: { minHeight: alvo.minimo, flexDirection: 'row', gap: espaco.sm,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, backgroundColor: cores.acento, marginTop: espaco.sm },
  botaoTexto: { fontSize: tipo.corpo, color: '#FFFFFF', fontWeight: '700' },
  botaoCabo: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, borderWidth: 2, borderColor: cores.texto,
    backgroundColor: cores.superficie },
  botaoCaboTexto: { fontSize: tipo.corpo, color: cores.texto, fontWeight: '700' },
});
