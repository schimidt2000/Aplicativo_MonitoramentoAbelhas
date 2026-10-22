/**
 * Nuvem real: Supabase (Auth + PostgREST) falando por `fetch`, atrás da MESMA
 * porta que a nuvem simulada. Nenhuma tela sabe qual das duas está em uso.
 *
 * O contrato do outro lado está em servidor/*.sql e em
 * specs/002-envio-e-painel/contracts/servidor.md. Resumo:
 *
 *   GET  /auth/v1/health                       guarda de portal cativo
 *   POST /auth/v1/signup  {}                   usuário anônimo do celular
 *   POST /auth/v1/token?grant_type=refresh_token
 *   POST /rest/v1/rpc/redeem_project_code      ligar o celular ao projeto
 *   POST /rest/v1/rpc/upsert_registry          cadastro (Trilha B)
 *   POST /rest/v1/reading?on_conflict=device_id,seq
 *        Prefer: resolution=ignore-duplicates,return=minimal   (Trilha A)
 *
 * Garantias que dependem DESTE arquivo (as outras são do servidor):
 *  - erro de digitação no código nunca sai do aparelho (FR-012);
 *  - só 201 confirma um lote de leituras. Qualquer outra coisa — inclusive um
 *    200 com HTML de portal cativo — devolve motivo, e o motor de envio NÃO
 *    grava `synced_at`. Confirmar o que não foi gravado seria perda
 *    silenciosa, o defeito crítico do Princípio III;
 *  - o celular nunca manda `node_id` (surrogate local) nem `beekeeper_id`
 *    (quem decide de quem é a leitura é o servidor, pela sessão);
 *  - nenhum dado pessoal vai para o endereço (FR-033, FR-038): o código do
 *    projeto vai no CORPO do pedido, nunca na URL.
 */
import type { z } from 'zod';
import type {
  CadastroParaEnvio, ClienteNuvem, LeituraParaEnvio, MotivoFalha, Resultado, Vinculo,
} from '@/core/ports/nuvem';
import { validarCodigo } from '@/core/codigo-projeto';
import type { ConfigNuvem } from '../config';
import type { Cofre } from './cofre';
import {
  RespostaCadastro, RespostaResgate, SaudeAuth, SessaoAuth, SessaoGuardada, VinculoGuardado,
} from './esquemas';
import { lerJson, motivoDaResposta, pedir, type Pedido } from './http';

const CHAVE_SESSAO = 'bee.nuvem.sessao';
const CHAVE_VINCULO = 'bee.nuvem.vinculo';

/** Renova a sessão quando faltar menos que isto para expirar. */
const MARGEM_RENOVACAO_MS = 60_000;

export interface OpcoesNuvemSupabase {
  config: ConfigNuvem;
  cofre: Cofre;
  fetch?: typeof fetch;
  agora?: () => number;
  /** Prazo de cada pedido. No 2G, um lote de 100 leituras leva segundos. */
  prazoMs?: number;
  /**
   * Primeira camada da guarda de portal cativo: o sistema diz se a internet
   * foi VALIDADA (no Android, NET_CAPABILITY_VALIDATED, via expo-network
   * `isInternetReachable`). `false` encerra antes de qualquer pedido; `null`
   * (não sei) segue para as outras camadas. Ausente enquanto expo-network não
   * for instalado (tasks.md, T031).
   */
  sondaDeRede?: () => Promise<boolean | null>;
}

type Sessao = SessaoGuardada;
type ComSessao = { ok: true; sessao: Sessao } | { ok: false; motivo: MotivoFalha };

export class NuvemSupabase implements ClienteNuvem {
  readonly nome = 'supabase';

  private readonly cfg: ConfigNuvem;
  private readonly cofre: Cofre;
  private readonly fazerFetch: typeof fetch;
  private readonly agora: () => number;
  private readonly prazoMs: number;
  private readonly sondaDeRede?: () => Promise<boolean | null>;

