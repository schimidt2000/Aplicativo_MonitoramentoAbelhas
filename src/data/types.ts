/**
 * Porta de banco. As implementações vivem em db.native.ts e db.web.ts — o Metro
 * escolhe pela extensão, então sql.js nunca entra no bundle Android.
 * Ver research.md D-001 para por que expo-sqlite não serve no navegador.
 */
export interface SqlDb {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  transaction(fn: () => void): void;
  /** Persiste. No nativo é no-op; na web grava o snapshot em IndexedDB. */
  persist(): Promise<void>;
}

export type { SqlDb as Database };
