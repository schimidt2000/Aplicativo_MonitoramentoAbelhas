/**
 * O `SqlDb` sobre sql.js, rodando em Node. É o mesmo SQLite em WASM do app de
 * campo no navegador (sql.js 1.14.2, SQLite 3.49.1), com a mesma transação por
 * BEGIN/COMMIT de `src/data/db.web.ts` — sem o IndexedDB, que não existe aqui.
 *
 * Existe para a migração (feature 003) ser exercitada no SQLite do navegador,
 * e não só no better-sqlite3, que é bem mais novo.
 */
import initSqlJs from 'sql.js';
import type { SqlDb } from '@/data/types';

export async function bancoSqlJsSemMigrar(): Promise<SqlDb> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return {
    exec(sql) { db.exec(sql); },
    run(sql, params = []) { db.run(sql, params as never); },
    all<T>(sql: string, params: unknown[] = []): T[] {
      const stmt = db.prepare(sql);
      stmt.bind(params as never);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      stmt.free();
      return out;
    },
    transaction(fn) {
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async persist() { /* em memória */ },
  };
}
