import { Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BancoProvider } from '@/data/provider';
import { ModoSolProvider } from '@/ui/ModoSol';
import { t } from '@/core/i18n';
import { cores, tipo } from '@/ui/tokens';

/**
 * Na web o app é enquadrado numa coluna com largura de celular. Não é enfeite:
 * este é um app de campo, usado com uma mão e luva, e esticá-lo em 1400px de
 * monitor esconde justamente o que precisamos avaliar — se o alvo de toque, a
 * hierarquia e o número cabem na tela real do apicultor.
 * No aparelho, `palco` e `aparelho` são flex simples e não custam nada.
 */
const LARGURA_CELULAR = 420;
const naWeb = Platform.OS === 'web';

export default function RootLayout() {
  return (
    <ModoSolProvider>
      <BancoProvider>
        <StatusBar style="dark" />
        <View style={st.palco}>
          <View style={st.aparelho}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: cores.fundo },
                headerTintColor: cores.texto,
                headerTitleStyle: { fontSize: tipo.corpo, fontWeight: '700' },
                contentStyle: { backgroundColor: cores.fundo },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="diagnostico" options={{ title: t('titulo.diagnostico') }} />
              <Stack.Screen name="colmeia/[id]" options={{ title: t('titulo.colmeia') }} />
              <Stack.Screen name="cabo" options={{ title: t('cabo.titulo') }} />
              <Stack.Screen name="coleta-cabo" options={{ title: t('titulo.coleta_cabo') }} />
              <Stack.Screen name="placa-nova" options={{ title: t('titulo.placa_nova') }} />
            </Stack>
          </View>
        </View>
      </BancoProvider>
    </ModoSolProvider>
  );
}

const st = StyleSheet.create({
  palco: naWeb
    ? { flex: 1, backgroundColor: '#E6E1D6', alignItems: 'center' }
    : { flex: 1 },
  aparelho: naWeb
    ? {
        flex: 1,
        width: '100%',
        maxWidth: LARGURA_CELULAR,
        backgroundColor: cores.fundo,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: cores.linha,
        overflow: 'hidden',
      }
    : { flex: 1 },
});