  constructor(o: OpcoesNuvemSupabase) {
    this.cfg = o.config;
    this.cofre = o.cofre;
    this.fazerFetch = o.fetch ?? ((...a) => globalThis.fetch(...a));
    this.agora = o.agora ?? Date.now;
    this.prazoMs = o.prazoMs ?? 30_000;
    this.sondaDeRede = o.sondaDeRede;
  }

  /* ------------------------------------------------------------------ */
  /* A porta                                                            */
  /* ------------------------------------------------------------------ */

  async verificarConexao(): Promise<Resultado> {
    if (this.sondaDeRede) {
      let validada: boolean | null = null;
      try { validada = await this.sondaDeRede(); } catch { validada = null; }
      if (validada === false) return { ok: false, motivo: 'sem-rede' };
    }

    const p = await this.pedido('/auth/v1/health', { method: 'GET' });
    if (!p.ok) return p;
    if (p.resposta.status !== 200) {
      return { ok: false, motivo: motivoDaResposta(p.resposta) };
    }
    // 200 só conta se for o JSON do Auth: a página de login de um portal
    // cativo também responde 200.
    const saude = await lerJson(p.resposta, SaudeAuth);
    if (!saude.ok) return { ok: false, motivo: saude.motivo === 'servidor' ? 'portal-cativo' : saude.motivo };
    return { ok: true };
  }

  async vinculoAtual(): Promise<Vinculo | null> {
    const [sessao, vinculo] = await Promise.all([this.lerSessao(), this.lerVinculo()]);
    return sessao && vinculo ? vinculo : null;
  }

  async vincular(codigo: string): Promise<Resultado & { vinculo?: Vinculo }> {
    // Erro de digitação é barrado AQUI, antes de qualquer rede, e não conta
    // como tentativa no servidor (FR-012).
    const v = validarCodigo(codigo);
    if (!v.ok) return { ok: false, motivo: 'codigo-invalido', detalhe: v.motivo };

    const conexao = await this.verificarConexao();
    if (!conexao.ok) return conexao;

    // Sessão velha recusada na renovação: aqui não é "sem vínculo" (a pessoa
    // está justamente ligando o celular), é só começar uma sessão nova.
    let s = await this.garantirSessao();
    if (!s.ok && s.motivo === 'sem-vinculo') s = await this.garantirSessao();
    if (!s.ok) return s;

    const p = await this.autenticado('/rest/v1/rpc/redeem_project_code', {
      method: 'POST',
      body: JSON.stringify({ p_code: v.codigo }),
    });
    if (!p.ok) return p;
    if (p.resposta.status !== 200) return { ok: false, motivo: motivoDaResposta(p.resposta) };

    const r = await lerJson(p.resposta, RespostaResgate);
    if (!r.ok) return r;

    switch (r.valor.status) {
      case 'ok': {
        const vinculo: Vinculo = {
          apicultorNome: r.valor.beekeeper_name,
          projetoNome: r.valor.project_name,
        };
        await this.cofre.gravar(CHAVE_VINCULO, JSON.stringify(vinculo));
        return { ok: true, vinculo };
      }
      case 'invalid': return { ok: false, motivo: 'codigo-invalido' };
      case 'throttled': return { ok: false, motivo: 'muitas-tentativas' };
      case 'locked': return { ok: false, motivo: 'codigo-travado' };
    }
  }

  async desvincular(): Promise<void> {
    await this.cofre.apagar(CHAVE_VINCULO);
    await this.cofre.apagar(CHAVE_SESSAO);
  }

  async enviarCadastro(c: CadastroParaEnvio): Promise<Resultado> {
    if (!(await this.vinculoAtual())) return { ok: false, motivo: 'sem-vinculo' };

    const p = await this.autenticado('/rest/v1/rpc/upsert_registry', {
      method: 'POST',
      body: JSON.stringify(paraCadastroDoServidor(c)),
    });
    if (!p.ok) return p;
    if (p.resposta.status !== 200) return { ok: false, motivo: motivoDaResposta(p.resposta) };
    const r = await lerJson(p.resposta, RespostaCadastro);
    return r.ok ? { ok: true } : r;
  }

