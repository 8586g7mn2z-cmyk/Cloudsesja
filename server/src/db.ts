// Cienka warstwa nad bazą danych. Cała logika aplikacji korzysta wyłącznie z metod
// all/get/run/tx, a zapytania używają standardowego SQL z parametrami `?`.
// Przejście na PostgreSQL sprowadza się do napisania drugiej implementacji tej klasy
// (zamiana `?` na `$n`, `lastInsertRowid` na `RETURNING id`).
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.js';

export type Row = Record<string, any>;
export type Param = string | number | null | bigint | Uint8Array;

export class Db {
  private conn: DatabaseSync;
  private depth = 0;
  private stmtCache = new Map<string, any>();

  constructor(file: string) {
    this.conn = new DatabaseSync(file);
    this.conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  }

  private stmt(sql: string) {
    let s = this.stmtCache.get(sql);
    if (!s) {
      s = this.conn.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  }

  private norm(params: any[]): Param[] {
    return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
  }

  all<T = Row>(sql: string, ...params: any[]): T[] {
    return this.stmt(sql).all(...this.norm(params)) as T[];
  }

  get<T = Row>(sql: string, ...params: any[]): T | undefined {
    return this.stmt(sql).get(...this.norm(params)) as T | undefined;
  }

  run(sql: string, ...params: any[]): { changes: number; id: number } {
    const r = this.stmt(sql).run(...this.norm(params));
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  }

  exec(sql: string) {
    this.conn.exec(sql);
  }

  /** Wstawia wiersz z obiektu; zwraca id. */
  insert(table: string, data: Row): number {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    return this.run(sql, ...keys.map((k) => data[k])).id;
  }

  /** Aktualizuje wiersz o podanym id polami z obiektu. */
  update(table: string, id: number, data: Row) {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    if (!keys.length) return;
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    this.run(sql, ...keys.map((k) => data[k]), id);
  }

  tx<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth++;
      try {
        return fn();
      } finally {
        this.depth--;
      }
    }
    this.conn.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    try {
      const r = fn();
      this.conn.exec('COMMIT');
      return r;
    } catch (e) {
      this.conn.exec('ROLLBACK');
      throw e;
    } finally {
      this.depth = 0;
    }
  }

  migrate() {
    this.conn.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    const done = new Set(this.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version));
    for (const m of migrations) {
      if (done.has(m.version)) continue;
      this.tx(() => {
        this.conn.exec(m.sql);
        if (m.run) m.run(this);
        this.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', m.version, new Date().toISOString());
      });
    }
  }

  close() {
    this.conn.close();
  }
}
