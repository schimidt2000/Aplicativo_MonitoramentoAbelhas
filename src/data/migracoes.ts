/**
 * Esquema versionado do banco local, por `PRAGMA user_version` (feature 003,
 * D-309). A constituição exige "migrações versionadas para frente", que nunca
 * destroem leitura e que têm teste com banco populado (tests/migracao.test.ts).
 *
 * Regras:
 *  - cada migração roda numa transação que TERMINA com `PRAGMA user_version = N`.
 *    O número fica no cabeçalho do banco, que é transacional: se a migração
 *    falha, o banco continua inteiro na versão anterior;
 *  - a versão 1 é o DDL da 001 (`CREATE … IF NOT EXISTS`), então um banco
 *    instalado antes deste arquivo existir (versão 0, tabelas já criadas) passa
 *    por ela sem mudar nada;
 *  - o mesmo código roda em expo-sqlite, sql.js e better-sqlite3.
 *
 * Migração nova: acrescente ao FIM de `MIGRACOES`, com a versão seguinte. Nunca
 * edite uma migração que já foi publicada.
 */
import type { SqlDb } from './types';
import { DDL } from './ddl';
import { reavaliarTodos } from './hora';

export interface Migracao {
  versao: number;
  nome: string;
  aplicar(db: SqlDb): void;
}

/** Colunas de `reading` na versão 1, na ordem do DDL da 001. */
const COLUNAS_LEITURA_V1 = [
  'node_id', 'seq', 't_node', 't_utc_ms', 't_quality', 'temp_c100', 'rh_x100',
  'tvoc_ppb', 'eco2_ppm', 'aqi_uba', 'gas_status', 'batt_mv', 'flags', 'boot_id',
  'sensor_epoch', 'calib_version', 'proto_ver', 'src', 'ing_ms', 'synced_at',
].join(', ');

const COLUNAS_ANCORA_V1 = [
  'node_id', 'boot_id', 't_node', 't_utc_ms', 'mono_ms', 'rtt_ms', 'src', 'trusted',
].join(', ');

function contar(db: SqlDb, sql: string): number {
  return db.all<{ c: number }>(sql)[0].c;
}

/**
 * Antes de remover a tabela velha: a nova tem que ter as MESMAS linhas, campo a
 * campo. `EXCEPT` trata NULL como igual a NULL, então pega até um NULL que
 * virou 0. Qualquer diferença lança, e a transação inteira desfaz.
 */
export function conferirCopia(db: SqlDb, velha: string, nova: string, colunas: string): void {
  const nVelha = contar(db, `SELECT COUNT(*) AS c FROM ${velha}`);
  const nNova = contar(db, `SELECT COUNT(*) AS c FROM ${nova}`);
  const faltam = contar(db,
    `SELECT COUNT(*) AS c FROM (SELECT ${colunas} FROM ${velha} EXCEPT SELECT ${colunas} FROM ${nova})`);
  const sobram = contar(db,
    `SELECT COUNT(*) AS c FROM (SELECT ${colunas} FROM ${nova} EXCEPT SELECT ${colunas} FROM ${velha})`);
  if (nVelha !== nNova || faltam !== 0 || sobram !== 0) {
    throw new Error(
      `Migração abortada: cópia de ${velha} diverge (${nVelha} → ${nNova}, faltam ${faltam}, sobram ${sobram}).`,
    );
  }
}

/**
 * Feature 003. Ver specs/003-hora-das-leituras/data-model.md e, para a
 * reconstrução de `reading`, o Complexity Tracking do plan.md.
 */
