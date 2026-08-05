import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import pg from 'pg';
import DatabaseSqlite from 'better-sqlite3';
import type { AppConfig, DbDriver } from '../config.js';

export type Row = Record<string, unknown>;

export interface Database {
  driver(): DbDriver;
  run(sql: string, params?: unknown[]): Promise<void>;
  one(sql: string, params?: unknown[]): Promise<Row | null>;
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  lastInsertId(): Promise<number>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  tableExists(table: string): Promise<boolean>;
  columns(table: string): Promise<string[]>;
  close(): Promise<void>;
}

function rewritePlaceholders(sql: string, driver: DbDriver): string {
  if (driver !== 'pgsql') return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class MysqlDb implements Database {
  constructor(private pool: mysql.Pool) {}
  driver(): DbDriver { return 'mysql'; }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.execute(sql, params as never[]);
  }
  async one(sql: string, params: unknown[] = []): Promise<Row | null> {
    const [rows] = await this.pool.execute(sql, params as never[]);
    const arr = rows as Row[];
    return arr[0] ?? null;
  }
  async all(sql: string, params: unknown[] = []): Promise<Row[]> {
    const [rows] = await this.pool.execute(sql, params as never[]);
    return rows as Row[];
  }
  async lastInsertId(): Promise<number> {
    const row = await this.one('SELECT LAST_INSERT_ID() AS id');
    return Number(row?.id ?? 0);
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn();
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  async tableExists(table: string): Promise<boolean> {
    const row = await this.one(
      'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
      [table],
    );
    return Boolean(row);
  }
  async columns(table: string): Promise<string[]> {
    const rows = await this.all(
      'SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
      [table],
    );
    return rows.map((r) => String(r.name));
  }
  async close(): Promise<void> { await this.pool.end(); }
}

class PgDb implements Database {
  constructor(private pool: pg.Pool) {}
  driver(): DbDriver { return 'pgsql'; }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(rewritePlaceholders(sql, 'pgsql'), params);
  }
  async one(sql: string, params: unknown[] = []): Promise<Row | null> {
    const res = await this.pool.query(rewritePlaceholders(sql, 'pgsql'), params);
    return (res.rows[0] as Row) ?? null;
  }
  async all(sql: string, params: unknown[] = []): Promise<Row[]> {
    const res = await this.pool.query(rewritePlaceholders(sql, 'pgsql'), params);
    return res.rows as Row[];
  }
  async lastInsertId(): Promise<number> {
    const row = await this.one('SELECT lastval() AS id');
    return Number(row?.id ?? 0);
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async tableExists(table: string): Promise<boolean> {
    const row = await this.one(
      `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ? LIMIT 1`,
      [table],
    );
    return Boolean(row);
  }
  async columns(table: string): Promise<string[]> {
    const rows = await this.all(
      `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?`,
      [table],
    );
    return rows.map((r) => String(r.name));
  }
  async close(): Promise<void> { await this.pool.end(); }
}

class SqliteDb implements Database {
  private lastId = 0;
  constructor(private db: DatabaseSqlite.Database) {}
  driver(): DbDriver { return 'sqlite'; }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    const info = this.db.prepare(sql).run(...params);
    this.lastId = Number(info.lastInsertRowid ?? 0);
  }
  async one(sql: string, params: unknown[] = []): Promise<Row | null> {
    return (this.db.prepare(sql).get(...params) as Row) ?? null;
  }
  async all(sql: string, params: unknown[] = []): Promise<Row[]> {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  async lastInsertId(): Promise<number> { return this.lastId; }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async tableExists(table: string): Promise<boolean> {
    const row = await this.one(
      `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`,
      [table],
    );
    return Boolean(row);
  }
  async columns(table: string): Promise<string[]> {
    const rows = await this.all(`PRAGMA table_info(${JSON.stringify(table)})`);
    return rows.map((r) => String(r.name));
  }
  async close(): Promise<void> { this.db.close(); }
}

export async function createDatabase(cfg: AppConfig): Promise<Database> {
  const d = cfg.db;
  if (d.driver === 'sqlite') {
    fs.mkdirSync(path.dirname(d.path), { recursive: true });
    const db = new DatabaseSqlite(d.path);
    db.pragma('foreign_keys = ON');
    return new SqliteDb(db);
  }
  if (d.driver === 'pgsql') {
    const pool = new pg.Pool({
      host: d.host,
      port: d.port,
      database: d.name,
      user: d.user,
      password: d.pass,
    });
    return new PgDb(pool);
  }
  const pool = mysql.createPool({
    host: d.host,
    port: d.port,
    database: d.name,
    user: d.user,
    password: d.pass,
    charset: d.charset,
    namedPlaceholders: false,
  });
  return new MysqlDb(pool);
}
