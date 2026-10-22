/**
 * Driver web: sql.js (SQLite em WASM) com snapshot em IndexedDB.
 *
 * Por que não expo-sqlite aqui: cinco modos de falha medidos, dois fatais —
 * `crossOriginIsolated` é false porque enhanceMiddleware não aplica COOP/COEP
 * ao documento (expo/expo#38481), e resultados acima de 255 bytes corrompem
 * (expo/expo#45186). Ver research.md D-001.
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type { SqlDb } from './types';
import { prepararBanco } from './migracoes';

const DB_NAME = 'bee-sertao';
const STORE = 'snapshot';
const KEY = 'db';

function abrirIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lerSnapshot(): Promise<Uint8Array | null> {
  try {
    const idb = await abrirIdb();
    return await new Promise((resolve) => {
      const tx = idb.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Uint8Array) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    // Aba anônima ou armazenamento bloqueado: degrada para memória.
    return null;
  }
}

/**
 * Ao contrário da leitura, a gravação NÃO degrada em silêncio: se ela falha, o
 * que está só na memória some ao fechar a aba, e o apicultor precisa saber
 * (`executarColeta` transforma a rejeição no aviso "não consegui salvar").
 *
 * `duravel`: só conclui depois de o navegador gravar no disco
 * (`durability: 'strict'`). No padrão, Chrome e Firefox podem dar a transação
 * por concluída antes disso. É o que `persist()` pede: a coleta pelo cabo só
 * confirma à placa — que então apaga o arquivo — depois dele (feature 005,
 * D-502). A gravação de fundo fica no padrão, mais barato.
 */
async function gravarSnapshot(bytes: Uint8Array, duravel = false): Promise<void> {
  const idb = await abrirIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = duravel
        ? idb.transaction(STORE, 'readwrite', { durability: 'strict' })
        : idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb-erro'));
      // Cota estourada aborta a transação sem passar por onerror.
      tx.onabort = () => reject(tx.error ?? new Error('idb-abortou'));
    });
  } finally {
    idb.close();
  }
}

export async function abrirBanco(): Promise<SqlDb> {
  const SQL = await initSqlJs({
    locateFile: (f: string) => `/${f}`,
  });

  const anterior = await lerSnapshot();
  const db: SqlJsDatabase = anterior ? new SQL.Database(anterior) : new SQL.Database();

  let pendente: ReturnType<typeof setTimeout> | null = null;
  // Dentro de uma transação não agendamos nada: exportar o banco a cada linha
  // domina o custo de ingestão. Agenda-se uma vez, no commit.
  let emTransacao = false;
  const agendarPersistencia = () => {
    if (emTransacao) return;
    if (pendente) clearTimeout(pendente);
    pendente = setTimeout(() => {
      pendente = null;
      // Gravação de fundo é cortesia; quem precisa saber se gravou chama persist().
      gravarSnapshot(db.export()).catch(() => {});
    }, 400);
  };

  const porta: SqlDb = {
    exec(sql) {
      db.exec(sql);
      agendarPersistencia();
    },
    run(sql, params = []) {
      db.run(sql, params as never);
      agendarPersistencia();
    },
    all<T>(sql: string, params: unknown[] = []): T[] {
      const stmt = db.prepare(sql);
      stmt.bind(params as never);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      stmt.free();
      return out;
    },
    transaction(fn) {
      emTransacao = true;
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        emTransacao = false;
      }
      agendarPersistencia();
    },
    async persist() {
      if (pendente) {
        clearTimeout(pendente);
        pendente = null;
      }
      await gravarSnapshot(db.export(), true);
    },
  };
  // Esquema versionado (feature 003): cria ou migra, sempre pelo mesmo caminho.
  // A migração termina agendando a gravação do snapshot, como qualquer escrita.
  prepararBanco(porta);
  return porta;
}
