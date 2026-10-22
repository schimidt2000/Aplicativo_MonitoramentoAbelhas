/**
 * A tela de resultado de uma coleta: manchete, avisos (cor + ícone + palavra) e
 * os dois botões no rodapé fixo. Extraída de `(tabs)/coletar.tsx` sem mudar o
 * comportamento, para a coleta pelo cabo (feature 005, FR-028) mostrar os
 * MESMOS avisos e a mesma manchete da coleta das colmeias.
 *
 * Só desenha: quem decide o que dizer é `core/coleta/mensagens.ts`.
 */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { t, tp } from '@/core/i18n';
import {
  montarAvisos, perguntaDeHora, resumir, type PerguntaDeHora,
} from '@/core/coleta/mensagens';
import type { ItemDeAviso, ResultadoColeta } from '@/core/coleta/resultado';
import { IconeAlerta, IconeCheck } from './Icones';
import { PerguntaHora } from './PerguntaHora';
import { notaDoProblema, tituloDoProblema } from './retorno';
import { alvo, cores, espaco, raio, tipo } from './tokens';

export function ResultadoDaColeta({
  resultado, aoResponderHora, agora, aoTentarDeNovo, aoVerColmeias, aoAbrirDiagnostico, topo,
}: {
  resultado: ResultadoColeta;
  /** Só a coleta das colmeias pergunta a data (feature 003); o cabo não. */
  aoResponderHora?: (p: PerguntaDeHora, r: 'sim' | 'nao') => Promise<{ texto: string; deuCerto: boolean }>;
  agora?: () => number;
  aoTentarDeNovo: () => void;
  aoVerColmeias: () => void;
  aoAbrirDiagnostico?: () => void;
  /** Algo fixo acima do resultado (o rótulo da placa simulada). */
  topo?: ReactNode;
}) {
  const resumo = resumir(resultado);
  const avisos = montarAvisos(resultado);
  const pergunta = aoResponderHora ? perguntaDeHora(resultado) : null;
  const deuCerto = resumo.desfecho === 'sucesso';

  return (
    <View style={s.telaResultado}>
      {topo}
      {/*
        A lista de avisos pode ter várias colmeias: ela rola, e os botões ficam
        num rodapé fixo, no terço inferior, alcançáveis com o polegar (Princípio V).
      */}
      <ScrollView style={s.rolagem} contentContainerStyle={s.resultado}>
        {deuCerto ? (
          <Sucesso resumo={resumo} />
        ) : (
          <View style={s.cabecalhoProblema}>
            <IconeAlerta cor={cores.perigo} tamanho={34} />
            <Text style={s.tituloProblema} accessibilityRole="header">
              {tituloDoProblema(resumo)}
            </Text>
            <Text style={s.nota}>{notaDoProblema(resumo)}</Text>
          </View>
        )}

        {/* Só aparece quando há algo que o apicultor pode fazer (FR-020). */}
        {pergunta && aoResponderHora && (
          <PerguntaHora key={pergunta.alvos.map((a) => a.refId).join(',')}
            pergunta={pergunta} agora={agora ?? Date.now}
            aoResponder={(r) => aoResponderHora(pergunta, r)} />
        )}

        {avisos.length > 0 && (
          <View style={s.lista}>
            {avisos.map((item) => <BlocoDeAviso key={item.id} item={item} />)}
          </View>
        )}

        {/*
          O diagnóstico fica no fim da lista, logo abaixo do aviso que o sugere,
          e não no rodapé: três botões fixos com fonte a 200% não deixariam
          espaço para ler os avisos.
        */}
        {!deuCerto && resumo.sugereDiagnostico && aoAbrirDiagnostico && (
          <Pressable style={s.botaoSecundario} onPress={aoAbrirDiagnostico}
            accessibilityRole="button">
            <Text style={s.botaoSecundarioTexto}>{t('coleta.botao.diagnostico')}</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={s.rodape}>
        <Pressable style={s.botaoRodape} accessibilityRole="button"
          onPress={deuCerto ? aoVerColmeias : aoTentarDeNovo}>
          <Text style={s.botaoTexto}>
            {t(deuCerto ? 'coleta.botao.ver_colmeias' : 'coleta.botao.tentar_de_novo')}
          </Text>
        </Pressable>
        <Pressable style={s.botaoSecundarioRodape} accessibilityRole="button"
          onPress={deuCerto ? aoTentarDeNovo : aoVerColmeias}>
          <Text style={s.botaoSecundarioTexto}>
            {t(deuCerto ? 'coleta.botao.coletar_de_novo' : 'coleta.botao.ver_colmeias')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Sucesso({ resumo }: { resumo: ReturnType<typeof resumir> }) {
  const nadaNovo = resumo.salvas === 0;
  const repetidas = resumo.recebidas - resumo.salvas;

  return (
    <View style={s.cabecalhoSucesso}>
      <View style={s.linhaSucesso}>
        <IconeCheck cor={cores.ok} tamanho={34} />
        <Text style={s.ok} accessibilityRole="header">
          {nadaNovo ? t('coleta.sucesso.nada_novo.titulo') : tp('coleta.sucesso.salvas', resumo.salvas)}
        </Text>
      </View>

      {/*
        Coletar de novo sem dado novo é sucesso, não falha: é a idempotência
        funcionando (FR-008). "0 leituras salvas" leria como defeito.
      */}
      {nadaNovo ? (
        <Text style={s.nota}>
          {resumo.recebidas > 0
            ? tp('coleta.sucesso.nada_novo.conferidas', resumo.recebidas)
            : t('coleta.sucesso.nada_novo.vazio')}
        </Text>
      ) : (
        <>
          {repetidas > 0 && <Text style={s.nota}>{tp('coleta.sucesso.repetidas', repetidas)}</Text>}
          {resumo.dias > 0 && <Text style={s.nota}>{tp('coleta.sucesso.dias', resumo.dias)}</Text>}
          <Text style={s.notaEnvio}>{t('coleta.sucesso.envio')}</Text>
        </>
      )}

      {resumo.relogiosAcertados > 0 && (
        <Text style={s.nota}>{tp('coleta.relogio.acertado', resumo.relogiosAcertados)}</Text>
      )}
      {/* Coleta pelo cabo (005): a placa recomeçou, e de quando a quando vão as horas. */}
      {resumo.notas.map((n) => <Text key={n} style={s.nota}>{n}</Text>)}
    </View>
  );
}

/**
 * Cor + ícone + palavra (Princípio V): o estado nunca depende só da cor. A
 * barra lateral é a cor, o triângulo é o ícone, e "Problema"/"Aviso" é a palavra.
 */
export function BlocoDeAviso({ item }: { item: ItemDeAviso }) {
  const ehProblema = item.gravidade === 'problema';
  const cor = ehProblema ? cores.perigo : cores.atencao;
  const rotulo = t(ehProblema ? 'coleta.rotulo.problema' : 'coleta.rotulo.aviso');

  // Um bloco só para o leitor de tela: "Problema. <título>. <detalhe>" numa
  // parada, em vez de três paradas soltas.
  return (
    <View style={s.bloco} accessible accessibilityRole="alert"
      accessibilityLabel={t('coleta.bloco.rotulo_acessivel', {
        rotulo, titulo: item.titulo, detalhe: item.detalhe,
      })}>
      <View style={[s.blocoBarra, { backgroundColor: cor }]} />
      <View style={s.blocoCorpo}>
        <View style={s.blocoRotulo}>
          <IconeAlerta cor={cor} tamanho={20} />
          <Text style={[s.blocoRotuloTexto, { color: cor }]}>{rotulo}</Text>
        </View>
        <Text style={s.blocoTitulo}>{item.titulo}</Text>
        <Text style={s.blocoDetalhe}>{item.detalhe}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { flexDirection: 'row', backgroundColor: cores.superficie,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.linha, overflow: 'hidden' },
  blocoBarra: { width: 6 },
  blocoCorpo: { flex: 1, padding: espaco.md, gap: espaco.xs },
  // É a instrução do que fazer: corpo, nunca abaixo de 16 sp (Princípio V).
  blocoDetalhe: { fontSize: tipo.corpo, color: cores.textoFraco, lineHeight: 22 },

  blocoRotulo: { flexDirection: 'row', alignItems: 'center', gap: espaco.xs + 2 },
  blocoRotuloTexto: { fontSize: tipo.rotulo, fontWeight: '700' },
  blocoTitulo: { fontSize: tipo.corpo + 1, fontWeight: '700', color: cores.texto },
  botaoRodape: { minHeight: alvo.minimo + 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, backgroundColor: cores.acento },
  // A borda é o único limite do botão secundário: precisa de >= 3:1 (Princípio V).
  botaoSecundario: { minHeight: alvo.minimo, alignItems: 'center', justifyContent: 'center',
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.bordaControle,
    backgroundColor: cores.superficie, marginTop: espaco.md },
  botaoSecundarioRodape: { minHeight: alvo.minimo, alignItems: 'center',
    justifyContent: 'center', borderRadius: raio.md, borderWidth: 1,
    borderColor: cores.bordaControle, backgroundColor: cores.superficie },
  botaoSecundarioTexto: { fontSize: tipo.corpo, color: cores.textoFraco, fontWeight: '600' },

  botaoTexto: { fontSize: tipo.corpo + 2, color: '#FFFFFF', fontWeight: '700' },
  cabecalhoProblema: { alignItems: 'center', gap: espaco.xs },
  cabecalhoSucesso: { alignItems: 'center', gap: espaco.xs },
  // Ícone sobre o título (como no cabeçalho de problema): lado a lado, o título
  // que quebra em duas linhas deixava o ícone desalinhado.
  linhaSucesso: { alignItems: 'center', gap: espaco.xs },
  lista: { gap: espaco.md, marginTop: espaco.sm },
  nota: { fontSize: tipo.corpo, color: cores.textoFraco, textAlign: 'center' },
  notaEnvio: { fontSize: tipo.corpo, color: cores.neutro, textAlign: 'center',
    marginTop: espaco.sm },
  ok: { fontSize: tipo.destaque - 6, fontWeight: '700', color: cores.ok,
    fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'center' },
  resultado: { flexGrow: 1, padding: espaco.xl, justifyContent: 'center', gap: espaco.md },
  rodape: { paddingHorizontal: espaco.xl, paddingVertical: espaco.lg, gap: alvo.espacamento,
    borderTopWidth: 1, borderTopColor: cores.linha, backgroundColor: cores.fundo },
  rolagem: { flex: 1 },
  telaResultado: { flex: 1 },
  tituloProblema: { fontSize: tipo.titulo + 2, fontWeight: '700', color: cores.texto,
    textAlign: 'center' },

});
