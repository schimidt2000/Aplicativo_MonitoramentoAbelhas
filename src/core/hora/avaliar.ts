/**
 * Avaliação da hora das leituras de UM nó (feature 003).
 *
 * Entra o que o nó mediu (seq, contador, número da ligada, modo) e as
 * referências de hora; sai, para cada faixa de leituras, a conta da hora, a
 * qualidade e o motivo. É uma função pura: roda igual no fim da coleta, na
 * migração (FR-015) e depois de uma revogação, e o resultado vira uma "versão
 * de horas" à parte — a leitura gravada nunca muda (Princípio III, FR-014).
 *
 * A regra de ouro (FR-004): na dúvida, sem hora. Errar para "sem hora" é
 * aceitável; errar para "hora certa" não é.
 */
import { TOLERANCIA_CONFERENCIA_BASE_MS, toleranciaDaConferenciaMs } from '../relogio';
import { INTERVALO_PADRAO_S, avaliarContagem } from './contagem';
import {
  QUALIDADE,
  type AvaliacaoDasHoras, type EstadoReferencia, type Faixa, type LeituraDeTempo,
  type Ligada, type ModoRelogio, type MotivoHora, type ParametrosHora, type Qualidade,
  type Referencia, type SituacaoReferencia,
} from './tipos';

const modoDe = (m: ModoRelogio | null): ModoRelogio => m ?? 'uptime';

/**
 * A leitura `atual` começa uma ligada nova?
 *
 *  - número da ligada informado nas duas e diferente (FR-001);
 *  - o contador NÃO cresceu (FR-002). `≤`, e não `<`: duas leituras distintas
 *    não podem ter o mesmo contador. Vale também com o mesmo número de ligada:
 *    aí é estouro do contador, e o lado seguro é tratar como ligada nova (FR-004);
 *  - o modo de tempo mudou, o que só acontece com firmware novo, que reinicia.
 */
export function iniciaLigada(anterior: LeituraDeTempo, atual: LeituraDeTempo): boolean {
  if (modoDe(anterior.modo) !== modoDe(atual.modo)) return true;
  if (anterior.ligada !== null && atual.ligada !== null && anterior.ligada !== atual.ligada) {
    return true;
  }
  // Sem noção de tempo, o contador não significa nada: não serve para achar reinício.
  if (modoDe(atual.modo) === 'none') return false;
  return atual.tNode <= anterior.tNode;
}

export function segmentarLigadas(leituras: LeituraDeTempo[]): {
  ligadas: Ligada[]; ligadaDoIndice: Int32Array;
} {
  const ligadas: Ligada[] = [];
  const ligadaDoIndice = new Int32Array(leituras.length);
  for (let i = 0; i < leituras.length; i++) {
    const l = leituras[i];
    if (i === 0 || iniciaLigada(leituras[i - 1], l)) {
      ligadas.push({
        id: l.seq, seqIni: l.seq, seqFim: l.seq, modo: modoDe(l.modo),
        numero: l.ligada, quantidade: 0,
      });
    }
    const atual = ligadas[ligadas.length - 1];
    atual.seqFim = l.seq;
    atual.quantidade += 1;
    if (atual.numero !== l.ligada) atual.numero = null;
    ligadaDoIndice[i] = ligadas.length - 1;
  }
  return { ligadas, ligadaDoIndice };
}

/** Índice da leitura com este `seq`, ou -1. As leituras estão ordenadas por `seq`. */
function indiceDoSeq(leituras: LeituraDeTempo[], seq: number): number {
  let lo = 0;
  let hi = leituras.length - 1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    const s = leituras[meio].seq;
    if (s === seq) return meio;
    if (s < seq) lo = meio + 1;
    else hi = meio - 1;
  }
  return -1;
}

/** Índice da última leitura com `seq` ≤ `seq`, ou -1. */
function ultimoAte(leituras: LeituraDeTempo[], seq: number): number {
  let lo = 0;
  let hi = leituras.length - 1;
  let achou = -1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (leituras[meio].seq <= seq) { achou = meio; lo = meio + 1; } else hi = meio - 1;
  }
  return achou;
}

