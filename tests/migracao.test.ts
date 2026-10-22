/**
 * Migração do banco local (feature 003, D-309). A constituição exige que
 * nenhuma migração destrua leitura e que toda migração tenha teste com banco
 * POPULADO. Roda nos dois drivers que dá para rodar fora do celular:
 * better-sqlite3 e sql.js (o SQLite do app de campo no navegador).
 */
import { describe, expect, it } from 'vitest';
import { DDL } from '@/data/ddl';
import {
  MIGRACOES, VERSAO_ATUAL, conferirCopia, migrar, prepararBanco, versaoDoBanco,
} from '@/data/migracoes';
import type { SqlDb } from '@/data/types';
import { bancoDeTeste, bancoDeTesteSemMigrar } from './apoio/banco';
import { bancoSqlJsSemMigrar } from './apoio/bancoSqlJs';

const COLUNAS_V1 = [
  'node_id', 'seq', 't_node', 't_utc_ms', 't_quality', 'temp_c100', 'rh_x100',
  'tvoc_ppb', 'eco2_ppm', 'aqi_uba', 'gas_status', 'batt_mv', 'flags', 'boot_id',
  'sensor_epoch', 'calib_version', 'proto_ver', 'src', 'ing_ms', 'synced_at',
];

const T0 = Date.UTC(2026, 9, 1, 12);

/**
 * Um banco como o app da 002 deixava: versão 0, tabelas da 001, dois nós,
 * leituras com NULL em medição, enviadas e não enviadas, um reinício do nó no
 * meio (contador volta), âncoras confiáveis e não confiáveis.
 */
function popularVersao1(db: SqlDb) {
  db.exec(DDL);
  db.run(`INSERT INTO apiary (id, nome, updated_ms) VALUES ('ap', 'Meliponário', 1)`);
  db.run(`INSERT INTO hive (id, apiary_id, nome, updated_ms) VALUES ('h1', 'ap', 'Colmeia 1', 1)`);
  db.run(`INSERT INTO hive (id, apiary_id, nome, updated_ms) VALUES ('h2', 'ap', 'Colmeia 2', 1)`);
  db.run(`INSERT INTO node (device_id, hive_id, period_s) VALUES ('N1', 'h1', 900)`);
  db.run(`INSERT INTO node (device_id, hive_id, period_s) VALUES ('N2', 'h2', 900)`);

  const linhas: unknown[][] = [];
  // Nó 1: seq 1..40, contador volta a 0 no seq 25 (reinício), lacuna em 30..33.
  for (let seq = 1; seq <= 40; seq++) {
    if (seq >= 30 && seq <= 33) continue;
    const tNode = seq < 25 ? seq * 900 : (seq - 25) * 900;
    linhas.push([
      1, seq, tNode, T0 + seq * 900_000, seq % 3 === 0 ? 2 : 1,
      seq % 7 === 0 ? null : 3400 + seq, seq % 5 === 0 ? null : 6000,
      seq % 4 === 0 ? null : 800 + seq, null, seq % 6 === 0 ? null : 2,
      seq % 9 === 0 ? 1 : 0, seq % 11 === 0 ? null : 4000 - seq, seq % 2,
      seq < 25 ? 'b1' : 'semente', 1, 1, 1, 'mock', T0 + 1, seq <= 10 ? T0 + 99 : null,
    ]);
  }
  // Nó 2: poucas leituras, com valores negativos e zeros legítimos.
  for (let seq = 100; seq <= 105; seq++) {
    linhas.push([
      2, seq, seq * 900, T0 + seq, 1, -150, 0, 0, 0, 0, 0, 3300, 0,
      null, 2, 3, 1, 'cable', T0 + 2, null,
    ]);
  }
  for (const l of linhas) {
    db.run(`INSERT INTO reading (${COLUNAS_V1.join(', ')}) VALUES (${COLUNAS_V1.map(() => '?').join(',')})`, l);
  }
  // Âncora antiga confiável no fim do nó 1 (t_node da última leitura) e uma
  // não confiável no nó 2.
  db.run(`INSERT INTO clock_anchor (node_id, boot_id, t_node, t_utc_ms, mono_ms, rtt_ms, src, trusted)
          VALUES (1, 'b1', ${15 * 900}, ${T0 + 40 * 900_000}, 5, 0, 'mock', 1)`);
  db.run(`INSERT INTO clock_anchor (node_id, boot_id, t_node, t_utc_ms, mono_ms, rtt_ms, src, trusted)
          VALUES (2, 'semente', ${105 * 900}, ${T0}, 0, 0, 'mock', 0)`);
  db.run(`INSERT INTO pull_session (node_id, started_ms, outcome, src) VALUES (1, 1, 'ok', 'mock')`);
  db.run(`INSERT INTO config (chave, valor) VALUES ('intervalo_coleta_dias', '15')`);
}

