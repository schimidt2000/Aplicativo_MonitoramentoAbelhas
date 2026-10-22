/**
 * "A data do celular está certa?" — o cartão da tela de resultado da coleta
 * quando a hora do celular não bate com o tempo que a colmeia contou (feature
 * 003, FR-011). Só desenha: quem decide o texto é `perguntaDeHora`, e quem
 * registra a resposta e acerta o relógio é quem passa `aoResponder`.
 *
 * Regras de campo (Princípio V): data e hora em destaque, no tamanho de número
 * de leitura; dois botões grandes (≥ 56 dp, 12 dp entre eles), um embaixo do
 * outro, sem gesto; estado com cor + ícone + palavra.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { t } from '@/core/i18n';
import { horaDoCelularEmDestaque, type PerguntaDeHora } from '@/core/coleta/mensagens';
import { IconeAlerta, IconeCheck } from './Icones';
import { alvo, cores, espaco, raio, tipo } from './tokens';

type Estado =
  | { fase: 'perguntando' }
  | { fase: 'respondendo'; resposta: 'sim' | 'nao' }
  | { fase: 'respondido'; texto: string; deuCerto: boolean };

export function PerguntaHora({ pergunta, agora, aoResponder }: {
  pergunta: PerguntaDeHora;
  /** Relógio do celular. A hora mostrada é a de AGORA, não a da coleta. */
  agora: () => number;
  /** Registra a resposta e devolve o texto do que aconteceu. Não lança. */
  aoResponder: (resposta: 'sim' | 'nao') => Promise<{ texto: string; deuCerto: boolean }>;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'perguntando' });
  const [mostrada, setMostrada] = useState(() => agora());
  const [falha, setFalha] = useState<string | null>(null);

  // A pergunta é sobre o relógio do celular AGORA: atualiza enquanto está na tela.
  useEffect(() => {
    if (estado.fase !== 'perguntando') return undefined;
    const id = setInterval(() => setMostrada(agora()), 20_000);
    return () => clearInterval(id);
  }, [agora, estado.fase]);

  async function responder(resposta: 'sim' | 'nao') {
    if (estado.fase !== 'perguntando') return;
    setEstado({ fase: 'respondendo', resposta });
    let r: { texto: string; deuCerto: boolean };
    try {
      r = await aoResponder(resposta);
    } catch {
      r = { texto: t('hora.conflito.nao_gravou'), deuCerto: false };
    }
    // Retorno redundante: texto e vibração (Princípio V).
    try { Vibration.vibrate(r.deuCerto ? 60 : [0, 80, 80, 80]); } catch { /* sem vibração */ }
    // Não gravou: a pergunta continua, com o aviso, para tentar de novo.
    setFalha(r.deuCerto ? null : r.texto);
    setEstado(r.deuCerto ? { fase: 'respondido', ...r } : { fase: 'perguntando' });
  }

  if (estado.fase === 'respondido') {
    return (
      <View style={s.cartao} accessibilityLiveRegion="polite">
        <View style={s.rotulo}>
          <IconeCheck cor={cores.ok} tamanho={22} />
          <Text style={[s.rotuloTexto, { color: cores.ok }]}>{t('hora.conflito.titulo')}</Text>
        </View>
        <Text style={s.detalhe}>{estado.texto}</Text>
      </View>
    );
  }

  const ocupado = estado.fase === 'respondendo';
  const textoOcupado = estado.fase === 'respondendo' && estado.resposta === 'nao'
    ? t('hora.conflito.guardando') : t('hora.conflito.respondendo');
  return (
    <View style={s.cartao} accessibilityRole="alert">
      <View style={s.rotulo}>
        <IconeAlerta cor={cores.atencao} tamanho={22} />
        <Text style={[s.rotuloTexto, { color: cores.atencao }]}>{t('hora.conflito.rotulo')}</Text>
      </View>
      <Text style={s.titulo}>{pergunta.titulo}</Text>
      <Text style={s.detalhe}>{pergunta.detalhe}</Text>

      <Text style={s.detalhe}>{pergunta.rotuloDaHora}</Text>
      <Text style={s.hora} accessibilityRole="text">{horaDoCelularEmDestaque(mostrada)}</Text>
      <Text style={s.perguntaTexto}>{pergunta.pergunta}</Text>

      {falha && <Text style={s.falha}>{falha}</Text>}

      {ocupado ? (
        <View style={s.ocupado}>
          <ActivityIndicator color={cores.acento} accessibilityLabel={textoOcupado} />
          <Text style={s.detalhe}>{textoOcupado}</Text>
        </View>
      ) : (
        <View style={s.botoes}>
          <Pressable style={s.sim} onPress={() => responder('sim')} accessibilityRole="button">
            <Text style={s.simTexto}>{t('hora.conflito.sim')}</Text>
          </Pressable>
          <Pressable style={s.nao} onPress={() => responder('nao')} accessibilityRole="button">
            <Text style={s.naoTexto}>{t('hora.conflito.nao')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { backgroundColor: cores.superficie, borderRadius: raio.md, borderWidth: 2,
    borderColor: cores.atencao, padding: espaco.lg, gap: espaco.sm },
  rotulo: { flexDirection: 'row', alignItems: 'center', gap: espaco.xs + 2 },
  rotuloTexto: { fontSize: tipo.rotulo, fontWeight: '700' },
  titulo: { fontSize: tipo.titulo, fontWeight: '700', color: cores.texto },
  detalhe: { fontSize: tipo.corpo, color: cores.texto, lineHeight: 22 },
  // Número de leitura: ≥ 32 sp, algarismos tabulares (Princípio V).
  hora: { fontSize: tipo.leitura, fontWeight: '700', color: cores.texto,
    fontVariant: ['tabular-nums'], textAlign: 'center', marginVertical: espaco.xs },
  perguntaTexto: { fontSize: tipo.corpo + 2, fontWeight: '700', color: cores.texto },
  falha: { fontSize: tipo.corpo, color: cores.perigo, fontWeight: '600' },
  ocupado: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    minHeight: alvo.minimo },
  botoes: { gap: alvo.espacamento, marginTop: espaco.sm },
  sim: { minHeight: alvo.minimo + 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, backgroundColor: cores.acento, paddingHorizontal: espaco.md },
  simTexto: { fontSize: tipo.corpo + 2, color: '#FFFFFF', fontWeight: '700' },
  nao: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, borderWidth: 2, borderColor: cores.texto,
    backgroundColor: cores.superficie, paddingHorizontal: espaco.md },
  naoTexto: { fontSize: tipo.corpo + 2, color: cores.texto, fontWeight: '700' },
});
