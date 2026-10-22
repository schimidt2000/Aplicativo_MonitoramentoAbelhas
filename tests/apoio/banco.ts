/**
 * Terceiro driver do `SqlDb`: better-sqlite3, em memória, para os testes.
 *
 * Existe para que o SQL exercitado no CI seja o MESMO que roda no celular. Se
 * os testes usassem um dublê em memória escrito à mão, eles provariam que o
 * dublê funciona, não que o app funciona.
 */
import Database from 'better-sqlite3';
import type { SqlDb } from '@/data/types';
import { prepararBanco } from '@/data/migracoes';

export function bancoDeTeste(): SqlDb {
  const db = new Database(':memory:');
  db.pragma('journal_mode = MEMORY');
  const porta = bancoCru(db);
  prepararBanco(porta);
  return porta;
}

/** O mesmo driver SEM migrar: para os testes de migração montarem bancos antigos. */
export function bancoDeTesteSemMigrar(): SqlDb {
  const db = new Database(':memory:');
  db.pragma('journal_mode = MEMORY');
  return bancoCru(db);
}

function bancoCru(db: Database.Database): SqlDb {
  return {
    exec(sql) { db.exec(sql); },
    run(sql, params = []) { db.prepare(sql).run(...(params as never[])); },
    all<T>(sql: string, params: unknown[] = []): T[] {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    transaction(fn) { db.transaction(fn)(); },
    async persist() { /* em memória */ },
  };
}
