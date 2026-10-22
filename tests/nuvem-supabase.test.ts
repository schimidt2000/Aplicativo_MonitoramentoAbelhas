/**
 * O cliente real da nuvem, contra um Supabase falso (tests/apoio/supabase-falso.ts).
 *
 * O que estes testes protegem, em ordem de gravidade:
 *  1. Nunca confirmar o que o servidor não gravou. Se um 200 de portal cativo
 *     virasse `ok`, o motor gravaria `synced_at` e a leitura nunca mais seria
 *     enviada: perda silenciosa, o defeito crítico do Princípio III.
 *  2. Erro de digitação no código nunca sai do aparelho (FR-012).
 *  3. O fio é o do servidor: chave natural, ignore-duplicates, sem node_id.
 */
import { describe, expect, it } from 'vitest';
import type { Reading } from '@/core/ports/transport';
import { atualizarHoras, gravarReferencia } from '@/data/hora';
import type { LeituraParaEnvio } from '@/core/ports/nuvem';
import { ingerirLote } from '@/data/ingest';
import {
  contarLeituras, garantirApiario, garantirColmeia, garantirNode, totalPendentes,
} from '@/data/repo';
import { enviarPendentes } from '@/data/sync';
import { NuvemSupabase, paraLeituraDoServidor } from '@/nuvem/supabase/cliente';
import { cofreEmMemoria } from '@/nuvem/supabase/cofre';
import { bancoDeTeste } from './apoio/banco';
import { CHAVE_FALSA, SupabaseFalso, URL_FALSA } from './apoio/supabase-falso';

const T0 = 1_790_000_000_000;

function montar(opcoes: { prazoMs?: number; agora?: () => number; sonda?: () => Promise<boolean | null> } = {}) {
  const servidor = new SupabaseFalso();
  const cofre = cofreEmMemoria();
  const nuvem = new NuvemSupabase({
    config: { url: URL_FALSA, chavePublica: CHAVE_FALSA },
    cofre,
    fetch: servidor.fetch,
    prazoMs: opcoes.prazoMs ?? 1000,
    agora: opcoes.agora,
    sondaDeRede: opcoes.sonda,
  });
  return { servidor, nuvem, cofre };
}

function leitura(seq: number, deviceId = 'CEL-1'): LeituraParaEnvio {
  return {
    deviceId, seq, tNode: seq * 900, tUtcMs: T0 + seq * 900_000, tQuality: 1,
    tempC100: 3460, rhX100: 6200, tvocPpb: 900, eco2Ppm: 700, aqiUba: 2,
    gasStatus: 0, battMv: 4000, flags: 0, bootId: 'b1', sensorEpoch: 1,
    calibVersion: 1, protoVer: 1, src: 'mock',
  };
}

const CADASTRO = {
  apiarios: [{ id: 'ap-1', nome: 'Apiário', municipio: 'Mossoró', uf: 'RN', updatedMs: 1, deletedMs: null }],
  colmeias: [{ id: 'h-1', apiarioId: 'ap-1', nome: 'Colmeia 01', especie: null, instaladaEm: null, updatedMs: 1, deletedMs: null }],
  nos: [{ deviceId: 'CEL-1', colmeiaId: 'h-1', placement: null, periodS: 900, sensorEpoch: 1, calibVersion: 1, tempOffsetC100: 0, updatedMs: 1 }],
};

async function ligado() {
  const m = montar();
  const r = await m.nuvem.vincular('DEM0-A1B4');
  expect(r.ok).toBe(true);
  expect((await m.nuvem.enviarCadastro(CADASTRO)).ok).toBe(true);
  return m;
}

