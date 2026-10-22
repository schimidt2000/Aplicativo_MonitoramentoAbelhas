/**
 * Caso de referência do resumo diário (FR-021, SC-007).
 *
 * O mesmo `servidor/golden/resumo-diario.json` roda aqui, contra o
 * `recalcularResumos` do celular, e em `servidor/teste/rodar.sh`, contra o
 * gatilho do Postgres. Se os dois divergirem, a pesquisadora vê um número no
 * painel e o apicultor vê outro no celular — falha de Princípio VI que nenhum
 * outro teste pega.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recalcularResumos } from '@/data/ingest';
import { garantirApiario, garantirColmeia, garantirNode } from '@/data/repo';
import type { SqlDb } from '@/data/types';
import { bancoDeTeste } from './apoio/banco';

interface LeituraGolden {
  device_id: string; seq: number; t_node: number; t_utc_ms: number; t_quality: number;
  temp_c100: number | null; rh_x100: number | null; tvoc_ppb: number | null;
  eco2_ppm: number | null; aqi_uba: number | null; gas_status: number | null;
  batt_mv: number | null; flags: number; boot_id: string | null;
  sensor_epoch: number; calib_version: number; proto_ver: number; src: string;
}

type ResumoGolden = Record<string, number | string | null>;

const golden = JSON.parse(
  readFileSync(new URL('../servidor/golden/resumo-diario.json', import.meta.url), 'utf8'),
) as { leituras: LeituraGolden[]; esperado: ResumoGolden[] };

const COLUNAS_RESUMO = [
  'day', 'temp_p5', 'temp_med', 'temp_p95', 'rh_med', 'tvoc_med', 'tvoc_amp',
  'batt_med', 'sample_count', 'excluded_count', 'sensor_epoch',
] as const;

/**
 * Grava a leitura como está no arquivo. Não passa por `ingerirLote` porque lá o
 * horário é derivado da âncora, e aqui o horário exato é parte do caso.
 */
function inserir(db: SqlDb, nodeId: number, r: LeituraGolden) {
  db.run(
    `INSERT INTO reading
      (node_id, seq, t_node, t_utc_ms, t_quality, temp_c100, rh_x100, tvoc_ppb,
       eco2_ppm, aqi_uba, gas_status, batt_mv, flags, boot_id, sensor_epoch,
       calib_version, proto_ver, src, ing_ms)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [nodeId, r.seq, r.t_node, r.t_utc_ms, r.t_quality, r.temp_c100, r.rh_x100,
     r.tvoc_ppb, r.eco2_ppm, r.aqi_uba, r.gas_status, r.batt_mv, r.flags, r.boot_id,
     r.sensor_epoch, r.calib_version, r.proto_ver, r.src, 0],
  );
}

function resumosNoCelular(leituras: LeituraGolden[]): ResumoGolden[] {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap-g', 'Apiário de referência');
  garantirColmeia(db, 'h-g', 'ap-g', 'Colmeia de referência');

  const nos = new Map<string, number>();
  for (const r of leituras) {
    if (!nos.has(r.device_id)) nos.set(r.device_id, garantirNode(db, r.device_id, 'h-g'));
    inserir(db, nos.get(r.device_id)!, r);
  }
  for (const nodeId of nos.values()) recalcularResumos(db, nodeId);

  return db.all<ResumoGolden>(
    `SELECT n.device_id, ${COLUNAS_RESUMO.map((c) => `d.${c}`).join(', ')}
       FROM reading_daily d JOIN node n ON n.node_id = d.node_id
      ORDER BY n.device_id, d.day, d.sensor_epoch`,
  );
}

describe('resumo diário: caso de referência compartilhado com o servidor', () => {
  it('o celular produz exatamente os números esperados', () => {
    expect(resumosNoCelular(golden.leituras)).toEqual(golden.esperado);
  });

  it('dia só com gás inválido não gera linha (é a lacuna do gráfico)', () => {
    const dias = resumosNoCelular(golden.leituras)
      .filter((r) => r.device_id === 'GOLD0001').map((r) => r.day);
    expect(dias).not.toContain(20301);
  });

  it('a ordem de chegada das leituras não muda o resultado', () => {
    const embaralhadas = [...golden.leituras].reverse();
    expect(resumosNoCelular(embaralhadas)).toEqual(golden.esperado);
  });

  /**
   * ACHADO A-1 (research.md): no celular, `reading_daily` tem chave (node_id, day),
   * mas o agrupamento é por (node_id, day, sensor_epoch). Uma troca de sensor
   * no MEIO de um dia gera duas linhas para a mesma chave e o recálculo lança.
   * O servidor já usa (device_id, day, sensor_epoch). Latente hoje: nenhum
   * caminho do app muda sensor_epoch. Este teste documenta o defeito: quando a
   * correção entrar (tasks.md, T060), ele passa a falhar e deve virar um `it`
   * normal comparando com o servidor.
   */
  it.fails('troca de época no meio do dia ainda quebra o recálculo do celular', () => {
    const base = golden.leituras[0];
    const mesmoDia = [
      { ...base, seq: 1, sensor_epoch: 1 },
      { ...base, seq: 2, t_utc_ms: base.t_utc_ms + 3_600_000, sensor_epoch: 2 },
    ];
    expect(resumosNoCelular(mesmoDia)).toHaveLength(2);
  });
});