/**
 * O contador da referência cabe no trecho `lig` na posição de `seqRef`? A
 * leitura de antes tem contador menor ou igual, a de depois maior ou igual.
 */
function cabeNoTrecho(ref: Referencia, seqRef: number, lig: Ligada, leituras: LeituraDeTempo[]): boolean {
  const j = ultimoAte(leituras, seqRef);
  const antes = j !== -1 && leituras[j].seq >= lig.seqIni && leituras[j].seq <= lig.seqFim
    ? leituras[j] : null;
  const k = j + 1;
  const depois = k < leituras.length && leituras[k].seq >= lig.seqIni && leituras[k].seq <= lig.seqFim
    ? leituras[k] : null;
  return (antes === null || ref.tNode >= antes.tNode) && (depois === null || depois.tNode >= ref.tNode);
}

const chaveDaLigada = (l: Ligada) => `s:${l.id}`;

/**
 * Posição de uma ligada na história do nó, para conferir a ordem entre
 * ligadas. `n:` (número informado, ainda sem leituras) não tem posição.
 */
function posicao(chave: string): number | null {
  const n = Number(chave.slice(2));
  if (chave.startsWith('s:')) return n;
  if (chave.startsWith('p:')) return n + 0.5;
  return null;
}

/**
 * A que ligada pertence a referência (D-305). Devolve a chave, ou null se não
 * dá para saber — e aí ela não serve para calcular hora nenhuma (FR-004).
 */
function atribuir(
  ref: Referencia,
  leituras: LeituraDeTempo[],
  ligadas: Ligada[],
  ligadaDoIndice: Int32Array,
  periodoDoCadastroS: number,
): string | null {
  const modo = modoDe(ref.modo);
  // Distância máxima entre a leitura mais nova e o contador da referência sem
  // um reinício no meio. O período é o que o nó disse NA SESSÃO: um nó de 1 h
  // cadastrado com o padrão de 15 min teria metade das coletas "sem ligada".
  const margemS = 2 * (ref.periodoS ?? periodoDoCadastroS) + 60;

  // Com o número da ligada (FR-001). Só vale se as leituras também trazem o
  // número: se só a sessão o trouxe, não há com o que casar, e vale o contador.
  if (ref.ligada !== null && (ligadas.length === 0 || ligadas.some((l) => l.numero !== null))) {
    const candidatas = ligadas.filter((l) => l.numero === ref.ligada && l.modo === modo);
    if (candidatas.length === 0) return `n:${ref.ligada}`;
    // A mesma ligada pode ter mais de um trecho: o contador estoura (≈49,7 dias)
    // sem a placa religar, e o trecho novo começa do zero. O trecho certo é o da
    // leitura `seqRef`, decidido pelo contador, como sem número. Pegar o último
    // trecho do número daria a uma coleta de antes do estouro as leituras de
    // depois dele: hora errada, e um conflito falso com a coleta seguinte.
    const i = ref.seqRef === null ? -1 : indiceDoSeq(leituras, ref.seqRef);
    if (i !== -1 && ligadas[ligadaDoIndice[i]].numero === ref.ligada) {
      return pelaLeitura(ref, i, leituras, ligadas, ligadaDoIndice, null);
    }
    if (i === -1 && ref.provisoria) {
      // Antes da transferência: a mesma hipótese de sem número, no último trecho.
      const ultima = candidatas[candidatas.length - 1];
      const fim = indiceDoSeq(leituras, ultima.seqFim);
      return ref.tNode > leituras[fim].tNode ? chaveDaLigada(ultima) : `p:${ultima.seqFim}`;
    }
    // Sem a leitura `seqRef` para decidir o trecho: só um trecho, é ele; mais
    // de um, na dúvida nenhum (FR-004).
    if (candidatas.length !== 1) return null;
    const unico = candidatas[0];
    if (i === -1 && ref.seqRef !== null && unico.modo !== 'rtc'
      && !cabeNoTrecho(ref, ref.seqRef, unico, leituras)) {
      // A leitura `seqRef` não chegou (transferência que caiu), e o contador da
      // referência não cabe entre as leituras vizinhas do trecho: é um estouro
      // depois delas, de um trecho que ainda não chegou (FR-003, FR-004).
      return null;
    }
    return chaveDaLigada(unico);
  }
  if (ref.seqRef === null) return null;

  const i = indiceDoSeq(leituras, ref.seqRef);
  if (i === -1) {
    if (!ref.provisoria) return null;
    // Antes da transferência: a leitura `seqRef` ainda não chegou. Hipótese pela
    // última gravada: contador maior é a mesma ligada; menor, ligada nova.
    if (leituras.length === 0) return 'p:0';
    const ultima = leituras[leituras.length - 1];
    const lig = ligadas[ligadaDoIndice[leituras.length - 1]];
    if (lig.modo !== modo || modo === 'none') return `p:${ultima.seq}`;
    return ref.tNode > ultima.tNode ? chaveDaLigada(lig) : `p:${ultima.seq}`;
  }

  return pelaLeitura(ref, i, leituras, ligadas, ligadaDoIndice, margemS);
}