describe('nuvem real: guarda de conexão', () => {
  it('servidor saudável responde ok', async () => {
    const { nuvem } = montar();
    expect(await nuvem.verificarConexao()).toEqual({ ok: true });
  });

  it('200 com HTML é portal cativo, não servidor no ar', async () => {
    const { nuvem, servidor } = montar();
    servidor.falhas.portalCativo = true;
    expect(await nuvem.verificarConexao()).toMatchObject({ ok: false, motivo: 'portal-cativo' });
  });

  it('resposta vinda de outro endereço é portal cativo', async () => {
    const { nuvem, servidor } = montar();
    servidor.falhas.redirecionar = true;
    expect(await nuvem.verificarConexao()).toMatchObject({ ok: false, motivo: 'portal-cativo' });
  });

  it('sem resposta nenhuma é "sem rede", nunca erro', async () => {
    const { nuvem, servidor } = montar();
    servidor.falhas.semRede = true;
    expect(await nuvem.verificarConexao()).toMatchObject({ ok: false, motivo: 'sem-rede' });
  });

  it('prazo esgotado é distinguido de sem rede', async () => {
    const travado: typeof fetch = (_u, init) => new Promise((_, rejeitar) => {
      init?.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError')));
    });
    const nuvem = new NuvemSupabase({
      config: { url: URL_FALSA, chavePublica: CHAVE_FALSA },
      cofre: cofreEmMemoria(), fetch: travado, prazoMs: 20,
    });
    expect(await nuvem.verificarConexao()).toMatchObject({ ok: false, motivo: 'tempo-esgotado' });
  });

  it('se o sistema diz que a internet não foi validada, nem tenta', async () => {
    const { nuvem, servidor } = montar({ sonda: async () => false });
    expect(await nuvem.verificarConexao()).toMatchObject({ ok: false, motivo: 'sem-rede' });
    expect(servidor.pedidos).toHaveLength(0);
  });

  it('sonda que não sabe (null) segue para as outras camadas', async () => {
    const { nuvem } = montar({ sonda: async () => null });
    expect(await nuvem.verificarConexao()).toEqual({ ok: true });
  });
});

describe('nuvem real: ligar o celular ao projeto', () => {
  it('erro de digitação é barrado ANTES de qualquer rede (FR-012)', async () => {
    const { nuvem, servidor } = montar();
    for (const errado of ['DEM0-A1B5', 'DEM0-A1B', '', 'DEMU-A1B4']) {
      expect(await nuvem.vincular(errado)).toMatchObject({ ok: false, motivo: 'codigo-invalido' });
    }
    expect(servidor.pedidos).toHaveLength(0);
    expect(servidor.errosDeCodigo).toBe(0);
  });

  it('código certo liga, e o vínculo fica guardado', async () => {
    const { nuvem } = montar();
    expect(await nuvem.vinculoAtual()).toBeNull();
    const r = await nuvem.vincular('dem0 a1b4');
    expect(r).toMatchObject({ ok: true, vinculo: { apicultorNome: 'Apicultora de demonstração A' } });
    expect(await nuvem.vinculoAtual()).toEqual(r.vinculo);
  });

  it('o código vai no corpo, canônico, nunca no endereço (FR-033)', async () => {
    const { nuvem, servidor } = montar();
    await nuvem.vincular('dem0-a1b4');
    const resgate = servidor.pedidos.find((p) => p.caminho.includes('redeem_project_code'))!;
    expect(resgate.corpo).toEqual({ p_code: 'DEM0A1B4' });
    for (const p of servidor.pedidos) expect(p.caminho).not.toMatch(/DEM0/i);
  });

  it('código bem formado mas inexistente: "não confere"', async () => {
    const { nuvem } = montar();
    expect(await nuvem.vincular('ZZZZ-ZZZ7')).toMatchObject({ ok: false, motivo: 'codigo-invalido' });
    expect(await nuvem.vinculoAtual()).toBeNull();
  });

  it('o servidor mandando esperar vira "muitas tentativas"', async () => {
    const { nuvem, servidor } = montar();
    servidor.errosDeCodigo = 5;
    expect(await nuvem.vincular('DEM0-A1B4')).toMatchObject({ ok: false, motivo: 'muitas-tentativas' });
  });

  it('sem internet, ligar diz "sem rede" e não guarda nada', async () => {
    const { nuvem, servidor } = montar();
    servidor.falhas.semRede = true;
    expect(await nuvem.vincular('DEM0-A1B4')).toMatchObject({ ok: false, motivo: 'sem-rede' });
    expect(await nuvem.vinculoAtual()).toBeNull();
  });

  it('resposta de resgate fora do formato nunca liga o celular', async () => {
    const { nuvem, servidor } = montar();
    servidor.codigos.set('DEM0A1B4', { apicultor: 'A', nome: undefined as never });
    expect(await nuvem.vincular('DEM0-A1B4')).toMatchObject({ ok: false, motivo: 'servidor' });
    expect(await nuvem.vinculoAtual()).toBeNull();
  });

  it('sessão velha recusada não impede ligar de novo: começa sessão nova', async () => {
    let agora = 0;
    const m = montar({ agora: () => agora });
    await m.nuvem.vincular('DEM0-A1B4');
    agora = 10 * 3600 * 1000; // sessão vencida
    m.servidor.falhas.recusarRenovacao = true;
    expect(await m.nuvem.vincular('DEM0-B2CZ')).toMatchObject({ ok: true });
    expect(m.servidor.pedidos.filter((p) => p.caminho === '/auth/v1/signup')).toHaveLength(2);
  });

  it('desvincular esquece sessão e vínculo', async () => {
    const { nuvem, cofre } = await ligado();
    await nuvem.desvincular();
    expect(await nuvem.vinculoAtual()).toBeNull();
    expect(await cofre.ler('bee.nuvem.sessao')).toBeNull();
  });
});

