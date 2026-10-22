/**
 * Menu principal do app. Quatro abas que espelham o que o apicultor faz:
 * ver as colmeias, coletar do nó, enviar às pesquisadoras, ajustar.
 *
 * Rótulo sem ícone de propósito: fonte de ícone está proibida (peso e tofu),
 * e desenhar quatro ícones em SVG custaria mais do que a palavra resolve.
 * Palavra também é mais acessível para quem tem pouca familiaridade com apps.
 */
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/core/i18n';
import { alvo, cores, tipo } from '@/ui/tokens';

export default function TabsLayout() {
  // O app desenha por baixo da barra de navegação do sistema (Android 10+ e
  // telas sem botão físico). Sem somar esse recuo, as abas ficam cobertas pelos
  // botões do sistema e não dá para tocar nelas — visto no emulador Android 10.
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: cores.fundo },
        headerTintColor: cores.texto,
        headerTitleStyle: { fontSize: tipo.corpo, fontWeight: '700' },
        sceneStyle: { backgroundColor: cores.fundo },
        tabBarActiveTintColor: cores.acento,
        tabBarInactiveTintColor: cores.textoFraco,
        tabBarStyle: {
          backgroundColor: cores.fundo,
          borderTopColor: cores.linha,
          borderTopWidth: 1,
          height: alvo.minimo + 12 + bottom,
          paddingTop: 6,
          paddingBottom: 6 + bottom,
        },
        tabBarLabelStyle: { fontSize: tipo.rotulo, fontWeight: '700' },
        // Sem espaço reservado para ícone: o rótulo é o alvo inteiro.
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index"
        options={{ title: t('abas.colmeias'), tabBarLabel: t('abas.colmeias') }} />
      <Tabs.Screen name="coletar"
        options={{ title: t('abas.coletar'), tabBarLabel: t('abas.coletar') }} />
      <Tabs.Screen name="enviar"
        options={{ title: t('abas.enviar'), tabBarLabel: t('abas.enviar') }} />
      <Tabs.Screen name="ajustes"
        options={{ title: t('abas.ajustes'), tabBarLabel: t('abas.ajustes') }} />
    </Tabs>
  );
}