/**
 * A ligada da referência pela leitura `seqRef` (índice `i`) e pelo contador.
 * `margemS` null: o número da ligada já confirmou que é a mesma, e a
 * distância até a leitura não precisa provar nada.
 */
function pelaLeitura(
  ref: Referencia,
  i: number,
  leituras: LeituraDeTempo[],
  ligadas: Ligada[],
  ligadaDoIndice: Int32Array,
  margemS: number | null,
): string | null {
  const modo = modoDe(ref.modo);
  const a = leituras[i];
  const ligA = ligadas[ligadaDoIndice[i]];
  if (ligA.modo !== modo || modo === 'none') return null;

  if (ref.tNode >= a.tNode) {
    // A referência veio logo depois da leitura mais nova, na mesma ligada.
    // Distância maior que dois períodos não se explica sem um reinício: dúvida.
    // No nó que carimba a hora o relógio SALTA quando recebe a hora do celular,
    // então a distância não diz nada.
    if (modo === 'rtc' || margemS === null) return chaveDaLigada(ligA);
    return ref.tNode - a.tNode <= margemS ? chaveDaLigada(ligA) : null;
  }

  // Contador menor que o da leitura mais nova: o nó reiniciou (ou o contador
  // estourou) depois dela, e a referência é do trecho seguinte (FR-003).
  if (i + 1 >= leituras.length) return `p:${a.seq}`;
  const b = leituras[i + 1];
  const ligB = ligadas[ligadaDoIndice[i + 1]];
  // Se os dois lados trazem o número da ligada, ele tem que bater.
  const mesmoNumero = ref.ligada === null || ligB.numero === null || ligB.numero === ref.ligada;
  if (ligB !== ligA && ligB.modo === modo && mesmoNumero && b.tNode >= ref.tNode) {
    return chaveDaLigada(ligB);
  }
  return null;
}

/**
 * No nó que carimba a hora (`rtc`), o "contador" é o relógio dele, que SALTA a
 * cada acerto. Só faz sentido conferir uma coleta com o ÚLTIMO acerto antes
 * dela: o relógio do nó contou o tempo desde ali. Dois acertos entre si são a
 * hora do celular contra a hora do celular, e concordariam sempre.
 */
function comparaveis(
  a: Referencia, b: Referencia, validas: Array<{ ref: Referencia; chave: string }>,
): boolean {
  if (modoDe(a.modo) !== 'rtc') return true;
  const [acerto, coleta] = a.origem === 'acerto' ? [a, b] : [b, a];
  if (acerto.origem !== 'acerto' || coleta.origem === 'acerto') return false;
  if (acerto.seqRef === null || coleta.seqRef === null || acerto.seqRef > coleta.seqRef) return false;
  // Nenhum outro acerto, de outra visita, entre os dois.
  return !validas.some(({ ref }) => ref.origem === 'acerto' && ref.id !== acerto.id
    && ref.grupo !== coleta.grupo && ref.seqRef !== null
    && ref.seqRef >= acerto.seqRef! && ref.seqRef <= coleta.seqRef!
    && ref.id > acerto.id && ref.id < coleta.id);
}

