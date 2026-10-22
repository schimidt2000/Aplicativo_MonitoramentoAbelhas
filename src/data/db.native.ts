/** Driver nativo: expo-sqlite. É o caminho de produção. */
import * as SQLite from 'expo-sqlite';
import type { SqlDb } from './types';
import { prepararBanco } from './migracoes';

export async function abrirBanco(): Promise<SqlDb> {
  const db = await SQLite.openDatabaseAsync('bee-sertao.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

  const porta: SqlDb = {
    exec(sql) { db.execSync(sql); },
    run(sql, params = []) { db.runSync(sql, params as never); },
    all<T>(sql: string, params: unknown[] = []): T[] {
      return db.getAllSync(sql, params as never) as T[];
    },
    transaction(fn) { db.withTransactionSync(fn); },
    async persist() { /* o SQLite nativo já persiste */ },
  };
  // Esquema versionado (feature 003): cria ou migra, sempre pelo mesmo caminho.
  prepararBanco(porta);
  return porta;
}
