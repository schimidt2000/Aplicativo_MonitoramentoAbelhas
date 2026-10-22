/**
 * Fonte Supabase contra um servidor de mentira que se comporta como o
 * PostgREST num ponto que importa: ele CORTA a resposta em 1.000 linhas, sem
 * erro e sem aviso, por mais que o cliente peça `limit`. Um corte silencioso
 * nos resumos diários viraria lacuna falsa no gráfico (Princípio VI).
 */
import { describe, expect, it, vi } from 'vitest';

const MAX_LINHAS = 1000;

type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};

/** Construtor de consulta mínimo, encadeável e "thenable", como o do supabase-js. */
function consulta(tabela: string) {
  let linhas = [...(tabelas[tabela] ?? [])];
  let inicio = 0;
  let fim = Infinity;
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { linhas = linhas.filter((l) => l[c] === v); return q; },
    in: (c: string, vs: unknown[]) => { linhas = linhas.filter((l) => vs.includes(l[c])); return q; },
    gte: (c: string, v: number) => { linhas = linhas.filter((l) => (l[c] as number) >= v); return q; },
    lte: (c: string, v: number) => { linhas = linhas.filter((l) => (l[c] as number) <= v); return q; },
    lt: (c: string, v: number) => { linhas = linhas.filter((l) => (l[c] as number) < v); return q; },
    order: () => q,
    limit: (n: number) => { fim = inicio + n - 1; return q; },
    range: (de: number, ate: number) => { inicio = de; fim = ate; return q; },
    then: (ok: (r: { data: Linha[]; error: null }) => unknown) => {
      const pedidas = linhas.slice(inicio, Math.min(fim + 1, linhas.length));
      return Promise.resolve({ data: pedidas.slice(0, MAX_LINHAS), error: null }).then(ok);
    },
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: consulta, auth: {} }),
}));

const { criarFonteSupabase } = await import('../src/dados/supabase');

function resumo(device_id: string, day: number): Linha {
  return {
    device_id, day, sensor_epoch: 1, temp_p5: 3300, temp_med: 3400, temp_p95: 3500,
    rh_med: 6000, tvoc_med: 500, sample_count: 96, excluded_count: 0,
  };
}

describe('fonte Supabase', () => {
  it('traz TODOS os resumos do período, mesmo acima do corte do servidor', async () => {
    tabelas.node = [
      { device_id: 'N1', beekeeper_id: 'b1', hive_id: 'h1', temp_offset_c100: 0 },
      { device_id: 'N2', beekeeper_id: 'b1', hive_id: 'h1', temp_offset_c100: 0 },
    ];
    // Dois nós na mesma colmeia, 731 dias: 1.462 linhas.
    tabelas.hive_daily = ['N1', 'N2'].flatMap((n) =>
      Array.from({ length: 731 }, (_, i) => resumo(n, 20_000 + i)));
    const fonte = criarFonteSupabase('https://exemplo.supabase.co', 'anon');
    const rs = await fonte.resumosDiarios('b1~h1', 20_000, 20_730);
    expect(rs).toHaveLength(1462);
    expect(rs.filter((r) => r.noId === 'N2' && r.dia === 20_730)).toHaveLength(1);
  });
});

function leituraLinha(device_id: string, seq: number): Linha {
  return {
    device_id, seq, t_utc_ms: 20_000 * 86_400_000 + seq * 900_000, t_quality: 1,
    temp_c100: 3400, rh_x100: 6000, tvoc_ppb: 500, eco2_ppm: 675, gas_status: 0,
    sensor_epoch: 1, proto_ver: 1,
  };
}

describe('fonte Supabase: leituras da planilha', () => {
  it('traz TODAS as leituras do recorte, mesmo acima do corte do servidor', async () => {
    // Sem paginar, a planilha sairia com 1.000 leituras e diria "pronta" — perda
    // silenciosa no arquivo que vai para a análise.
    tabelas.node = [{ device_id: 'N1', beekeeper_id: 'b1', hive_id: 'h1', temp_offset_c100: 0 }];
    tabelas.hive_reading = Array.from({ length: 2_500 }, (_, i) => leituraLinha('N1', i + 1));
    const fonte = criarFonteSupabase('https://exemplo.supabase.co', 'anon');
    const ls = await fonte.leituras(['b1~h1'], 0, Number.MAX_SAFE_INTEGER, 50_000);
    expect(ls).toHaveLength(2_500);
    expect(new Set(ls.map((l) => l.seq)).size).toBe(2_500);
    expect(ls.every((l) => l.colmeiaId === 'b1~h1')).toBe(true);
  });

  it('para em limite + 1, para a tela saber que o recorte é grande demais', async () => {
    tabelas.node = [{ device_id: 'N1', beekeeper_id: 'b1', hive_id: 'h1', temp_offset_c100: 0 }];
    tabelas.hive_reading = Array.from({ length: 2_500 }, (_, i) => leituraLinha('N1', i + 1));
    const fonte = criarFonteSupabase('https://exemplo.supabase.co', 'anon');
    const ls = await fonte.leituras(['b1~h1'], 0, Number.MAX_SAFE_INTEGER, 1_200);
    expect(ls).toHaveLength(1_201);
  });
});