function concordam(a: Referencia, b: Referencia): boolean {
  const decorridoNoNo = (b.tNode - a.tNode) * 1000;
  const decorridoNoCelular = b.tUtcMs - a.tUtcMs;
  return Math.abs(decorridoNoCelular - decorridoNoNo) <= toleranciaDaConferenciaMs(decorridoNoNo);
}

function qualidadeDoEstado(e: EstadoReferencia): { qualidade: Qualidade; motivo: MotivoHora | null } {
  switch (e) {
    case 'conferida': return { qualidade: QUALIDADE.ancorada, motivo: null };
    case 'nao-conferida': return { qualidade: QUALIDADE.estimada, motivo: 'referencia-nao-conferida' };
    case 'em-conflito': return { qualidade: QUALIDADE.estimada, motivo: 'conflito-de-hora' };
    default: return { qualidade: QUALIDADE.desconhecida, motivo: 'ligada-sem-referencia' };
  }
}

/**
 * Avalia o nó inteiro. As leituras e referências em contagem (feature 005)
 * seguem a regra própria delas (`contagem.ts`); o resto, a da 003. Um nó real
 * tem um modo só; na demonstração, a colmeia simulada pode receber leituras da
 * placa simulada pelo cabo, e as duas séries convivem sem se misturar.
 */
export function avaliarHoras(
  leituras: LeituraDeTempo[],
  referencias: Referencia[],
  p: ParametrosHora,
): AvaliacaoDasHoras {
  const ehContagem = (m: ModoRelogio | null) => m === 'contagem';
  const leiturasContagem = leituras.filter((l) => ehContagem(l.modo));
  const refsContagem = referencias.filter((r) => ehContagem(r.modo));
  if (leiturasContagem.length === 0 && refsContagem.length === 0) {
    return avaliarSemContagem(leituras, referencias, p);
  }
  const base = avaliarSemContagem(
    leituras.filter((l) => !ehContagem(l.modo)),
    referencias.filter((r) => !ehContagem(r.modo)),
    p,
  );
  const c = avaliarContagem(leiturasContagem, refsContagem, {
    intervaloS: p.intervaloContagemS ?? INTERVALO_PADRAO_S,
    inicioDoProjetoMs: p.inicioDoProjetoMs,
  });
  for (const [id, sit] of c.referencias) base.referencias.set(id, sit);
  return {
    ligadas: [...base.ligadas, ...c.ligadas].sort((a, b) => a.seqIni - b.seqIni),
    faixas: [...base.faixas, ...c.faixas].sort((a, b) => a.seqIni - b.seqIni),
    referencias: base.referencias,
    discordancias: base.discordancias,
    contagens: c.contagens,
  };
}

