/**
 * Abre o banco (driver escolhido pelo Metro conforme a plataforma) e semeia as
 * colmeias de demonstração. Nenhuma chamada de rede em nenhum caminho.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { abrirBanco } from './db';
import type { SqlDb } from './types';
import { garantirApiario, garantirColmeia, garantirNode } from './repo';
import { NOS_DEMO } from '@/transports/mock';
import { semearHistorico } from './semente';
import { t } from '@/core/i18n';
import { cores, espaco, tipo } from '@/ui/tokens';

const Ctx = createContext<{ db: SqlDb; versao: number; recarregar: () => void } | null>(null);

export function useDb() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDb precisa estar dentro de <BancoProvider>');
  return v;
}

const APIARIO_ID = 'ap-1';

/**
 * Há quantos dias cada colmeia de demonstração foi coletada pela última vez.
 * Com o intervalo padrão de 15 dias isso produz, na ordem: em dia, coleta
 * atrasada e muito atrasada — os três níveis visíveis de uma vez.
 */
const ATRASO_DEMO: Record<string, number> = {
  A1B2C3D4E5F60002: 2,   // Colmeia 03 — em dia
  A1B2C3D4E5F60001: 21,  // Colmeia 07 — atrasada
  A1B2C3D4E5F60003: 38,  // Colmeia 11 — muito atrasada
};

export function BancoProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<SqlDb | null>(null);
  const [erro, setErro] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    abrirBanco()
      .then((d) => {
        if (!vivo) return;
        garantirApiario(d, APIARIO_ID, 'Meliponário Serra Verde');
        for (const n of NOS_DEMO) {
          const hiveId = `h-${n.deviceId.slice(-4)}`;
          garantirColmeia(d, hiveId, APIARIO_ID, n.nome);
          const nodeId = garantirNode(d, n.deviceId, hiveId, n.periodoS);
          // Cada colmeia abre num estágio diferente de atraso, para que a tela
          // já mostre os três casos que o apicultor encontra na vida real.
          const atraso = ATRASO_DEMO[n.deviceId];
          if (atraso !== undefined) {
            semearHistorico(d, nodeId, n, { dias: 12, coletadoHaDias: atraso });
          }
        }
        setDb(d);
      })
      // A mensagem técnica nunca chega à tela (Princípio V): só o que fazer.
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, []);

  if (erro) {
    return (
      <View style={s.centro}>
        <Text style={s.erroTitulo}>{t('banco.nao_abriu.titulo')}</Text>
        <Text style={s.erroTexto}>{t('banco.nao_abriu.detalhe')}</Text>
      </View>
    );
  }
  if (!db) {
    return (
      <View style={s.centro}>
        <ActivityIndicator color={cores.acento} accessibilityLabel={t('banco.abrindo')} />
        <Text style={s.carregando}>{t('banco.abrindo')}</Text>
      </View>
    );
  }
  return (
    <Ctx.Provider value={{ db, versao, recarregar: () => setVersao((v) => v + 1) }}>
      {children}
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: cores.fundo, padding: espaco.xl },
  carregando: { marginTop: espaco.md, fontSize: tipo.corpo, color: cores.textoFraco },
  erroTitulo: { fontSize: tipo.titulo, fontWeight: '700', color: cores.texto,
    marginBottom: espaco.sm, textAlign: 'center' },
  erroTexto: { fontSize: tipo.corpo, color: cores.textoFraco, textAlign: 'center' },
});
