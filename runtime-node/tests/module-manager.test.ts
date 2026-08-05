import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { createDatabase } from '../src/db/Database.js';
import { runMigrations } from '../src/db/migrate.js';
import { hashPassword } from '../src/auth/password.js';
import { isDangerousPath, scanZip } from '../src/packages/zipSafe.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jasefly-mm-'));
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
let adminToken = '';

function buildTestZip(files: Record<string, string | Uint8Array>): Buffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  }
  return Buffer.from(zipSync(entries));
}

async function loginAdmin(): Promise<string> {
  const login = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Admin123!' }),
  });
  const json = await login.json();
  return json.data.access_token as string;
}

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
  app = await createApp(db, cfg);
  adminToken = await loginAdmin();
});

afterAll(async () => {
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ModuleManager', () => {
  it('health returns 404 for unknown slug', async () => {
    const res = await app.request('/api/v1/admin/modules/no-such-module/health', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('zip path traversal rejected', () => {
    expect(isDangerousPath('../etc/passwd')).toBe(true);
    expect(isDangerousPath('foo/../../bar')).toBe(true);
    expect(isDangerousPath('safe/module.json')).toBe(false);

    const evilZip = buildTestZip({
      '../evil.txt': 'pwned',
      'module.json': '{"slug":"evil","name":"Evil","version":"1.0.0"}',
    });
    const scan = scanZip(evilZip);
    expect(scan.ok).toBe(false);
    expect(scan.errors.some((e) => e.includes('traversal') || e.includes('..'))).toBe(true);
  });

  it('upload rejects traversal zip via API', async () => {
    const evilZip = buildTestZip({
      '../evil.txt': 'pwned',
      'module.json': '{"slug":"evil-mod","name":"Evil","version":"1.0.0"}',
    });
    const res = await app.request('/api/v1/admin/modules/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'evil.zip', base64: evilZip.toString('base64') }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/traversal|Illegal/i);
  });

  it('scan accepts valid test zip', () => {
    const zip = buildTestZip({
      'module.json': '{"slug":"test-widget","name":"Test","version":"1.0.0"}',
      'index.js': 'export {}',
    });
    const scan = scanZip(zip);
    expect(scan.ok).toBe(true);
    expect(scan.entries).toContain('module.json');
  });

  it('uploadBuffer stores valid zip', async () => {
    const { ModulePackageService } = await import('../src/packages/ModulePackageService.js');
    const service = new ModulePackageService(db, cfg.storagePath);
    const zip = buildTestZip({
      'module.json': '{"slug":"test-widget","name":"Test","version":"1.0.0"}',
      'index.js': 'export {}',
    });
    const result = await service.uploadBuffer('test.zip', zip);
    expect(result.package_id).toMatch(/^[a-f0-9]{32}$/);
  });

  it('enable/disable status change', async () => {
    const slug = 'test-widget';
    const manifest = JSON.stringify({ slug, name: 'Test Widget', version: '1.0.0' });
    const zip = buildTestZip({ 'module.json': manifest, 'index.js': 'export {};' });

    const upload = await app.request('/api/v1/admin/modules/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'test.zip', base64: zip.toString('base64') }),
    });
    const uploadJson = await upload.json();
    if (upload.status !== 200) {
      throw new Error(`upload failed: ${JSON.stringify(uploadJson)}`);
    }
    expect(upload.status).toBe(200);
    const packageId = uploadJson.data.package_id as string;

    const install = await app.request(`/api/v1/admin/modules/${slug}/install`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: packageId }),
    });
    expect(install.status).toBe(200);

    const enable = await app.request(`/api/v1/admin/modules/${slug}/enable`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(enable.status).toBe(200);
    expect((await enable.json()).data.status).toBe('enabled');

    let row = await db.one('SELECT status FROM installed_modules WHERE slug=?', [slug]);
    expect(row?.status).toBe('enabled');

    if (await db.tableExists('modules')) {
      const mod = await db.one('SELECT is_enabled FROM modules WHERE name=?', [slug]);
      expect(Number(mod?.is_enabled)).toBe(1);
    }

    const disable = await app.request(`/api/v1/admin/modules/${slug}/disable`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(disable.status).toBe(200);
    expect((await disable.json()).data.status).toBe('disabled');

    row = await db.one('SELECT status FROM installed_modules WHERE slug=?', [slug]);
    expect(row?.status).toBe('disabled');

    if (await db.tableExists('modules')) {
      const mod = await db.one('SELECT is_enabled FROM modules WHERE name=?', [slug]);
      expect(Number(mod?.is_enabled)).toBe(0);
    }

    const list = await app.request('/api/v1/admin/modules', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const items = (await list.json()).data as { slug: string; status: string }[];
    const item = items.find((i) => i.slug === slug);
    expect(item?.status).toBe('disabled');
  });

  it('rollback returns 409 without backup', async () => {
    const slug = 'no-backup-mod';
    await db.run(
      `INSERT INTO installed_modules (slug, name, installed_version, status, source, health_status, data_retention, installed_at, updated_at)
       VALUES (?, ?, '1.0.0', 'installed', 'package', 'unknown', 'preserve', datetime('now'), datetime('now'))`,
      [slug, 'No Backup'],
    );
    const res = await app.request(`/api/v1/admin/modules/${slug}/rollback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('GET /modules/runtime-assets lists enabled packages', async () => {
    const res = await app.request('/api/v1/modules/runtime-assets');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });
});