function avaliarSemContagem(
  leituras: LeituraDeTempo[],
  referencias: Referencia[],
  p: ParametrosHora,
): AvaliacaoDasHoras {
  const { ligadas, ligadaDoIndice } = segmentarLigadas(leituras);

  /* ---------- 1. Situação de cada referência ---------- */
  const situacao = new Map<number, SituacaoReferencia>();
  const validas: Array<{ ref: Referencia; chave: string }> = [];
  for (const ref of referencias) {
    const chave = atribuir(ref, leituras, ligadas, ligadaDoIndice, p.periodoS);
    const rejeitada = !ref.aceita || modoDe(ref.modo) === 'none'
      || !Number.isFinite(ref.tUtcMs) || ref.tUtcMs < p.inicioDoProjetoMs
      // Nó que carimba a hora com o relógio ainda não acertado (1970): o contador
      // dele não diz nada sobre o tempo do celular.
      || (modoDe(ref.modo) === 'rtc' && ref.origem !== 'acerto'
        && ref.tNode * 1000 < p.inicioDoProjetoMs);
    let estado: EstadoReferencia;
    if (rejeitada) estado = 'rejeitada';
    else if (ref.revogada) estado = 'revogada';
    else if (chave === null) estado = 'sem-ligada';
    else {
      estado = 'nao-conferida';
      validas.push({ ref, chave });
    }
    situacao.set(ref.id, { estado, ligada: chave });
  }

  /* ---------- 2. Conferência (FR-009) ---------- */
  const discordancias: Array<[number, number]> = [];
  const discordaGrupo = new Set<number>();
  const concordaGrupo = new Set<number>();
  for (let x = 0; x < validas.length; x++) {
    for (let y = x + 1; y < validas.length; y++) {
      const a = validas[x];
      const b = validas[y];
      if (a.ref.grupo === b.ref.grupo) continue;
      if (a.chave === b.chave && !comparaveis(a.ref, b.ref, validas)) continue;
      let discordam = false;
      if (a.chave === b.chave) {
        if (concordam(a.ref, b.ref)) {
          concordaGrupo.add(a.ref.grupo);
          concordaGrupo.add(b.ref.grupo);
        } else {
          discordam = true;
        }
      } else {
        // Ligadas diferentes: a hora do celular não pode voltar de uma para a
        // seguinte. É o que antes travava o acerto por meses (D-306).
        const pa = posicao(a.chave);
        const pb = posicao(b.chave);
        if (pa !== null && pb !== null && pa !== pb) {
          const [antes, depois] = pa < pb ? [a.ref, b.ref] : [b.ref, a.ref];
          discordam = depois.tUtcMs < antes.tUtcMs - TOLERANCIA_CONFERENCIA_BASE_MS;
        }
      }
      if (discordam) {
        discordancias.push([a.ref.id, b.ref.id]);
        discordaGrupo.add(a.ref.grupo);
        discordaGrupo.add(b.ref.grupo);
      }
    }
  }
  for (const { ref } of validas) {
    const s = situacao.get(ref.id)!;
    if (discordaGrupo.has(ref.grupo)) s.estado = 'em-conflito';
    else if (concordaGrupo.has(ref.grupo) || ref.confirmada) s.estado = 'conferida';
  }

  /* ---------- 3. Faixas de hora, ligada a ligada ---------- */
  const porChave = new Map<string, Referencia[]>();
  for (const { ref, chave } of validas) {
    const lista = porChave.get(chave) ?? [];
    lista.push(ref);
    porChave.set(chave, lista);
  }

  const faixas: Faixa[] = [];
  let inicio = 0;
  for (const lig of ligadas) {
    const fim = inicio + lig.quantidade - 1;
    const chave = chaveDaLigada(lig);
    if (lig.modo === 'none') {
      faixas.push(desconhecida(lig, 'sem-nocao-de-tempo'));
    } else if (lig.modo === 'rtc') {
      faixasCarimbadas(lig, leituras, inicio, fim, referencias, situacao, chave, faixas);
    } else {
      faixasPorReferencia(lig, leituras, inicio, fim, porChave.get(chave) ?? [], situacao, faixas);
    }
    inicio = fim + 1;
  }

  return { ligadas, faixas, referencias: situacao, discordancias, contagens: [] };
}

function desconhecida(lig: Ligada, motivo: MotivoHora): Faixa {
  return {
    seqIni: lig.seqIni, seqFim: lig.seqFim, ligada: lig.id, refId: null,
    refTNode: 0, refTUtcMs: null, qualidade: QUALIDADE.desconhecida, motivo,
  };
}

/**
 * Contador desde que ligou (FR-005): cada leitura usa a referência confiável
 * mais próxima, em contador, dentro da mesma ligada. A deriva do oscilador
 * cresce com a distância até a referência — por isso a mais próxima.
 */