describe('nuvem real: o fio das leituras', () => {
  it('manda para a chave natural, ignorando duplicata, sem node_id nem beekeeper_id', async () => {
    const { nuvem, servidor } = await ligado();
    expect(await nuvem.enviarLeituras([leitura(1), leitura(2)])).toEqual({ ok: true });

    const p = servidor.pedidos.find((x) => x.caminho.startsWith('/rest/v1/reading'))!;
    expect(p.metodo).toBe('POST');
    expect(p.caminho).toBe('/rest/v1/reading?on_conflict=device_id,seq');
    expect(p.cabecalhos.prefer).toContain('resolution=ignore-duplicates');
    expect(p.cabecalhos.prefer).toContain('return=minimal');
    expect(p.cabecalhos.authorization).toMatch(/^Bearer /);
    expect(p.cabecalhos.apikey).toBe(CHAVE_FALSA);
    const linha = (p.corpo as Record<string, unknown>[])[0];
    expect(linha).toEqual(paraLeituraDoServidor(leitura(1)));
    expect(linha).not.toHaveProperty('node_id');
    expect(linha).not.toHaveProperty('beekeeper_id');
    expect(linha).toHaveProperty('boot_id', 'b1');
  });

  it('reenviar o mesmo lote não cria linha no servidor', async () => {
    const { nuvem, servidor } = await ligado();
    const lote = [leitura(1), leitura(2), leitura(3)];
    await nuvem.enviarLeituras(lote);
    await nuvem.enviarLeituras(lote);
    expect(servidor.totalLeituras()).toBe(3);
  });

  it('SÓ 201 confirma: 200 sem corpo não é gravação', async () => {
    const { nuvem, servidor } = await ligado();
    servidor.falhas.responder200AoGravar = true;
    expect((await nuvem.enviarLeituras([leitura(1)])).ok).toBe(false);
  });

  it('portal cativo no meio do envio nunca vira confirmação', async () => {
    const { nuvem, servidor } = await ligado();
    servidor.falhas.portalCativo = true;
    expect(await nuvem.enviarLeituras([leitura(1)])).toMatchObject({ ok: false, motivo: 'portal-cativo' });
  });

  it('servidor instável é "servidor" (vale tentar depois)', async () => {
    const { nuvem, servidor } = await ligado();
    servidor.falhas.instavelProximos = 1;
    expect(await nuvem.enviarLeituras([leitura(1)])).toMatchObject({ ok: false, motivo: 'servidor' });
  });

  it('nó de outro apicultor é recusado', async () => {
    const { nuvem, servidor } = await ligado();
    servidor.nos.set('CEL-B', 'B');
    expect(await nuvem.enviarLeituras([leitura(1, 'CEL-B')]))
      .toMatchObject({ ok: false, motivo: 'recusado' });
  });

  it('sem vínculo, nem tenta', async () => {
    const { nuvem, servidor } = montar();
    expect(await nuvem.enviarLeituras([leitura(1)])).toMatchObject({ ok: false, motivo: 'sem-vinculo' });
    expect(servidor.pedidos).toHaveLength(0);
  });
});