  async enviarLeituras(lote: LeituraParaEnvio[]): Promise<Resultado> {
    if (lote.length === 0) return { ok: true };
    if (!(await this.vinculoAtual())) return { ok: false, motivo: 'sem-vinculo' };

    const p = await this.autenticado('/rest/v1/reading?on_conflict=device_id,seq', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(lote.map(paraLeituraDoServidor)),
    });
    if (!p.ok) return p;
    // SÓ 201 confirma. Ver o cabeçalho deste arquivo.
    if (p.resposta.status !== 201) return { ok: false, motivo: motivoDaResposta(p.resposta) };
    return { ok: true };
  }

  /* ------------------------------------------------------------------ */
  /* Sessão                                                             */
  /* ------------------------------------------------------------------ */

  private async lerSessao(): Promise<Sessao | null> {
    return lerGuardado(await this.cofre.ler(CHAVE_SESSAO), SessaoGuardada);
  }

  private async lerVinculo(): Promise<Vinculo | null> {
    return lerGuardado(await this.cofre.ler(CHAVE_VINCULO), VinculoGuardado);
  }

  private async gravarSessao(s: SessaoAuth): Promise<Sessao> {
    const sessao: Sessao = {
      tokenAcesso: s.access_token,
      tokenRenovacao: s.refresh_token,
      // SEMPRE pelo prazo relativo (`expires_in`) somado ao relógio DESTE
      // celular, nunca pelo `expires_at` absoluto do servidor: o vencimento é
      // comparado com `this.agora()`, e o relógio do celular no campo costuma
      // estar errado (core/relogio.ts). Com `expires_at`, um celular adiantado
      // em mais de uma hora renovaria a sessão antes de CADA pedido — o dobro
      // de pedidos no 2G e uma rotação de token a mais a cada lote.
      expiraEmMs: this.agora() + s.expires_in * 1000,
      usuarioId: s.user.id,
    };
    await this.cofre.gravar(CHAVE_SESSAO, JSON.stringify(sessao));
    return sessao;
  }

  /**
   * Sessão válida, renovando se estiver perto de expirar, ou criando um
   * usuário anônimo novo se não houver nenhuma. O usuário anônimo é só a
   * "identidade do celular"; quem diz de qual apicultor ele é, é o código.
   */
  private async garantirSessao(): Promise<ComSessao> {
    const atual = await this.lerSessao();
    if (atual && atual.expiraEmMs - this.agora() > MARGEM_RENOVACAO_MS) {
      return { ok: true, sessao: atual };
    }
    if (atual) return this.renovar(atual);

    const p = await this.pedido('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!p.ok) return p;
    if (p.resposta.status !== 200) return { ok: false, motivo: motivoDaResposta(p.resposta) };
    const r = await lerJson(p.resposta, SessaoAuth);
    if (!r.ok) return r;
    return { ok: true, sessao: await this.gravarSessao(r.valor) };
  }

  private async renovar(atual: Sessao): Promise<ComSessao> {
    const p = await this.pedido('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: atual.tokenRenovacao }),
    });
    if (!p.ok) return p;
    if (p.resposta.status === 400 || p.resposta.status === 401) {
      // A renovação foi recusada: a sessão morreu e, com ela, o vínculo deste
      // celular. Pedir o código de novo é o único caminho.
      await this.desvincular();
      return { ok: false, motivo: 'sem-vinculo' };
    }
    if (p.resposta.status !== 200) return { ok: false, motivo: motivoDaResposta(p.resposta) };
    const r = await lerJson(p.resposta, SessaoAuth);
    if (!r.ok) return r;
    return { ok: true, sessao: await this.gravarSessao(r.valor) };
  }

  /* ------------------------------------------------------------------ */
  /* Pedidos                                                            */
  /* ------------------------------------------------------------------ */

  /** Pedido só com a chave pública (Auth). */
  private pedido(caminho: string, init: RequestInit): Promise<Pedido> {
    return pedir(this.fazerFetch, this.cfg.url + caminho, {
      ...init,
      headers: {
        apikey: this.cfg.chavePublica,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    }, this.prazoMs);
  }

  /**
   * Pedido com a sessão do celular. Um 401 (token vencido no meio do envio)
   * renova UMA vez e repete; se ainda assim for 401, a sessão não vale mais.
   */
  private async autenticado(caminho: string, init: RequestInit): Promise<Pedido> {
    const s = await this.garantirSessao();
    if (!s.ok) return s;

    const enviar = (sessao: Sessao) => this.pedido(caminho, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${sessao.tokenAcesso}`,
      },
    });

    const primeira = await enviar(s.sessao);
    if (!primeira.ok || primeira.resposta.status !== 401) return primeira;

    const renovada = await this.renovar(s.sessao);
    if (!renovada.ok) return renovada;
    const segunda = await enviar(renovada.sessao);
    if (segunda.ok && segunda.resposta.status === 401) {
      await this.desvincular();
      return { ok: false, motivo: 'sem-vinculo' };
    }
    return segunda;
  }
}

/* ---------------------------------------------------------------------- */
/* Formato do fio: nomes do servidor (inglês, como o banco local)         */
/* ---------------------------------------------------------------------- */

/** Uma leitura como o servidor espera. Sem node_id, sem beekeeper_id. */
export function paraLeituraDoServidor(l: LeituraParaEnvio) {
  return {
    device_id: l.deviceId,
    seq: l.seq,
    t_node: l.tNode,
    t_utc_ms: l.tUtcMs,
    t_quality: l.tQuality,
    temp_c100: l.tempC100,
    rh_x100: l.rhX100,
    tvoc_ppb: l.tvocPpb,
    eco2_ppm: l.eco2Ppm,
    aqi_uba: l.aqiUba,
    gas_status: l.gasStatus,
    batt_mv: l.battMv,
    flags: l.flags,
    boot_id: l.bootId,
    sensor_epoch: l.sensorEpoch,
    calib_version: l.calibVersion,
    proto_ver: l.protoVer,
    src: l.src,
  };
}

/**
 * Cadastro como `upsert_registry` espera. Só o que está na porta: nada de
 * notas livres da colmeia (podem conter dado pessoal) e nenhuma coordenada —
 * o servidor nem tem coluna para isso (FR-022, FR-036).
 */
export function paraCadastroDoServidor(c: CadastroParaEnvio) {
  return {
    p_apiaries: c.apiarios.map((a) => ({
      id: a.id, name: a.nome, municipality: a.municipio, state: a.uf,
      updated_ms: a.updatedMs, deleted_ms: a.deletedMs,
    })),
    p_hives: c.colmeias.map((h) => ({
      id: h.id, apiary_id: h.apiarioId, name: h.nome, species: h.especie,
      installed_at_ms: h.instaladaEm, updated_ms: h.updatedMs, deleted_ms: h.deletedMs,
    })),
    p_nodes: c.nos.map((n) => ({
      device_id: n.deviceId, hive_id: n.colmeiaId, placement: n.placement,
      period_s: n.periodS, sensor_epoch: n.sensorEpoch, calib_version: n.calibVersion,
      temp_offset_c100: n.tempOffsetC100, updated_ms: n.updatedMs,
    })),
  };
}

function lerGuardado<T>(bruto: string | null, esquema: z.ZodType<T>): T | null {
  if (!bruto) return null;
  try {
    const v = esquema.safeParse(JSON.parse(bruto));
    return v.success ? v.data : null;
  } catch {
    return null;
  }
}
