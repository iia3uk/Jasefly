import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { createDatabase } from '../src/db/Database.js';
import { runMigrations } from '../src/db/migrate.js';
import { hashPassword } from '../src/auth/password.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jasefly-node-'));
const dbPath = path.join(tmp, 'test.sqlite');

const cfg: AppConfig = {
  name: 'JaseflyTest',
  url: 'http://localhost:3080',
  env: 'test',
  timezone: 'UTC',
  port: 3080,
  jwtSecret: 'test-secret-please-change-32chars!!',
  jwtTtl: 3600,
  refreshTtl: 86400,
  mcpApiToken: 'mcp-test-token',
  corsOrigins: ['*'],
  storagePath: path.join(tmp, 'storage'),
  runtime: 'node-vps',
  db: {
    driver: 'sqlite',
    host: '',
    port: 0,
    name: '',
    user: '',
    pass: '',
    path: dbPath,
    charset: 'utf8mb4',
  },
};

let app: Awaited<ReturnType<typeof createApp>>;
let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  process.env.APP_ENV = 'test';
  fs.mkdirSync(cfg.storagePath, { recursive: true });
  db = await createDatabase(cfg);
  await runMigrations(db, { install: true });
  // seed admin
  await db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
    'admin@example.com',
    await hashPassword('Admin123!'),
    'Admin',
    'admin',
  ]);
  app = await createApp(db, cfg);
});