function faixasPorReferencia(
  lig: Ligada, leituras: LeituraDeTempo[], inicio: number, fim: number,
  refs: Referencia[], situacao: Map<number, SituacaoReferencia>, saida: Faixa[],
) {
  if (refs.length === 0) {
    saida.push(desconhecida(lig, 'ligada-sem-referencia'));
    return;
  }
  // "Confiável mais próxima": se há referência conferida, só elas contam.
  const conferidas = refs.filter((r) => situacao.get(r.id)!.estado === 'conferida');
  const usadas = (conferidas.length > 0 ? conferidas : refs)
    .slice()
    .sort((a, b) => a.tNode - b.tNode || a.id - b.id);

  let k = 0;
  let iniFaixa = inicio;
  const fechar = (ate: number) => {
    if (ate < iniFaixa) return;
    const ref = usadas[k];
    const { qualidade, motivo } = qualidadeDoEstado(situacao.get(ref.id)!.estado);
    saida.push({
      seqIni: leituras[iniFaixa].seq, seqFim: leituras[ate].seq, ligada: lig.id,
      refId: ref.id, refTNode: ref.tNode, refTUtcMs: ref.tUtcMs, qualidade, motivo,
    });
    iniFaixa = ate + 1;
  };
  for (let i = inicio; i <= fim; i++) {
    // Passa para a próxima referência quando ela fica mais perto que a atual.
    while (k + 1 < usadas.length
      && leituras[i].tNode * 2 >= usadas[k].tNode + usadas[k + 1].tNode) {
      fechar(i - 1);
      k += 1;
    }
  }
  fechar(fim);
}

/**
 * O nó carimba a hora que recebeu de um celular (FR-007): a hora vale o que
 * vale o acerto que a originou. Leituras antes de qualquer acerto conhecido da
 * ligada ficam sem hora; acerto revogado tira a hora das que vieram dele.
 */
function faixasCarimbadas(
  lig: Ligada, leituras: LeituraDeTempo[], inicio: number, fim: number,
  referencias: Referencia[], situacao: Map<number, SituacaoReferencia>,
  chave: string, saida: Faixa[],
) {
  const acertos = referencias
    .filter((r) => r.origem === 'acerto' && r.seqRef !== null
      && situacao.get(r.id)!.ligada === chave
      && situacao.get(r.id)!.estado !== 'rejeitada')
    .sort((a, b) => (a.seqRef as number) - (b.seqRef as number) || a.id - b.id);

  let iniFaixa = inicio;
  let atual: Referencia | null = null;
  let k = 0;
  const fechar = (ate: number) => {
    if (ate < iniFaixa) return;
    let qualidade: Qualidade = QUALIDADE.desconhecida;
    let motivo: MotivoHora | null = 'hora-do-no-sem-acerto';
    let refTUtcMs: number | null = null;
    if (atual) {
      const e = situacao.get(atual.id)!.estado;
      if (e === 'revogada') {
        motivo = 'acerto-revogado';
      } else {
        ({ qualidade, motivo } = qualidadeDoEstado(e));
        refTUtcMs = 0;
      }
    }
    // refTNode = refTUtcMs = 0 faz a conta da VIEW dar t_node × 1000.
    saida.push({
      seqIni: leituras[iniFaixa].seq, seqFim: leituras[ate].seq, ligada: lig.id,
      refId: atual?.id ?? null, refTNode: 0, refTUtcMs, qualidade, motivo,
    });
    iniFaixa = ate + 1;
  };
  for (let i = inicio; i <= fim; i++) {
    // Leitura com seq maior que o do acerto foi carimbada depois dele.
    while (k < acertos.length && (acertos[k].seqRef as number) < leituras[i].seq) {
      fechar(i - 1);
      atual = acertos[k];
      k += 1;
    }
  }
  fechar(fim);
}

/** Referências que discordam de qualquer uma do grupo de `refId`. */
export function discordantesDe(av: AvaliacaoDasHoras, grupoDe: (id: number) => number, refId: number): number[] {
  const grupo = grupoDe(refId);
  const fora = new Set<number>();
  for (const [a, b] of av.discordancias) {
    if (grupoDe(a) === grupo && grupoDe(b) !== grupo) fora.add(b);
    if (grupoDe(b) === grupo && grupoDe(a) !== grupo) fora.add(a);
  }
  return [...fora];
}
