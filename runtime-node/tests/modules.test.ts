import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { createDatabase } from '../src/db/Database.js';
import { runMigrations } from '../src/db/migrate.js';
import { hashPassword } from '../src/auth/password.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jasefly-modules-'));
const dbPath = path.join(tmp, 'test.sqlite');

const cfg: AppConfig = {
  name: 'JaseflyModulesTest',
  url: 'http://localhost:3081',
  env: 'test',
  timezone: 'UTC',
  port: 3081,
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
let adminToken = '';

beforeAll(async () => {
  fs.mkdirSync(cfg.storagePath, { recursive: true });
  db = await createDatabase(cfg);
  await runMigrations(db, { install: true });
  await db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
    'admin@example.com',
    await hashPassword('Admin123!'),
    'Admin',
    'admin',
  ]);

  await db.run(`CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NULL,
    confirm_token_hash TEXT NULL,
    confirmed_at TEXT NULL,
    created_at TEXT
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'comment',
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NULL,
    message TEXT NOT NULL,
    ip_address TEXT NULL,
    created_at TEXT
  )`);

  app = await createApp(db, cfg);

  const login = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Admin123!' }),
  });
  adminToken = (await login.json()).data.access_token as string;
});

afterAll(async () => {
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('deepened Node modules', () => {
  it('media upload writes file under storage/media and DB row', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');

    const res = await app.request('/api/v1/admin/media', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.path).toMatch(/^media\//);
    expect(Number(json.data.size_bytes ?? json.data.size ?? 0)).toBeGreaterThan(0);

    const rel = String(json.data.path);
    const abs = path.join(cfg.storagePath, rel);
    expect(fs.existsSync(abs)).toBe(true);

    const row = await db.one('SELECT * FROM media WHERE id=?', [json.data.id]);
    expect(row).toBeTruthy();
    expect(String(row?.original_name ?? row?.filename)).toContain('pixel');
  });

  it('users list never returns password_hash', async () => {
    const res = await app.request('/api/v1/admin/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const users = Array.isArray(json.data) ? json.data : json.data?.items ?? [];
    expect(users.length).toBeGreaterThanOrEqual(1);
    for (const user of users) {
      expect(user).not.toHaveProperty('password_hash');
    }
  });

  it('newsletter subscribe inserts subscriber row', async () => {
    const res = await app.request('/api/v1/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sub@example.com', name: 'Sub' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.ok).toBe(true);

    const row = await db.one('SELECT * FROM subscribers WHERE email=?', ['sub@example.com']);
    expect(row).toBeTruthy();
    expect(String(row?.status)).toBe('pending');
  });

  it('comments create stores pending comment', async () => {
    const res = await app.request('/api/v1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_type: 'page',
        target_id: 1,
        author_name: 'Visitor',
        body: 'Nice post',
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.status).toBe('pending');

    const row = await db.one('SELECT * FROM comments WHERE id=?', [json.data.id]);
    expect(String(row?.body)).toBe('Nice post');
    expect(String(row?.status)).toBe('pending');
  });

  it('registration creates user without exposing password hash', async () => {
    if (await db.tableExists('modules')) {
      await db.run(
        `INSERT INTO modules (name, is_enabled, settings) VALUES ('registration', 1, ?)
         ON CONFLICT(name) DO UPDATE SET settings=excluded.settings, is_enabled=1`,
        [JSON.stringify({ registration_enabled: true, min_password_length: 8 })],
      );
    }
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newuser@example.com',
        password: 'SecurePass1!',
        name: 'New User',
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe('newuser@example.com');
    expect(json.data.user).not.toHaveProperty('password_hash');

    const row = await db.one('SELECT * FROM users WHERE email=?', ['newuser@example.com']);
    expect(row?.password_hash).toBeTruthy();
    expect(String(row?.password_hash)).not.toBe('SecurePass1!');
  });

  it('mail contact inserts contact_messages row', async () => {
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com',
        message: 'Hello from test',
      }),
    });
    expect(res.status).toBe(201);
    const row = await db.one('SELECT * FROM contact_messages WHERE email=?', ['alice@example.com']);
    expect(String(row?.message)).toBe('Hello from test');
  });
});