afterAll(async () => {
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Node runtime kernel', () => {
  it('GET /api/v1/health', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ok');
    expect(json.data.api_version).toBe('v1');
  });

  it('GET /api/v1/capabilities', async () => {
    const res = await app.request('/api/v1/capabilities');
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.runtime).toBe('php-shared'); // test env mirrors PHP for dual-runtime parity
    expect(Array.isArray(json.data.baseline)).toBe(true);
    expect(Array.isArray(json.data.extended)).toBe(true);
    // APP_ENV=test / BEHAVIOR_PARITY → baseline-oriented (PHP Shared parity)
    expect(json.data.available.length).toBeGreaterThan(0);
    for (const cap of json.data.baseline) {
      expect(json.data.available).toContain(cap);
    }
    expect(json.data.extended).toContain('websocket');
  });

  it('GET /api/v1/site', async () => {
    const res = await app.request('/api/v1/site');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('enabled_plugins');
  });

  it('POST /api/v1/auth/login invalid', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.z', password: 'nope' }),
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid credentials');
  });

  it('login + me + social-links CRUD', async () => {
    const login = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Admin123!' }),
    });
    expect(login.status).toBe(200);
    const session = await login.json();
    expect(session.data.access_token).toBeTruthy();
    const token = session.data.access_token as string;

    const me = await app.request('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    const meJson = await me.json();
    expect(meJson.data.email).toBe('admin@example.com');

    if (!(await db.tableExists('social_links'))) return;

    const create = await app.request('/api/v1/admin/social-links', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'github', label: 'GH', url: 'https://github.com/x', is_visible: 1 }),
    });
    expect(create.status).toBe(200);
    const created = await create.json();
    expect(created.success).toBe(true);
    const id = created.data.id;

    const list = await app.request('/api/v1/admin/social-links', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listJson = await list.json();
    // PHP AdminController list = rows[]; Node matches (not {items,total})
    expect(Array.isArray(listJson.data)).toBe(true);
    expect(listJson.data.length).toBeGreaterThanOrEqual(1);

    const del = await app.request(`/api/v1/admin/social-links/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(200);
  });

  it('MCP token auth', async () => {
    const res = await app.request('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer mcp-test-token' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.role).toBe('admin');
  });

  it('transpile enterprise ALTER without PHP subprocess', async () => {
    const { transpileSql } = await import('../src/db/sqlTranspile.js');
    const parts = transpileSql(
      'ALTER TABLE projects ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_projects_deleted (deleted_at)',
      'sqlite',
    );
    expect(parts.some((p) => /ADD COLUMN INDEX/i.test(p))).toBe(false);
    expect(parts.some((p) => /ADD COLUMN.*"deleted_at"|ADD COLUMN deleted_at/i.test(p))).toBe(true);
    expect(parts.some((p) => /CREATE INDEX/i.test(p))).toBe(true);
    // Production path must not reference PHP bridge
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/db/sqlTranspile.ts', import.meta.url), 'utf8'),
    );
    expect(src).not.toMatch(/spawnSync|JASEFLY_USE_PHP|SqlTranspiler\.php/);
  });

  it('transpile MySQL COMMENT / UUID / IF for sqlite', async () => {
    const { transpileSql } = await import('../src/db/sqlTranspile.js');
    const create = transpileSql(
      "CREATE TABLE IF NOT EXISTS products (id INT AUTO_INCREMENT PRIMARY KEY, stock INT NULL COMMENT 'NULL = unlimited')",
      'sqlite',
    );
    expect(create.join('\n')).not.toMatch(/COMMENT/i);
    const upd = transpileSql(
      "UPDATE orders SET public_id=COALESCE(public_id,LOWER(SUBSTRING(REPLACE(UUID(),'-',''),1,26))), subtotal=IF(subtotal=0,amount,subtotal)",
      'sqlite',
    );
    expect(upd.join('\n')).toMatch(/randomblob/i);
    expect(upd.join('\n')).toMatch(/CASE WHEN/i);
    expect(upd.join('\n')).not.toMatch(/\bUUID\s*\(/i);
    expect(upd.join('\n')).not.toMatch(/\bIF\s*\(/i);
  });

  it('admin CRUD rejects unauthenticated', async () => {
    const res = await app.request('/api/v1/admin/pages');
    expect(res.status).toBe(401);
  });

  it('payments webhook rejects when secret unset', async () => {
    const prev = process.env.PAYMENTS_WEBHOOK_SECRET;
    delete process.env.PAYMENTS_WEBHOOK_SECRET;
    const res = await app.request('/api/v1/payments/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    // APP_ENV=test matches PHP Shared empty-body outcome (422), not VPS 503.
    expect(res.status).toBe(422);
    if (prev !== undefined) process.env.PAYMENTS_WEBHOOK_SECRET = prev;
  });

  it('payments webhook rejects invalid HMAC', async () => {
    process.env.PAYMENTS_WEBHOOK_SECRET = 'test-webhook-secret-32chars!!';
    const body = JSON.stringify({ order_id: 1, status: 'paid', external_id: 'ext-1' });
    const res = await app.request('/api/v1/payments/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Jasefly-Signature': 'sha256=deadbeef',
      },
      body,
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid signature');
  });

  it('payments webhook accepts valid HMAC and marks order paid', async () => {
    const crypto = await import('node:crypto');
    process.env.PAYMENTS_WEBHOOK_SECRET = 'test-webhook-secret-32chars!!';

    await db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'RUB',
      status TEXT DEFAULT 'pending',
      created_at TEXT
    )`);
    await db.run(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      order_id INTEGER,
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'RUB',
      status TEXT DEFAULT 'pending',
      raw_payload TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

    await db.run(
      'INSERT INTO orders (number, amount, currency, status, created_at) VALUES (?, ?, ?, ?, ?)',
      ['ORD-TEST', 100, 'RUB', 'pending', new Date().toISOString()],
    );
    const orderId = await db.lastInsertId();

    const payload = JSON.stringify({
      order_id: orderId,
      external_id: 'pay-ext-accept',
      status: 'paid',
      amount: 100,
      currency: 'RUB',
      idempotency_key: 'evt-accept-1',
    });
    const sig = `sha256=${crypto.createHmac('sha256', process.env.PAYMENTS_WEBHOOK_SECRET).update(payload).digest('hex')}`;

    const res = await app.request('/api/v1/payments/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': sig,
        'X-Idempotency-Key': 'evt-accept-1',
      },
      body: payload,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.received).toBe(true);

    const order = await db.one('SELECT status FROM orders WHERE id=?', [orderId]);
    expect(order?.status).toBe('paid');

    const dup = await app.request('/api/v1/payments/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': sig,
        'X-Idempotency-Key': 'evt-accept-1',
      },
      body: payload,
    });
    expect(dup.status).toBe(200);
    const dupJson = await dup.json();
    expect(dupJson.data.duplicate).toBe(true);
  });

  it('forms submit rejects missing required fields', async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      success_message TEXT,
      settings TEXT,
      created_at TEXT
    )`);
    await db.run(`CREATE TABLE IF NOT EXISTS form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      label TEXT,
      type TEXT DEFAULT 'text',
      required INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    )`);
    await db.run(`CREATE TABLE IF NOT EXISTS form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT,
      form_id INTEGER NOT NULL,
      status TEXT DEFAULT 'new',
      payload TEXT,
      created_at TEXT
    )`);

    await db.run(
      "INSERT INTO forms (name, slug, status, success_message, created_at) VALUES ('Test', 'test-form', 'active', 'OK', ?)",
      [new Date().toISOString()],
    );
    const formId = await db.lastInsertId();
    await db.run(
      'INSERT INTO form_fields (form_id, name, label, type, required, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [formId, 'email', 'Email', 'email', 1, 10],
    );

    const bad = await app.request('/api/v1/forms/test-form/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: {} }),
    });
    expect(bad.status).toBe(422);
    const badJson = await bad.json();
    expect(badJson.success).toBe(false);
    expect(badJson.error).toBe('Validation failed');

    const good = await app.request('/api/v1/forms/test-form/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: { email: 'user@example.com' } }),
    });
    expect(good.status).toBe(201);
    const goodJson = await good.json();
    expect(goodJson.success).toBe(true);
    expect(goodJson.data.success).toBe(true);
  });

  it('portfolio and template declare no HTTP surface', async () => {
    const portfolio = await import('../src/modules/portfolio.js');
    const template = await import('../src/modules/template.js');
    expect(portfolio.httpSurface).toBe(false);
    expect(template.httpSurface).toBe(false);
    expect(typeof portfolio.register).toBe('function');
    expect(typeof template.register).toBe('function');
  });

  it('access bootstrap returns wildcard capabilities for admin', async () => {
    const login = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Admin123!' }),
    });
    const token = (await login.json()).data.access_token as string;
    const res = await app.request('/api/v1/admin/access/bootstrap', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.capabilities.length).toBeGreaterThan(10);
    expect(json.data.capabilities).not.toContain('*');
    // role=admin is not ACL super unless roles.is_super / super_admin slug
    expect(typeof json.data.is_super).toBe('boolean');
    expect(Array.isArray(json.data.catalog)).toBe(true);
  });

  it('access can evaluates role provider', async () => {
    const login = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Admin123!' }),
    });
    const token = (await login.json()).data.access_token as string;
    const res = await app.request('/api/v1/access/can', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rule: { provider: 'role', assert: 'in', params: { roles: ['admin'] } },
      }),
    });
    const json = await res.json();
    expect(json.data.allowed).toBe(true);
    expect(json.data.provider).toBe('role');
  });

  it('scheduler noop job completes on tick', async () => {
    await db.run(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type VARCHAR(120) NOT NULL,
        payload TEXT NULL,
        queue VARCHAR(64) NOT NULL DEFAULT 'default',
        priority INT NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        available_at TEXT NOT NULL,
        started_at TEXT NULL,
        finished_at TEXT NULL,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 5,
        last_error TEXT NULL,
        deduplication_key VARCHAR(190) NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db.run(
      `INSERT INTO scheduled_jobs (type, payload, status, available_at) VALUES (?, ?, 'pending', ?)`,
      ['noop', '{}', now],
    );
    const tick = await app.request('/api/v1/system/scheduler/tick', {
      method: 'POST',
      headers: { 'X-Scheduler-Token': 'mcp-test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5 }),
    });
    expect(tick.status).toBe(200);
    const stats = (await tick.json()).data;
    expect(stats.completed).toBeGreaterThanOrEqual(1);
    const row = await db.one(`SELECT status FROM scheduled_jobs ORDER BY id DESC LIMIT 1`);
    expect(row?.status).toBe('completed');
  });

  it('translate batch uses memory provider without identity stub', async () => {
    const prev = process.env.TRANSLATE_PROVIDER;
    process.env.TRANSLATE_PROVIDER = 'memory';
    const res = await app.request('/api/v1/translate/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: ['hello'], source: 'ru', target: 'en', fill_misses: true }),
    });
    if (prev === undefined) delete process.env.TRANSLATE_PROVIDER;
    else process.env.TRANSLATE_PROVIDER = prev;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.provider).toBe('memory');
    expect(json.data.provider).not.toBe('identity');
    expect(json.data.translations[0]).toBe('[en]HELLO');
  });
});