function migrarHora003(db: SqlDb): void {
  /* 1. reading: t_utc_ms passa a aceitar NULL (FR-016) + três colunas brutas. */
  db.exec(`
    CREATE TABLE reading_003 (
      node_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      t_node INTEGER NOT NULL,
      t_utc_ms INTEGER,
      t_quality INTEGER NOT NULL,
      temp_c100 INTEGER, rh_x100 INTEGER,
      tvoc_ppb INTEGER, eco2_ppm INTEGER, aqi_uba INTEGER, gas_status INTEGER,
      batt_mv INTEGER,
      flags INTEGER NOT NULL DEFAULT 0,
      boot_id TEXT,
      sensor_epoch INTEGER NOT NULL DEFAULT 1,
      calib_version INTEGER NOT NULL DEFAULT 1,
      proto_ver INTEGER NOT NULL,
      src TEXT NOT NULL,
      ing_ms INTEGER NOT NULL,
      synced_at INTEGER,
      t_motivo TEXT,
      boot_no INTEGER,
      clock_mode TEXT,
      PRIMARY KEY (node_id, seq)
    ) WITHOUT ROWID;
    INSERT INTO reading_003 (${COLUNAS_LEITURA_V1})
      SELECT ${COLUNAS_LEITURA_V1} FROM reading;
  `);
  conferirCopia(db, 'reading', 'reading_003', COLUNAS_LEITURA_V1);
  db.exec(`
    DROP TABLE reading;
    ALTER TABLE reading_003 RENAME TO reading;
    CREATE INDEX IF NOT EXISTS ix_reading_unsynced
      ON reading(node_id, seq) WHERE synced_at IS NULL;
    CREATE INDEX IF NOT EXISTS ix_reading_time ON reading(node_id, t_utc_ms);
  `);

  /* 2. clock_anchor: ganha id (para ser referenciada) e o que a 003 precisa. */
  db.exec(`
    CREATE TABLE clock_anchor_003 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      boot_id TEXT NOT NULL DEFAULT '',
      t_node INTEGER NOT NULL,
      t_utc_ms INTEGER NOT NULL,
      mono_ms INTEGER NOT NULL,
      rtt_ms INTEGER NOT NULL DEFAULT 0,
      src TEXT NOT NULL,
      trusted INTEGER NOT NULL DEFAULT 1,
      origem TEXT NOT NULL DEFAULT 'coleta',
      grupo INTEGER,
      boot_no INTEGER,
      seq_ref INTEGER,
      clock_mode TEXT,
      periodo_s INTEGER,
      criado_ms INTEGER
    );
    -- A âncora antiga era "a última leitura da coleta = agora": o seq_ref é o
    -- da leitura com o mesmo contador. Sem leitura assim, fica sem ligada.
    INSERT INTO clock_anchor_003 (${COLUNAS_ANCORA_V1}, origem, seq_ref, criado_ms)
      SELECT ${COLUNAS_ANCORA_V1}, 'legado',
             (SELECT MAX(r.seq) FROM reading r
               WHERE r.node_id = a.node_id AND r.t_node = a.t_node),
             a.t_utc_ms
        FROM clock_anchor a
       ORDER BY a.node_id, a.t_utc_ms, a.t_node;
  `);
  conferirCopia(db, 'clock_anchor', 'clock_anchor_003', COLUNAS_ANCORA_V1);
  db.exec(`
    DROP TABLE clock_anchor;
    ALTER TABLE clock_anchor_003 RENAME TO clock_anchor;
    CREATE INDEX IF NOT EXISTS ix_clock_anchor_node ON clock_anchor(node_id, id);
  `);

  /* 3. Correção sem reescrever (FR-013, FR-014): tudo append-only. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS referencia_revogada (
      ref_id INTEGER PRIMARY KEY,
      revogada_ms INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      decisao_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS hora_decisao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      ref_id INTEGER NOT NULL,
      resposta TEXT NOT NULL,
      hora_celular_ms INTEGER NOT NULL,
      decidido_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hora_versao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      criado_ms INTEGER NOT NULL,
      causa TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_hora_versao_node ON hora_versao(node_id, id);

    CREATE TABLE IF NOT EXISTS hora_correcao (
      versao_id INTEGER NOT NULL,
      node_id INTEGER NOT NULL,
      seq_ini INTEGER NOT NULL,
      seq_fim INTEGER NOT NULL,
      ligada INTEGER,
      ref_id INTEGER,
      ref_t_node INTEGER NOT NULL,
      ref_t_utc_ms INTEGER,
      t_quality INTEGER NOT NULL,
      motivo TEXT,
      PRIMARY KEY (versao_id, seq_ini)
    ) WITHOUT ROWID;

    -- A hora que VALE. Cada leitura pega a faixa da última versão do nó que a
    -- cobre; sem faixa, valem os campos da própria leitura, que nunca mudam.
    CREATE VIEW IF NOT EXISTS leitura_hora AS
    SELECT r.node_id, r.seq, r.t_node,
           CASE WHEN c.versao_id IS NULL THEN r.t_utc_ms
                WHEN c.ref_t_utc_ms IS NULL THEN NULL
                ELSE c.ref_t_utc_ms - (c.ref_t_node - r.t_node) * 1000 END AS t_utc_ms,
           CASE WHEN c.versao_id IS NULL THEN r.t_quality ELSE c.t_quality END AS t_quality,
           CASE WHEN c.versao_id IS NULL THEN r.t_motivo ELSE c.motivo END AS t_motivo,
           c.ligada AS ligada, c.ref_id AS ref_id, c.versao_id AS versao_id,
           r.temp_c100, r.rh_x100, r.tvoc_ppb, r.eco2_ppm, r.aqi_uba, r.gas_status,
           r.batt_mv, r.flags, r.boot_id, r.boot_no, r.clock_mode, r.sensor_epoch,
           r.calib_version, r.proto_ver, r.src, r.ing_ms, r.synced_at
      FROM reading r
      LEFT JOIN hora_correcao c
        ON c.versao_id = (SELECT MAX(v.id) FROM hora_versao v WHERE v.node_id = r.node_id)
       AND c.seq_ini = (
             SELECT MAX(c2.seq_ini) FROM hora_correcao c2
              WHERE c2.versao_id = (SELECT MAX(v2.id) FROM hora_versao v2
                                     WHERE v2.node_id = r.node_id)
                AND c2.seq_ini <= r.seq)
       AND c.seq_fim >= r.seq;
  `);

  /* 4. FR-015: o que já estava gravado passa pelas mesmas regras, à parte. */
  reavaliarTodos(db, 'instalacao-003');
}