describe('nuvem real: sessão', () => {
  it('token vencido no meio do envio: renova uma vez e segue', async () => {
    const { nuvem, servidor } = await ligado();
    servidor.falhas.expirarProximos = 1;
    expect(await nuvem.enviarLeituras([leitura(1)])).toEqual({ ok: true });
    expect(servidor.pedidos.some((p) => p.caminho.startsWith('/auth/v1/token'))).toBe(true);
    expect(servidor.totalLeituras()).toBe(1);
  });

  it('renova antes de vencer, sem esperar o 401', async () => {
    let agora = 0;
    const m = montar({ agora: () => agora });
    await m.nuvem.vincular('DEM0-A1B4');
    await m.nuvem.enviarCadastro(CADASTRO);
    agora = 3600 * 1000 - 30_000; // a 30 s de vencer
    const antes = m.servidor.pedidos.length;
    await m.nuvem.enviarLeituras([leitura(1)]);
    const novos = m.servidor.pedidos.slice(antes).map((p) => p.caminho);
    expect(novos[0]).toMatch(/^\/auth\/v1\/token/);
  });

  it('relógio do celular errado não faz renovar a sessão antes de cada pedido', async () => {
    // O servidor manda `expires_at` pelo relógio DELE. No campo, o relógio do
    // celular costuma estar errado (core/relogio.ts): o vencimento tem de ser
    // contado no relógio do próprio celular, a partir de `expires_in`.
    for (const desvioMs of [2 * 86_400_000, -2 * 86_400_000]) {
      const m = montar({ agora: () => Date.now() + desvioMs });
      await m.nuvem.vincular('DEM0-A1B4');
      await m.nuvem.enviarCadastro(CADASTRO);
      for (let i = 1; i <= 3; i++) {
        expect(await m.nuvem.enviarLeituras([leitura(i)])).toEqual({ ok: true });
      }
      const renovacoes = m.servidor.pedidos.filter((p) => p.caminho.startsWith('/auth/v1/token'));
      expect(renovacoes, `desvio de ${desvioMs} ms`).toHaveLength(0);
    }
  });

  it('renovação recusada: o vínculo cai e o app pede o código de novo', async () => {
    const { nuvem, servidor } = await ligado();
    servidor.falhas.expirarProximos = 2;
    servidor.falhas.recusarRenovacao = true;
    expect(await nuvem.enviarLeituras([leitura(1)])).toMatchObject({ ok: false, motivo: 'sem-vinculo' });
    expect(await nuvem.vinculoAtual()).toBeNull();
  });

  it('401 mesmo com sessão recém-renovada: o vínculo não vale mais', async () => {
    const { nuvem, servidor } = await ligado();
    servidor.falhas.expirarProximos = 2;
    expect(await nuvem.enviarLeituras([leitura(1)])).toMatchObject({ ok: false, motivo: 'sem-vinculo' });
    expect(await nuvem.vinculoAtual()).toBeNull();
    expect(servidor.totalLeituras()).toBe(0);
  });

  it('sessão guardada corrompida é tratada como ausente', async () => {
    const { nuvem, cofre } = await ligado();
    await cofre.gravar('bee.nuvem.sessao', '{"isto": "não é sessão"');
    expect(await nuvem.vinculoAtual()).toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
/* De ponta a ponta: motor de envio + cliente real + servidor falso       */
/* ---------------------------------------------------------------------- */

function celularCom(quantas: number) {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap-1', 'Apiário de teste');
  garantirColmeia(db, 'h-1', 'ap-1', 'Colmeia 01');
  const nodeId = garantirNode(db, 'CEL-1', 'h-1', 900);
  const lote: Reading[] = Array.from({ length: quantas }, (_, i) => ({
    seq: i + 1, tNode: (i + 1) * 900, tempC100: 3460, rhX100: 6200, tvocPpb: 900,
    eco2Ppm: 700, aqiUba: 2, gasStatus: 0, battMv: 4000, flags: 0,
  }));
  // Feature 003: a ingestão só guarda o modo de tempo do nó; a hora vem da
  // referência da coleta, avaliada depois (como em tests/ingestao.test.ts).
  ingerirLote(db, nodeId, lote, { clockMode: 'uptime' }, 1, 'mock');
  gravarReferencia(db, nodeId, {
    origem: 'coleta', bootId: 'b1', ligada: null, tNode: quantas * 900, tUtcMs: T0,
    monoMs: 0, rttMs: 0, src: 'mock', aceita: true, seqRef: quantas, modo: 'uptime',
    criadoMs: T0,
  });
  atualizarHoras(db, nodeId, 'coleta', T0);
  return db;
}

describe('envio de ponta a ponta com a nuvem real', () => {
  it('sobe tudo, e reenviar não muda nada nos dois lados', async () => {
    const db = celularCom(260);
    const { nuvem, servidor } = montar();
    await nuvem.vincular('DEM0-A1B4');

    const r = await enviarPendentes(db, nuvem);
    expect(r).toMatchObject({ enviadas: 260, restantes: 0, parou: null });
    expect(servidor.totalLeituras()).toBe(260);

    expect((await enviarPendentes(db, nuvem)).enviadas).toBe(0);
    expect(servidor.totalLeituras()).toBe(260);
    expect(contarLeituras(db)).toBe(260);
  });

  it('cadastro sobe ANTES das leituras (a RLS exige o nó)', async () => {
    const db = celularCom(10);
    const { nuvem, servidor } = montar();
    await nuvem.vincular('DEM0-A1B4');
    await enviarPendentes(db, nuvem);
    const caminhos = servidor.pedidos.map((p) => p.caminho);
    expect(caminhos.indexOf('/rest/v1/rpc/upsert_registry'))
      .toBeLessThan(caminhos.findIndex((c) => c.startsWith('/rest/v1/reading')));
  });

  it('a conexão cai DEPOIS de o servidor gravar: retoma sem perder nem duplicar', async () => {
    const db = celularCom(300);
    const { nuvem, servidor } = montar();
    await nuvem.vincular('DEM0-A1B4');
    servidor.falhas.cairDepoisDeGravarAoPassarDe = 150;

    const primeira = await enviarPendentes(db, nuvem);
    expect(primeira.parou).toBe('sem-rede');
    // O servidor tem mais do que o celular sabe — é o caso at-least-once.
    expect(servidor.totalLeituras()).toBeGreaterThan(300 - totalPendentes(db));

    const segunda = await enviarPendentes(db, nuvem);
    expect(segunda.parou).toBeNull();
    expect(totalPendentes(db)).toBe(0);
    expect(servidor.totalLeituras()).toBe(300);
  });

  it('portal cativo: nada é marcado como enviado', async () => {
    const db = celularCom(50);
    const { nuvem, servidor } = montar();
    await nuvem.vincular('DEM0-A1B4');
    servidor.falhas.portalCativo = true;

    const r = await enviarPendentes(db, nuvem);
    expect(r.parou).toBe('portal-cativo');
    expect(totalPendentes(db)).toBe(50);
  });

  it('sem vínculo, o motor para em "sem-vinculo" sem tocar no banco', async () => {
    const db = celularCom(20);
    const { nuvem } = montar();
    const r = await enviarPendentes(db, nuvem);
    expect(r.parou).toBe('sem-vinculo');
    expect(totalPendentes(db)).toBe(20);
  });
});