function leiturasV1(db: SqlDb) {
  return db.all(`SELECT ${COLUNAS_V1.join(', ')} FROM reading ORDER BY node_id, seq`);
}

const DRIVERS: Array<[string, () => Promise<SqlDb>]> = [
  ['better-sqlite3', async () => bancoDeTesteSemMigrar()],
  ['sql.js', bancoSqlJsSemMigrar],
];

describe.each(DRIVERS)('migração para a versão %s', (_nome, abrir) => {
  it('banco populado da 002 → versão atual, sem perder nem alterar leitura (INV-10)', async () => {
    const db = await abrir();
    popularVersao1(db);
    const antes = leiturasV1(db);
    const ancorasAntes = db.all('SELECT node_id, boot_id, t_node, t_utc_ms, mono_ms, rtt_ms, src, trusted FROM clock_anchor ORDER BY node_id');
    expect(versaoDoBanco(db)).toBe(0);
    expect(antes).toHaveLength(42);

    expect(prepararBanco(db)).toEqual({ de: 0, para: VERSAO_ATUAL });

    // Campo a campo, inclusive NULL, zero, negativo e synced_at.
    expect(leiturasV1(db)).toEqual(antes);
    // As colunas novas entram em branco nas linhas antigas.
    expect(db.all(
      'SELECT COUNT(*) AS c FROM reading WHERE t_motivo IS NOT NULL OR boot_no IS NOT NULL OR clock_mode IS NOT NULL',
    )).toEqual([{ c: 0 }]);
    // t_utc_ms passou a aceitar NULL (FR-016); o resto da chave não mudou.
    const colunas = db.all<{ name: string; notnull: number; pk: number }>('PRAGMA table_info(reading)');
    expect(colunas.find((c) => c.name === 't_utc_ms')?.notnull).toBe(0);
    expect(colunas.filter((c) => c.pk > 0).map((c) => c.name)).toEqual(['node_id', 'seq']);
    // A fila de envio continua sendo o índice parcial.
    expect(db.all<{ name: string }>("PRAGMA index_list('reading')").map((i) => i.name))
      .toContain('ix_reading_unsynced');
    // As âncoras sobrevivem, agora como referências de origem "legado".
    expect(db.all('SELECT node_id, boot_id, t_node, t_utc_ms, mono_ms, rtt_ms, src, trusted FROM clock_anchor ORDER BY node_id'))
      .toEqual(ancorasAntes);
    expect(db.all('SELECT DISTINCT origem FROM clock_anchor')).toEqual([{ origem: 'legado' }]);
    // O resto do banco ficou onde estava.
    expect(db.all('SELECT valor FROM config')).toEqual([{ valor: '15' }]);
    expect(db.all('SELECT COUNT(*) AS c FROM pull_session')).toEqual([{ c: 1 }]);
  });

  it('FR-015: o que já estava gravado é reavaliado à parte, e a leitura não muda', async () => {
    const db = await abrir();
    popularVersao1(db);
    const antes = leiturasV1(db);
    prepararBanco(db);

    // Nó 1: o reinício no seq 25 separa duas ligadas. A âncora antiga confiável
    // é da segunda (mesmo contador da última leitura). A primeira não tem
    // referência: hora em branco — antes ela saía "ancorada" (defeito 1).
    const porSeq = new Map(db.all<{ seq: number; t_utc_ms: number | null; t_quality: number; t_motivo: string | null }>(
      'SELECT seq, t_utc_ms, t_quality, t_motivo FROM leitura_hora WHERE node_id = 1',
    ).map((l) => [l.seq, l]));
    expect(porSeq.get(24)).toMatchObject({ t_utc_ms: null, t_quality: 3, t_motivo: 'ligada-sem-referencia' });
    expect(porSeq.get(25)).toMatchObject({ t_quality: 2, t_motivo: 'referencia-nao-conferida' });
    expect(porSeq.get(40)?.t_utc_ms).toBe(T0 + 40 * 900_000);
    // Nó 2: a âncora antiga não confiável não vale como referência.
    expect(db.all('SELECT DISTINCT t_quality, t_motivo FROM leitura_hora WHERE node_id = 2'))
      .toEqual([{ t_quality: 3, t_motivo: 'ligada-sem-referencia' }]);
    // A correção é à parte: uma versão por nó, causa registrada.
    expect(db.all('SELECT node_id, causa FROM hora_versao ORDER BY node_id')).toEqual([
      { node_id: 1, causa: 'instalacao-003' }, { node_id: 2, causa: 'instalacao-003' },
    ]);
    expect(leiturasV1(db)).toEqual(antes);
  });

  it('migrar de novo não faz nada (INV-12)', async () => {
    const db = await abrir();
    popularVersao1(db);
    prepararBanco(db);
    const leituras = leiturasV1(db);
    const versoes = db.all('SELECT * FROM hora_versao');

    expect(prepararBanco(db)).toEqual({ de: VERSAO_ATUAL, para: VERSAO_ATUAL });
    expect(leiturasV1(db)).toEqual(leituras);
    expect(db.all('SELECT * FROM hora_versao')).toEqual(versoes);
  });

  it('migração que falha no meio desfaz tudo e o banco fica na versão anterior (INV-11)', async () => {
    const db = await abrir();
    popularVersao1(db);
    const antes = leiturasV1(db);
    const quebrada = [
      MIGRACOES[0],
      { ...MIGRACOES[1], aplicar: (d: SqlDb) => { MIGRACOES[1].aplicar(d); throw new Error('falhou no fim'); } },
    ];

    expect(() => migrar(db, quebrada)).toThrow('falhou no fim');

    expect(versaoDoBanco(db)).toBe(1);
    expect(leiturasV1(db)).toEqual(antes);
    // A reconstrução foi desfeita: t_utc_ms continua NOT NULL e nada novo existe.
    const colunas = db.all<{ name: string; notnull: number }>('PRAGMA table_info(reading)');
    expect(colunas.find((c) => c.name === 't_utc_ms')?.notnull).toBe(1);
    expect(db.all("SELECT name FROM sqlite_master WHERE name IN ('hora_versao', 'leitura_hora', 'reading_003')"))
      .toEqual([]);
    // E a migração boa, depois, funciona.
    prepararBanco(db);
    expect(leiturasV1(db)).toEqual(antes);
  });

  it('feature 005: banco da 003 (versão 2) → 3 sem mudar leitura nem hora (INV-507)', async () => {
    const db = await abrir();
    popularVersao1(db);
    expect(migrar(db, MIGRACOES.slice(0, 2))).toEqual({ de: 0, para: 2 });
    const COLS_VIEW_V2 = 'node_id, seq, t_node, t_utc_ms, t_quality, t_motivo, ligada, ref_id, versao_id, '
      + 'temp_c100, rh_x100, tvoc_ppb, eco2_ppm, aqi_uba, gas_status, batt_mv, flags, boot_id, '
      + 'boot_no, clock_mode, sensor_epoch, calib_version, proto_ver, src, ing_ms, synced_at';
    const horasAntes = db.all(`SELECT ${COLS_VIEW_V2} FROM leitura_hora ORDER BY node_id, seq`);
    const leiturasAntes = leiturasV1(db);
    const versoesAntes = db.all('SELECT * FROM hora_versao');
    const faixasAntes = db.all('SELECT * FROM hora_correcao ORDER BY versao_id, seq_ini');

    expect(prepararBanco(db)).toEqual({ de: 2, para: 3 });

    expect(leiturasV1(db)).toEqual(leiturasAntes);
    expect(db.all(`SELECT ${COLS_VIEW_V2} FROM leitura_hora ORDER BY node_id, seq`)).toEqual(horasAntes);
    expect(db.all('SELECT * FROM hora_versao')).toEqual(versoesAntes);
    // As faixas antigas ganham a coluna em branco, e a conta da VIEW continua em segundos.
    expect(db.all('SELECT * FROM hora_correcao ORDER BY versao_id, seq_ini'))
      .toEqual(faixasAntes.map((f) => ({ ...(f as object), ms_por_unidade: null })));
    // Colunas novas em branco nas linhas antigas; chave intacta.
    expect(db.all('SELECT COUNT(*) AS c FROM reading WHERE temp_bruto IS NOT NULL OR rh_bruto IS NOT NULL'))
      .toEqual([{ c: 0 }]);
    expect(db.all('SELECT COUNT(*) AS c FROM node WHERE mac IS NOT NULL OR intervalo_medicao_s IS NOT NULL'))
      .toEqual([{ c: 0 }]);
    const colunas = db.all<{ name: string; pk: number }>('PRAGMA table_info(reading)');
    expect(colunas.filter((c) => c.pk > 0).map((c) => c.name)).toEqual(['node_id', 'seq']);
    expect(db.all<{ name: string }>('PRAGMA table_info(pull_session)').map((c) => c.name))
      .toEqual(expect.arrayContaining(['formato', 'crc32', 'fim_da_placa', 'erro_da_placa',
        'hora_enviada_s', 'registro']));
  });

  it('feature 005: a migração 3 que falha no meio desfaz tudo (fica na 2)', async () => {
    const db = await abrir();
    popularVersao1(db);
    migrar(db, MIGRACOES.slice(0, 2));
    const horas = db.all('SELECT * FROM leitura_hora ORDER BY node_id, seq');
    const quebrada = [...MIGRACOES.slice(0, 2),
      { ...MIGRACOES[2], aplicar: (d: SqlDb) => { MIGRACOES[2].aplicar(d); throw new Error('falhou no fim'); } }];

    expect(() => migrar(db, quebrada)).toThrow('falhou no fim');

    expect(versaoDoBanco(db)).toBe(2);
    expect(db.all<{ name: string }>('PRAGMA table_info(reading)').map((c) => c.name))
      .not.toContain('temp_bruto');
    expect(db.all('SELECT * FROM leitura_hora ORDER BY node_id, seq')).toEqual(horas);
  });

  it('feature 005: o MAC é único quando existe, e vários nós podem não ter', async () => {
    const db = await abrir();
    popularVersao1(db);
    prepararBanco(db);
    db.run("INSERT INTO node (device_id, hive_id) VALUES ('N3', 'h1')");
    db.run("UPDATE node SET mac = 'AA:BB:CC:DD:EE:FF' WHERE device_id = 'N1'");
    expect(() => db.run("UPDATE node SET mac = 'AA:BB:CC:DD:EE:FF' WHERE device_id = 'N2'")).toThrow();
    expect(db.all('SELECT COUNT(*) AS c FROM node WHERE mac IS NULL')).toEqual([{ c: 2 }]);
  });

  it('banco novo nasce na versão atual, pelo mesmo caminho', async () => {
    const db = await abrir();
    expect(prepararBanco(db)).toEqual({ de: 0, para: VERSAO_ATUAL });
    expect(db.all("SELECT name FROM sqlite_master WHERE type = 'view'")).toEqual([{ name: 'leitura_hora' }]);
  });
});

describe('a guarda da cópia', () => {
  it('pega um NULL que virou 0 e uma linha a menos', () => {
    const db = bancoDeTeste();
    db.exec(`CREATE TABLE a (k INTEGER PRIMARY KEY, v INTEGER);
             CREATE TABLE b (k INTEGER PRIMARY KEY, v INTEGER);
             INSERT INTO a VALUES (1, NULL), (2, 5);
             INSERT INTO b VALUES (1, NULL), (2, 5);`);
    expect(() => conferirCopia(db, 'a', 'b', 'k, v')).not.toThrow();

    db.exec('DELETE FROM b WHERE k = 1; INSERT INTO b VALUES (1, 0);');
    expect(() => conferirCopia(db, 'a', 'b', 'k, v')).toThrow(/diverge/);

    db.exec('DELETE FROM b WHERE k = 1;');
    expect(() => conferirCopia(db, 'a', 'b', 'k, v')).toThrow(/diverge/);
  });
});
