/**
 * Ajustes. Só o que o apicultor precisa decidir — nada de preferência técnica.
 *
 * O intervalo de coleta não dispara notificação do sistema: o aviso aparece
 * dentro do aplicativo, na lista de colmeias. Notificação agendada exige
 * biblioteca nativa, não funciona na web e é morta de forma agressiva pelas
 * ROMs dos aparelhos que são justamente o nosso alvo.
 *
 * Todo texto vem do módulo de i18n.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { useDb } from '@/data/provider';
import { gravarConfig, lerConfig } from '@/data/repo';
import { useModoSol } from '@/ui/ModoSol';
import { alvo, cores, espaco, raio, tipo } from '@/ui/tokens';
import {
  CHAVE_DEMO_FALHA, CHAVE_INTERVALO, INTERVALO_PADRAO, OPCOES_DEMO_FALHA,
  OPCOES_INTERVALO as OPCOES, ehFalhaDemo, type FalhaDemo,
} from '@/core/preferencias';
import { t, tp } from '@/core/i18n';
import { ROTULO_DEMO } from '@/ui/demo';
import { TRANSPORTE_ATIVO } from '@/transports';

export default function Ajustes() {
  const { db } = useDb();
  const { sol, alternar } = useModoSol();
  const [intervalo, setIntervalo] = useState(INTERVALO_PADRAO);
  const [demo, setDemo] = useState<FalhaDemo>('nenhuma');

  useFocusEffect(
    useCallback(() => {
      setIntervalo(Number(lerConfig(db, CHAVE_INTERVALO, String(INTERVALO_PADRAO))));
      const salva = lerConfig(db, CHAVE_DEMO_FALHA, 'nenhuma');
      setDemo(ehFalhaDemo(salva) ? salva : 'nenhuma');
    }, [db]),
  );

  function escolherDemo(f: FalhaDemo) {
    gravarConfig(db, CHAVE_DEMO_FALHA, f);
    setDemo(f);
  }

  function escolher(dias: number) {
    gravarConfig(db, CHAVE_INTERVALO, String(dias));
    setIntervalo(dias);
  }

  return (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo}>
      <View style={s.bloco}>
        <Text style={s.titulo}>{t('ajustes.intervalo.titulo')}</Text>
        <Text style={s.ajuda}>{t('ajustes.intervalo.ajuda')}</Text>

        {/* radiogroup: o leitor de tela diz "1 de 4" e que só uma vale. */}
        <View style={s.opcoes} accessibilityRole="radiogroup"
          accessibilityLabel={t('ajustes.intervalo.titulo')}>
          {OPCOES.map((d) => {
            const ativo = d === intervalo;
            return (
              <Pressable key={d} onPress={() => escolher(d)}
                style={StyleSheet.flatten([s.opcao, ativo && s.opcaoAtiva])}
                accessibilityRole="radio"
                accessibilityState={{ checked: ativo }}
              >
                <Text style={[s.opcaoTexto, ativo && s.opcaoTextoAtivo]}>
                  {tp('ajustes.intervalo.opcao', d)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[s.nota, s.forte]}>{tp('ajustes.intervalo.escolhido', intervalo)}</Text>
      </View>

      <View style={s.bloco}>
        <Text style={s.titulo}>{t('ajustes.sol.titulo')}</Text>
        <Text style={s.ajuda}>{t('ajustes.sol.ajuda')}</Text>
        <Pressable onPress={alternar}
          accessibilityRole="switch"
          accessibilityState={{ checked: sol }}
          style={StyleSheet.flatten([s.botao, sol && s.botaoAtivo])}>
          <Text style={[s.botaoTexto, sol && s.botaoTextoAtivo]}>
            {t(sol ? 'ajustes.sol.ligado' : 'ajustes.sol.ligar')}
          </Text>
        </Pressable>
      </View>

      {/* Some sozinho quando o aplicativo passar a usar nós sensores de verdade. */}
      {TRANSPORTE_ATIVO === 'mock' && (
        <View style={s.bloco}>
          <Text style={s.titulo}>{t('ajustes.demo.titulo')}</Text>
          <Text style={s.ajuda}>{t('ajustes.demo.ajuda')}</Text>
          <View style={s.lista} accessibilityRole="radiogroup"
            accessibilityLabel={t('ajustes.demo.titulo')}>
            {OPCOES_DEMO_FALHA.map((f) => {
              const ativo = f === demo;
              return (
                <Pressable key={f} onPress={() => escolherDemo(f)}
                  style={StyleSheet.flatten([s.linhaOpcao, ativo && s.opcaoAtiva])}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: ativo }}
                >
                  <Text style={[s.linhaOpcaoTexto, ativo && s.opcaoTextoAtivo]}>
                    {t(ROTULO_DEMO[f])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={s.bloco}>
        <Text style={s.titulo}>{t('ajustes.diagnostico.titulo')}</Text>
        <Text style={s.ajuda}>{t('ajustes.diagnostico.ajuda')}</Text>
        <Link href="/diagnostico" asChild>
          <Pressable style={s.botao} accessibilityRole="button">
            <Text style={s.botaoTexto}>{t('coleta.botao.diagnostico')}</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.lg, paddingBottom: espaco.xxl },
  bloco: { backgroundColor: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderColor: cores.linha, padding: espaco.md, gap: espaco.sm },
  titulo: { fontSize: tipo.corpo + 1, fontWeight: '700', color: cores.texto },
  ajuda: { fontSize: tipo.rotulo, color: cores.textoFraco, lineHeight: 20 },
  // 12 dp entre alvos de toque (Princípio V): com luva, 8 dp vira toque no vizinho.
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: alvo.espacamento,
    marginTop: espaco.xs },
  opcao: { minHeight: alvo.minimo, minWidth: 88, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: espaco.md,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.bordaControle,
    backgroundColor: cores.fundo },
  opcaoAtiva: { borderColor: cores.acento, borderWidth: 2, backgroundColor: '#FDF6EC' },
  opcaoTexto: { fontSize: tipo.corpo, fontWeight: '700', color: cores.textoFraco },
  opcaoTextoAtivo: { color: cores.acento },
  lista: { gap: alvo.espacamento, marginTop: espaco.xs },
  linhaOpcao: { minHeight: alvo.minimo, justifyContent: 'center',
    paddingHorizontal: espaco.md, paddingVertical: espaco.sm,
    borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.bordaControle, backgroundColor: cores.fundo },
  linhaOpcaoTexto: { fontSize: tipo.corpo, fontWeight: '600', color: cores.textoFraco },
  nota: { fontSize: tipo.rotulo, color: cores.textoFraco },
  forte: { color: cores.texto, fontWeight: '700' },
  botao: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: espaco.md, borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.bordaControle, backgroundColor: cores.fundo, marginTop: espaco.xs },
  botaoAtivo: { borderColor: cores.acento, borderWidth: 2 },
  botaoTexto: { fontSize: tipo.corpo, fontWeight: '600', color: cores.textoFraco },
  botaoTextoAtivo: { color: cores.acento },
});