/**
 * Feature 005 (coleta pelo cabo). Só ACRESCENTA: colunas novas e a VIEW
 * recriada. Nenhuma tabela é reconstruída e nenhuma linha muda. Ver
 * specs/005-coleta-pelo-cabo/data-model.md.
 */
function migrarCabo005(db: SqlDb): void {
  db.exec(`
    DROP VIEW IF EXISTS leitura_hora;

    -- Valor do sensor em ponto flutuante como a placa mandou (D-509).
    ALTER TABLE reading ADD COLUMN temp_bruto REAL;
    ALTER TABLE reading ADD COLUMN rh_bruto REAL;

    -- Quanto vale uma unidade de t_node, em ms. NULL = 1000 (D-508).
    ALTER TABLE hora_correcao ADD COLUMN ms_por_unidade INTEGER;

    -- Intervalo da placa (NULL = 7200 s) e MAC informado no READY (D-510).
    ALTER TABLE node ADD COLUMN intervalo_medicao_s INTEGER;
    ALTER TABLE node ADD COLUMN mac TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_node_mac ON node(mac) WHERE mac IS NOT NULL;

    -- A sessão do cabo: formato, CRC, o que se sabe do arquivo da placa,
    -- a hora enviada e o registro das linhas trocadas (FR-007).
    ALTER TABLE pull_session ADD COLUMN formato TEXT;
    ALTER TABLE pull_session ADD COLUMN crc32 TEXT;
    ALTER TABLE pull_session ADD COLUMN fim_da_placa TEXT;
    ALTER TABLE pull_session ADD COLUMN erro_da_placa TEXT;
    ALTER TABLE pull_session ADD COLUMN hora_enviada_s INTEGER;
    ALTER TABLE pull_session ADD COLUMN registro TEXT;

    -- A mesma VIEW da 003, com o tamanho da unidade do contador e os brutos.
    CREATE VIEW leitura_hora AS
    SELECT r.node_id, r.seq, r.t_node,
           CASE WHEN c.versao_id IS NULL THEN r.t_utc_ms
                WHEN c.ref_t_utc_ms IS NULL THEN NULL
                ELSE c.ref_t_utc_ms
                     - (c.ref_t_node - r.t_node) * COALESCE(c.ms_por_unidade, 1000) END AS t_utc_ms,
           CASE WHEN c.versao_id IS NULL THEN r.t_quality ELSE c.t_quality END AS t_quality,
           CASE WHEN c.versao_id IS NULL THEN r.t_motivo ELSE c.motivo END AS t_motivo,
           c.ligada AS ligada, c.ref_id AS ref_id, c.versao_id AS versao_id,
           r.temp_c100, r.rh_x100, r.tvoc_ppb, r.eco2_ppm, r.aqi_uba, r.gas_status,
           r.batt_mv, r.flags, r.boot_id, r.boot_no, r.clock_mode, r.sensor_epoch,
           r.calib_version, r.proto_ver, r.src, r.ing_ms, r.synced_at,
           r.temp_bruto, r.rh_bruto
      FROM reading r
      LEFT JOIN hora_correcao c
        ON c.versao_id = (SELECT MAX(v.id) FROM hora_versao v WHERE v.node_id = r.node_id)
       AND c.seq_ini = (
             SELECT MAX(c2.seq_ini) FROM hora_correcao c2
              WHERE c2.versao_id = (SELECT MAX(v2.id) FROM hora_versao v2
                                     WHERE v2.node_id = r.node_id)
                AND c2.seq_ini <= r.seq)
       AND c.seq_fim >= r.seq;
  `);
}

