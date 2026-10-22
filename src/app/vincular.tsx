/**
 * Ligar o celular ao projeto (US2, FR-011 a FR-015).
 *
 * O apicultor digita UMA vez o código do projeto que a pesquisadora passou.
 * Digitar aqui é permitido: o Princípio V proíbe texto livre no fluxo de
 * COLETA, e este é o fluxo de envio — que, por sua vez, nunca bloqueia a
 * coleta.
 *
 * O código é conferido no próprio celular (dígito verificador) ANTES de
 * qualquer rede: erro de digitação não gasta tentativa no servidor (FR-012).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatarCodigo, TAMANHO_CODIGO, validarCodigo } from '@/core/codigo-projeto';
import { mensagemAoLigar, mensagemDeCodigoLocal } from '@/core/envio/mensagens';
import { t } from '@/core/i18n';
import type { Vinculo } from '@/core/ports/nuvem';
import { CODIGO_DEMO, ehNuvemSimulada, obterNuvem } from '@/nuvem';
import { IconeAlerta, IconeCheck } from '@/ui/Icones';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';

type Aviso = { titulo: string | null; texto: string; tom: 'neutro' | 'atencao' };

export default function Vincular() {
  // Recuo da barra de navegação do sistema (Android 10+): sem ele o botão fica atrás dela.
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();
  const nuvem = obterNuvem();

  const [codigo, setCodigo] = useState('');
  const [ligando, setLigando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ligado, setLigado] = useState<Vinculo | null>(null);

  function digitar(texto: string) {
    setCodigo(formatarCodigo(texto));
    setAviso(null);
  }

  async function ligar() {
    if (ligando) return;
    const local = validarCodigo(codigo);
    if (!local.ok) {
      setAviso({ titulo: null, texto: mensagemDeCodigoLocal(local.motivo), tom: 'atencao' });
      return;
    }
    setLigando(true);
    setAviso(null);
    try {
      const r = await nuvem.vincular(local.codigo);
      if (r.ok && r.vinculo) {
        setLigado(r.vinculo);
      } else if (!r.ok) {
        const m = mensagemAoLigar(r.motivo);
        setAviso({ titulo: m.titulo, texto: m.texto, tom: m.tom });
      }
    } finally {
      setLigando(false);
    }
  }

  return (
    <View style={s.tela}>
      <Stack.Screen options={{ title: t('vinculo.titulo') }} />
      <ScrollView
        contentContainerStyle={StyleSheet.flatten([s.conteudo, { paddingBottom: 120 + bottom }])}
        keyboardShouldPersistTaps="handled"
      >
        {ligado ? (
          <View style={s.sucesso}>
            <View style={s.linha}>
              <IconeCheck cor={cores.ok} tamanho={28} />
              <Text style={s.sucessoTitulo}>{t('vinculo.sucesso.titulo')}</Text>
            </View>
            <Text style={s.texto}>
              {t('vinculo.sucesso.texto', {
                apicultor: ligado.apicultorNome, projeto: ligado.projetoNome,
              })}
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.texto}>{t('vinculo.explicacao')}</Text>
            <Text style={s.texto}>{t('vinculo.coleta_livre')}</Text>

            <Text style={s.rotulo} nativeID="rotulo-codigo">{t('vinculo.campo.rotulo')}</Text>
            <TextInput
              value={codigo}
              onChangeText={digitar}
              onSubmitEditing={ligar}
              placeholder={t('vinculo.campo.exemplo')}
              placeholderTextColor={cores.textoFraco}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              // 8 símbolos + o hífen que a própria tela insere.
              maxLength={TAMANHO_CODIGO + 1}
              returnKeyType="done"
              editable={!ligando}
              style={s.campo}
              accessibilityLabel={t('vinculo.campo.rotulo')}
              accessibilityLabelledBy="rotulo-codigo"
            />

            {aviso && (
              <View style={[s.aviso, {
                borderLeftColor: aviso.tom === 'neutro' ? cores.neutro : cores.atencao,
              }]}>
                <View style={s.linha}>
                  <IconeAlerta cor={aviso.tom === 'neutro' ? cores.neutro : cores.atencao} tamanho={20} />
                  <Text style={s.avisoTitulo}>{aviso.titulo ?? aviso.texto}</Text>
                </View>
                {aviso.titulo && <Text style={s.texto}>{aviso.texto}</Text>}
              </View>
            )}

            <Text style={s.dica}>{t('vinculo.privacidade')}</Text>
            {ehNuvemSimulada(nuvem) && (
              <Text style={s.dica}>{t('vinculo.demo', { codigo: CODIGO_DEMO })}</Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Ação primária no terço inferior, alcançável com o polegar */}
      <View style={StyleSheet.flatten([s.barra, { paddingBottom: espaco.lg + bottom }])}>
        {ligado ? (
          <Pressable onPress={() => router.back()} style={s.botao} accessibilityRole="button">
            <Text style={s.botaoTexto}>{t('vinculo.botao.voltar')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={ligar}
            disabled={ligando}
            accessibilityRole="button"
            style={StyleSheet.flatten([s.botao, ligando && s.botaoInativo])}
          >
            <Text style={s.botaoTexto}>
              {ligando ? t('vinculo.botao.ligando') : t('vinculo.botao.ligar')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.md, paddingBottom: 120 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },

  texto: { fontSize: tipo.corpo, color: cores.texto, lineHeight: 23 },
  rotulo: { fontSize: tipo.corpo, fontWeight: '700', color: cores.texto, marginTop: espaco.sm },
  dica: { fontSize: tipo.corpo, color: cores.textoFraco, lineHeight: 22 },

  campo: { minHeight: alvo.minimo + 8, borderWidth: 2, borderColor: cores.texto,
    borderRadius: raio.md, paddingHorizontal: espaco.md, backgroundColor: cores.superficie,
    color: cores.texto, fontSize: tipo.leitura - 6, fontWeight: '700', letterSpacing: 4,
    fontVariant: ['tabular-nums'] },

  aviso: { padding: espaco.md, backgroundColor: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderColor: cores.linha, borderLeftWidth: 4, gap: espaco.xs },
  avisoTitulo: { flex: 1, fontSize: tipo.corpo, fontWeight: '700', color: cores.texto },

  sucesso: { padding: espaco.md, backgroundColor: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderColor: cores.ok, gap: espaco.sm },
  sucessoTitulo: { flex: 1, fontSize: tipo.corpo + 2, fontWeight: '700', color: cores.ok },

  barra: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: espaco.lg,
    backgroundColor: cores.fundo, borderTopWidth: 1, borderTopColor: cores.linha },
  botao: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, backgroundColor: cores.acento },
  botaoInativo: { opacity: 0.45 },
  botaoTexto: { fontSize: tipo.corpo + 2, color: cores.superficie, fontWeight: '700' },
});
