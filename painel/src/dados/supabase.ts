/**
 * Fonte Supabase. Carregada só por import dinâmico (`escolher.ts`): no modo de
 * demonstração o SDK nem chega ao navegador, e no modo real ele fica fora do
 * caminho crítico do primeiro desenho.
 *
 * Só `select`. O painel não escreve nada (Princípio III, FR-032). O acesso é o
 * da pesquisadora, com RLS negando por padrão no servidor (FR-018, FR-020):
 * esta fonte não filtra por projeto porque o servidor já devolve só o que ela
 * pode ver.
 *
 * Privacidade (FR-033): os filtros vão na query string do PostgREST, mas só
 * com códigos opacos (id do apicultor, id da colmeia, id do nó, dia, ms).
 * Nome de pessoa nunca é filtro no servidor: a busca por apicultor é feita no
 * navegador, sobre a lista já carregada.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  COLUNAS_LEITURA, COLUNAS_MACRO, COLUNAS_NO, COLUNAS_RESUMO, TABELAS,
  leituraDeLinha, macroDeLinha, motivoDoProblema, partesColmeia, resumoDeLinha,
  type LinhaLeitura, type LinhaMacro, type LinhaNo, type LinhaResumo,
} from './contrato';
import {
  ProblemaDados,
  type ColmeiaMacro, type FontePainel, type LeituraPainel, type NoSensorPainel,
  type ResultadoEntrada, type ResumoDiario, type Sessao,
} from './porta';

/** O PostgREST corta resposta em 1.000 linhas por padrão; paginamos nesse passo. */
const PAGINA = 1000;

function online(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function falhar(e: unknown): never {
  throw new ProblemaDados(motivoDoProblema(e, online()));
}

async function chamar<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let r: { data: T | null; error: unknown };
  try {
    r = await p;
  } catch (e) {
    falhar(e);
  }
  if (r.error) falhar(r.error);
  return r.data as T;
}

export function criarFonteSupabase(url: string, chaveAnonima: string): FontePainel {
  const sb: SupabaseClient = createClient(url, chaveAnonima, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  async function nosDasColmeias(colmeiaIds: string[]): Promise<{ no: LinhaNo; colmeiaId: string }[]> {
    const saida: { no: LinhaNo; colmeiaId: string }[] = [];
    // Uma consulta por apicultor: a chave da colmeia é (beekeeper_id, hive_id).
    const porApicultor = new Map<string, Map<string, string>>();
    for (const id of colmeiaIds) {
      const p = partesColmeia(id);
      if (!p) continue;
      const m = porApicultor.get(p.beekeeperId) ?? new Map<string, string>();
      m.set(p.hiveId, id);
      porApicultor.set(p.beekeeperId, m);
    }
    for (const [beekeeperId, colmeias] of porApicultor) {
      const linhas = await chamar<LinhaNo[]>(
        sb.from(TABELAS.no).select(COLUNAS_NO)
          .eq('beekeeper_id', beekeeperId)
          .in('hive_id', [...colmeias.keys()]),
      );
      for (const no of linhas) {
        const colmeiaId = no.hive_id === null ? undefined : colmeias.get(no.hive_id);
        if (colmeiaId) saida.push({ no, colmeiaId });
      }
    }
    return saida;
  }

  return {
    modo: 'supabase',

    async sessaoAtual(): Promise<Sessao | null> {
      const { data } = await sb.auth.getSession();
      return data.session ? { email: data.session.user.email ?? null } : null;
    },

    async entrar(email: string, senha: string): Promise<ResultadoEntrada> {
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) {
          const status = (error as { status?: number }).status;
          if (status === 400 || status === 401 || status === 422) {
            return { ok: false, motivo: 'credenciais' };
          }
          return { ok: false, motivo: motivoDoProblema(error, online()) };
        }
        return { ok: true, sessao: { email: data.user?.email ?? null } };
      } catch (e) {
        return { ok: false, motivo: motivoDoProblema(e, online()) };
      }
    },

    async sair(): Promise<void> {
      await sb.auth.signOut();
    },

    async visaoGeral(): Promise<ColmeiaMacro[]> {
      const linhas = await chamar<LinhaMacro[]>(
        sb.from(TABELAS.visaoMacro).select(COLUNAS_MACRO),
      );
      return linhas.map(macroDeLinha);
    },

    async colmeia(colmeiaId: string): Promise<ColmeiaMacro | null> {
      const p = partesColmeia(colmeiaId);
      if (!p) return null;
      const linhas = await chamar<LinhaMacro[]>(
        sb.from(TABELAS.visaoMacro).select(COLUNAS_MACRO)
          .eq('beekeeper_id', p.beekeeperId).eq('hive_id', p.hiveId).limit(1),
      );
      return linhas.length > 0 ? macroDeLinha(linhas[0]) : null;
    },

    async nosSensores(colmeiaIds: string[]): Promise<NoSensorPainel[]> {
      const nos = await nosDasColmeias(colmeiaIds);
      return nos.map(({ no, colmeiaId }) => ({
        noId: no.device_id,
        colmeiaId,
        correcaoTempC100: no.temp_offset_c100,
        // O esquema do servidor ainda não guarda o modelo do sensor.
        modeloSensor: null,
      }));
    },

    async resumosDiarios(colmeiaId: string, deDia: number, ateDia: number): Promise<ResumoDiario[]> {
      const nos = await nosDasColmeias([colmeiaId]);
      if (nos.length === 0) return [];
      // Paginado: o servidor corta a resposta em PAGINA linhas sem avisar, e um
      // corte silencioso viraria "dia sem leitura válida" no gráfico — lacuna
      // falsa (Princípio VI). Dois nós × 731 dias já passam de 1.000 linhas.
      const saida: ResumoDiario[] = [];
      for (let de = 0; ; de += PAGINA) {
        const pagina = await chamar<LinhaResumo[]>(
          sb.from(TABELAS.resumoDiario).select(COLUNAS_RESUMO)
            .in('device_id', nos.map((n) => n.no.device_id))
            .gte('day', deDia).lte('day', ateDia)
            .order('device_id').order('day').order('sensor_epoch')
            .range(de, de + PAGINA - 1),
        );
        for (const l of pagina) saida.push(resumoDeLinha(l));
        if (pagina.length < PAGINA) break;
      }
      return saida;
    },

    async leituras(
      colmeiaIds: string[], deMs: number, ateMs: number, limite: number,
    ): Promise<LeituraPainel[]> {
      const nos = await nosDasColmeias(colmeiaIds);
      if (nos.length === 0) return [];
      const colmeiaDoNo = new Map(nos.map((n) => [n.no.device_id, n.colmeiaId]));
      const saida: LeituraPainel[] = [];
      for (let de = 0; saida.length <= limite; de += PAGINA) {
        const pagina = await chamar<LinhaLeitura[]>(
          sb.from(TABELAS.leitura).select(COLUNAS_LEITURA)
            .in('device_id', [...colmeiaDoNo.keys()])
            .gte('t_utc_ms', deMs).lt('t_utc_ms', ateMs)
            .order('device_id').order('seq')
            .range(de, de + PAGINA - 1),
        );
        for (const l of pagina) saida.push(leituraDeLinha(l, colmeiaDoNo.get(l.device_id)!));
        if (pagina.length < PAGINA) break;
      }
      return saida.slice(0, limite + 1);
    },
  };
}