export const MIGRACOES: Migracao[] = [
  { versao: 1, nome: 'esquema-001', aplicar: (db) => db.exec(DDL) },
  { versao: 2, nome: 'hora-das-leituras-003', aplicar: migrarHora003 },
  { versao: 3, nome: 'coleta-pelo-cabo-005', aplicar: migrarCabo005 },
];

export const VERSAO_ATUAL = MIGRACOES[MIGRACOES.length - 1].versao;

export function versaoDoBanco(db: SqlDb): number {
  return Number(db.all<{ user_version: number }>('PRAGMA user_version')[0]?.user_version ?? 0);
}

export interface ResultadoMigracao { de: number; para: number }

/**
 * Leva o banco até a última versão de `lista`. Um banco de versão MAIOR (app
 * mais antigo abrindo banco de app mais novo) não é tocado.
 */
export function migrar(db: SqlDb, lista: Migracao[] = MIGRACOES): ResultadoMigracao {
  const de = versaoDoBanco(db);
  let para = de;
  for (const m of [...lista].sort((a, b) => a.versao - b.versao)) {
    if (m.versao <= para) continue;
    if (!Number.isInteger(m.versao)) throw new Error(`Versão de migração inválida: ${m.versao}`);
    db.transaction(() => {
      m.aplicar(db);
      db.exec(`PRAGMA user_version = ${m.versao}`);
    });
    para = m.versao;
  }
  return { de, para };
}

/** O que os três drivers chamam ao abrir o banco. */
export function prepararBanco(db: SqlDb): ResultadoMigracao {
  // Fora de transação: dentro de uma, este PRAGMA não faz nada.
  db.exec('PRAGMA foreign_keys = ON;');
  return migrar(db);
}
