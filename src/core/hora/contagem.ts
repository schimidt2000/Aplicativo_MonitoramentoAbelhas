/**
 * Hora das leituras de um nó em CONTAGEM (feature 005): a placa do firmware
 * de 2026-10-21 só grava a hora de início do arquivo e numera as medições a
 * partir de 0. A hora sai da conta que o próprio grupo do firmware pediu,
 *
 *     hora da medição k = início + k × intervalo,
 *
 * sempre ESTIMADA, e só quando a conferência contra a hora do fim da coleta
 * fecha. É a emenda da FR-016 da 003; as regras exatas são FR-015 a FR-019 da
 * 005 e D-507 do research.
 *
 * Puro, como `avaliar.ts`: entra o que está gravado, sai a faixa de hora de
 * cada trecho. A leitura gravada nunca muda; o resultado vira uma versão de
 * horas à parte (Princípio III).
 */
import { idDoSeq, inicioDoSeq } from '../decode/arquivo';
import {
  QUALIDADE,
  type ConferenciaDaContagem, type Faixa, type LeituraDeTempo, type Ligada,
  type MotivoHora, type Referencia, type SituacaoReferencia, type VereditoDaContagem,
} from './tipos';

/** O intervalo de produção do firmware (áudio 1: "o timestamp + 2 horas"). */
export const INTERVALO_PADRAO_S = 7200;

/**
 * Folga da conferência: 10 min ou 5 % do tempo decorrido, o que for maior.
 * PROVISÓRIA: cobre o tempo acordado de cada ciclo (o período real é sono +
 * acordado) e a deriva do oscilador em sono profundo, nenhum dos dois medido
 * ainda (docs/integracao-firmware.md). O preço é real e está declarado: num
 * arquivo longo, uma falta de energia ou medições fora do ritmo que somem
 * menos que a folga não aparecem na conta (research D-507).
 */
export const FOLGA_MINIMA_S = 600;
export const FOLGA_PROPORCAO = 0.05;

export interface ParametrosContagem {
  intervaloS: number;
  inicioDoProjetoMs: number;
}

/**
 * A conta de uma coleta que viu `medicoes` medições de um arquivo que começou
 * em `inicioS`, com o celular marcando `horaDaColetaMs`.
 *
 * `sobra` = hora da coleta − hora calculada da última medição. No ritmo, fica
 * em [0, intervalo): o botão acorda a placa antes da próxima medição. É a regra
 * do briefing de 2026-10-21: a última medição tem de cair até cerca de um
 * intervalo ANTES da coleta. A janela é exatamente essa, [0, intervalo], com a
 * folga dos dois lados; nada de "uma medição a mais ou a menos" de brinde.
 * Medição a mais (botão apertado sem coleta) empurra a sobra para baixo de 0;
 * medição a menos (falta de energia) para cima de um intervalo.
 */
export function conferirContagem(
  inicioS: number, medicoes: number, intervaloS: number, horaDaColetaMs: number,
): Pick<ConferenciaDaContagem, 'esperadas' | 'sobraS' | 'folgaS' | 'veredito'> {
  const coletaS = horaDaColetaMs / 1000;
  const decorridoS = coletaS - inicioS;
  const folgaS = Math.max(FOLGA_MINIMA_S, FOLGA_PROPORCAO * Math.abs(decorridoS));
  const esperadas = decorridoS < 0 ? 0 : Math.floor(decorridoS / intervaloS) + 1;
  const sobraS = coletaS - (inicioS + (medicoes - 1) * intervaloS);
  let veredito: VereditoDaContagem;
  if (decorridoS < -folgaS) veredito = 'inicio-implausivel';
  else if (sobraS < -folgaS) veredito = 'a-mais';
  else if (sobraS > intervaloS + folgaS) veredito = 'a-menos';
  else veredito = 'fecha';
  return { esperadas, sobraS, folgaS, veredito };
}

const MOTIVO_DO_VEREDITO: Record<Exclude<VereditoDaContagem, 'fecha'>, MotivoHora> = {
  'a-mais': 'contagem-a-mais',
  'a-menos': 'contagem-a-menos',
  'inicio-implausivel': 'inicio-implausivel',
};

interface Bloco {
  inicioS: number;
  /** Índices em `leituras`. */
  de: number;
  ate: number;
}

function blocos(leituras: LeituraDeTempo[]): Bloco[] {
  const saida: Bloco[] = [];
  for (let i = 0; i < leituras.length; i++) {
    const inicioS = inicioDoSeq(leituras[i].seq);
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.inicioS === inicioS) ultimo.ate = i;
    else saida.push({ inicioS, de: i, ate: i });
  }
  return saida;
}

/**
 * @param leituras só as de modo `contagem`, ordenadas por `seq`.
 * @param referencias só as de modo `contagem`.
 */
