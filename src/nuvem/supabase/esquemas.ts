/**
 * Forma de TODA resposta que o cliente lê do servidor, validada com zod.
 *
 * É a terceira camada da guarda de portal cativo: uma rede de praça que
 * responde 200 com uma página de login nunca passa por estes esquemas, então
 * nunca é confundida com "o servidor confirmou". E é também a defesa contra o
 * servidor mudar de formato sem avisar: o cliente para com motivo, em vez de
 * gravar `synced_at` com base numa resposta que não entendeu.
 */
import { z } from 'zod';

/** GET /auth/v1/health — o GoTrue responde com nome e versão. */
export const SaudeAuth = z
  .object({ name: z.string().optional(), version: z.string().optional() })
  .refine((v) => Boolean(v.name || v.version), 'resposta de saúde sem nome nem versão');

/** POST /auth/v1/signup (anônimo) e POST /auth/v1/token?grant_type=refresh_token. */
export const SessaoAuth = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  expires_at: z.number().positive().optional(),
  user: z.object({ id: z.string().min(1) }),
});
export type SessaoAuth = z.infer<typeof SessaoAuth>;

/** POST /rest/v1/rpc/redeem_project_code. Ver servidor/002_rls.sql. */
export const RespostaResgate = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    beekeeper_name: z.string(),
    project_name: z.string(),
  }),
  z.object({ status: z.literal('invalid') }),
  z.object({ status: z.literal('throttled') }),
  z.object({ status: z.literal('locked') }),
]);

/** POST /rest/v1/rpc/upsert_registry: quantas linhas o servidor aceitou. */
export const RespostaCadastro = z.object({
  apiaries: z.number().int().nonnegative(),
  hives: z.number().int().nonnegative(),
  nodes: z.number().int().nonnegative(),
});

/* ---------- O que o próprio celular guarda no cofre ---------- */

export const SessaoGuardada = z.object({
  tokenAcesso: z.string().min(1),
  tokenRenovacao: z.string().min(1),
  expiraEmMs: z.number(),
  usuarioId: z.string().min(1),
});
export type SessaoGuardada = z.infer<typeof SessaoGuardada>;

export const VinculoGuardado = z.object({
  apicultorNome: z.string(),
  projetoNome: z.string(),
});
