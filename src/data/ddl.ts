/**
 * Versão 1 do esquema (feature 001). Mantido à mão (e não via drizzle-kit) para
 * que os três drivers — expo-sqlite, sql.js e better-sqlite3 — apliquem
 * exatamente o mesmo SQL, o que é o que torna os testes representativos.
 *
 * NÃO EDITE: este texto é a migração 1 de `migracoes.ts`, e bancos já
 * instalados dependem dele como está. Mudança de esquema é migração nova.
 */
export const DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS apiary (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, municipio TEXT, uf TEXT,
  updated_ms INTEGER NOT NULL, deleted_ms INTEGER
);

CREATE TABLE IF NOT EXISTS hive (
  id TEXT PRIMARY KEY, apiary_id TEXT NOT NULL, nome TEXT NOT NULL,
  especie TEXT, instalada_em INTEGER, notas TEXT,
  updated_ms INTEGER NOT NULL, deleted_ms INTEGER
);

CREATE TABLE IF NOT EXISTS node (
  node_id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL UNIQUE,
  hive_id TEXT,
  placement TEXT,
  period_s INTEGER NOT NULL DEFAULT 900,
  sensor_installed_at INTEGER,
  temp_offset_c100 INTEGER NOT NULL DEFAULT 0,
  calib_version INTEGER NOT NULL DEFAULT 1,
  sensor_epoch INTEGER NOT NULL DEFAULT 1,
  last_seen_ms INTEGER
);

-- APPEND-ONLY. Chave (node_id, seq); boot_id NUNCA em chave (Princípio III).
CREATE TABLE IF NOT EXISTS reading (
  node_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  t_node INTEGER NOT NULL,
  t_utc_ms INTEGER NOT NULL,
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
  PRIMARY KEY (node_id, seq)
) WITHOUT ROWID;

-- A fila de envio É este índice parcial. Sem linha de fila por leitura.
CREATE INDEX IF NOT EXISTS ix_reading_unsynced
  ON reading(node_id, seq) WHERE synced_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_reading_time ON reading(node_id, t_utc_ms);

CREATE TABLE IF NOT EXISTS pull_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL,
  started_ms INTEGER NOT NULL, ended_ms INTEGER,
  proto_ver INTEGER, raw BLOB, raw_sha256 TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL, src TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clock_anchor (
  node_id INTEGER NOT NULL, boot_id TEXT NOT NULL DEFAULT '',
  t_node INTEGER NOT NULL, t_utc_ms INTEGER NOT NULL,
  mono_ms INTEGER NOT NULL, rtt_ms INTEGER NOT NULL DEFAULT 0,
  src TEXT NOT NULL, trusted INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (node_id, boot_id, t_node)
) WITHOUT ROWID;

-- Só amostras válidas entram; excluded_count acompanha (Princípio VI).
-- Dia sem amostra válida NÃO gera linha: a ausência é o que vira lacuna.
CREATE TABLE IF NOT EXISTS reading_daily (
  node_id INTEGER NOT NULL, day INTEGER NOT NULL,
  temp_p5 INTEGER, temp_med INTEGER, temp_p95 INTEGER,
  rh_med INTEGER, tvoc_med INTEGER, tvoc_amp INTEGER, batt_med INTEGER,
  sample_count INTEGER NOT NULL, excluded_count INTEGER NOT NULL,
  sensor_epoch INTEGER NOT NULL,
  PRIMARY KEY (node_id, day)
) WITHOUT ROWID;

-- Preferências do apicultor. É a única tabela que pode sofrer UPDATE: a
-- proibição do Princípio III vale para \`reading\`, que é o dado científico.
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;