export function avaliarContagem(
  leituras: LeituraDeTempo[], referencias: Referencia[], p: ParametrosContagem,
): {
  ligadas: Ligada[]; faixas: Faixa[]; referencias: Map<number, SituacaoReferencia>;
  contagens: ConferenciaDaContagem[];
} {
  const situacao = new Map<number, SituacaoReferencia>();
  const contagens: ConferenciaDaContagem[] = [];
  const ligadas: Ligada[] = [];
  const faixas: Faixa[] = [];

  // Coletas plausíveis, por arquivo. O acerto (a hora mandada à placa) é só
  // proveniência: ele é o INÍCIO do próximo arquivo, e não confere nada.
  const coletasPorInicio = new Map<number, Array<{ ref: Referencia; n: number }>>();
  for (const ref of referencias) {
    const plausivel = ref.aceita && Number.isFinite(ref.tUtcMs) && ref.tUtcMs >= p.inicioDoProjetoMs;
    if (ref.origem !== 'coleta' || ref.seqRef === null) {
      situacao.set(ref.id, { estado: ref.aceita ? 'sem-ligada' : 'rejeitada', ligada: null });
      continue;
    }
    if (!plausivel) {
      situacao.set(ref.id, { estado: 'rejeitada', ligada: null });
      continue;
    }
    if (ref.revogada) {
      situacao.set(ref.id, { estado: 'revogada', ligada: null });
      continue;
    }
    const inicioS = inicioDoSeq(ref.seqRef);
    const lista = coletasPorInicio.get(inicioS) ?? [];
    lista.push({ ref, n: idDoSeq(ref.seqRef) + 1 });
    coletasPorInicio.set(inicioS, lista);
  }

  // O intervalo de um arquivo: o do FILE_INFO mais recente que o informou; senão o do cadastro.
  const intervaloDe = (lista: Array<{ ref: Referencia }>) => {
    for (let k = lista.length - 1; k >= 0; k--) {
      const s = lista[k].ref.periodoS;
      if (s !== null && s !== undefined && s > 0) return s;
    }
    return p.intervaloS;
  };

  // Conferências de arquivos que não têm leitura gravada (arquivo sem medições,
  // ou leituras de outro nó) também são registradas: a tela precisa delas.
  for (const [inicioS, lista] of coletasPorInicio) {
    lista.sort((a, b) => a.n - b.n || a.ref.id - b.ref.id);
    const intervaloS = intervaloDe(lista);
    for (const { ref, n } of lista) {
      const c = conferirContagem(inicioS, n, intervaloS, ref.tUtcMs);
      const projetoOk = inicioS * 1000 >= p.inicioDoProjetoMs;
      contagens.push({
        refId: ref.id, inicioS, medicoes: n, intervaloS, horaDaColetaMs: ref.tUtcMs, ...c,
        veredito: projetoOk ? c.veredito : 'inicio-implausivel',
      });
      situacao.set(ref.id, {
        estado: projetoOk && c.veredito === 'fecha' ? 'conferida' : 'nao-conferida',
        ligada: `c:${inicioS}`,
      });
    }
  }
  const conferenciaDe = new Map(contagens.map((c) => [c.refId, c]));

  for (const b of blocos(leituras)) {
    const primeira = leituras[b.de].seq;
    ligadas.push({
      id: primeira, seqIni: primeira, seqFim: leituras[b.ate].seq, modo: 'contagem',
      numero: null, quantidade: b.ate - b.de + 1,
    });
    const faixa = (de: number, ate: number, base: Partial<Faixa>): Faixa => ({
      seqIni: leituras[de].seq, seqFim: leituras[ate].seq, ligada: primeira,
      refId: null, refTNode: 0, refTUtcMs: null,
      qualidade: QUALIDADE.desconhecida, motivo: 'contagem-sem-conferencia', ...base,
    });

    // Início antes do projeto: nenhuma conta salva o arquivo inteiro.
    if (b.inicioS * 1000 < p.inicioDoProjetoMs) {
      faixas.push(faixa(b.de, b.ate, { motivo: 'inicio-implausivel' }));
      continue;
    }

    const lista = coletasPorInicio.get(b.inicioS) ?? [];
    const intervaloS = intervaloDe(lista);
    let i = b.de;
    // Cada trecho vale pela PRIMEIRA coleta plausível que o viu.
    for (const { ref, n } of lista) {
      let ate = i - 1;
      while (ate + 1 <= b.ate && leituras[ate + 1].tNode <= n - 1) ate += 1;
      if (ate < i) continue;
      const c = conferenciaDe.get(ref.id)!;
      faixas.push(c.veredito === 'fecha'
        ? faixa(i, ate, {
          refId: ref.id, refTUtcMs: b.inicioS * 1000, qualidade: QUALIDADE.estimada,
          motivo: 'contagem-conferida', msPorUnidade: intervaloS * 1000,
        })
        : faixa(i, ate, { refId: ref.id, motivo: MOTIVO_DO_VEREDITO[c.veredito] }));
      i = ate + 1;
    }
    if (i <= b.ate) faixas.push(faixa(i, b.ate, {}));
  }

  return { ligadas, faixas, referencias: situacao, contagens };
}
