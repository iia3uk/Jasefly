/**
 * Architecture proof: unknown ZIP package lifecycle on Node package host.
 * Synthetic slug lives only in this test + fixtures — not in runtime-node/src.
 */
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
import { EventCatalog } from '../src/platform/EventCatalog.js';
import { CapabilityRuntime } from '../src/platform/CapabilityRuntime.js';
import { PackageSurfaceRegistry } from '../src/platform/PackageSurfaceRegistry.js';
import { getJobHandler } from '../src/scheduler/JobHandlerRegistry.js';
import { trashableMap } from '../src/system/helpers.js';
import { contentResources } from '../src/core/permissionMiddleware.js';

const FIXTURE_DIR = path.join(process.cwd(), 'tests/fixtures/modules/zed');
const SYNTHETIC_SLUG = 'zed';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jasefly-zed-'));
const dbPath = path.join(tmp, 'test.sqlite');

const cfg: AppConfig = {
  name: 'JaseflyZedTest',
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

function walkFiles(dir: string, base = dir): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(base, abs).replace(/\\/g, '/');
    if (fs.statSync(abs).isDirectory()) {
      Object.assign(out, walkFiles(abs, base));
    } else {
      out[rel] = fs.readFileSync(abs);
    }
  }
  return out;
}

function buildZedZip(): Buffer {
  const entries = walkFiles(FIXTURE_DIR);
  // Exclude README from runtime package root noise is fine to include
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

function authHeaders() {
  return { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
}

beforeAll(async () => {
  fs.mkdirSync(cfg.storagePath, { recursive: true });
  // Persist ZIP fixture artifact for operators/CI
  const zipBuf = buildZedZip();
  const zipOut = path.join(process.cwd(), 'tests/fixtures/modules/jasefly-module-zed-1.0.0.zip');
  fs.writeFileSync(zipOut, zipBuf);

  db = await createDatabase(cfg);
  await runMigrations(db, { install: true });
  await db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
    'admin@example.com',
    await hashPassword('Admin123!'),
    'Admin',
    'super_admin',
  ]);
  app = await createApp(db, cfg);
  adminToken = await loginAdmin();
});

afterAll(async () => {
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Node package host — synthetic unknown package', () => {
  it('full lifecycle: install → enable → route/asset/discovery → disable → re-enable → uninstall', async () => {
    const slug = SYNTHETIC_SLUG;
    const zip = buildZedZip();

    const upload = await app.request('/api/v1/admin/modules/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ filename: 'jasefly-module-zed-1.0.0.zip', base64: zip.toString('base64') }),
    });
    expect(upload.status).toBe(200);
    const packageId = (await upload.json()).data.package_id as string;

    const install = await app.request(`/api/v1/admin/modules/${slug}/install`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ package_id: packageId }),
    });
    expect(install.status).toBe(200);
    const installJson = await install.json();
    expect(installJson.data.status).toBe('installed');
    expect(installJson.data.migrations?.ok).toBe(true);

    // Migration applied from storage/modules/{slug}/migrations
    const migRows = await db.all('SELECT migration FROM module_migrations WHERE module_slug=?', [slug]);
    expect(migRows.some((r) => String(r.migration) === '001_zed.sql')).toBe(true);
    expect(await db.tableExists('zed_probe')).toBe(true);
    expect(await db.tableExists('zed_items')).toBe(true);

    const enable = await app.request(`/api/v1/admin/modules/${slug}/enable`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(enable.status).toBe(200);
    expect((await enable.json()).data.status).toBe('enabled');

    // Package surface registry — unknown package contributes without host edits
    expect(PackageSurfaceRegistry.trashable()['zed-items']).toBe('zed_items');
    expect(trashableMap()['zed-items']).toBe('zed_items');
    expect(PackageSurfaceRegistry.schemaOwners().zed_items).toBe(slug);
    expect(contentResources()).toContain('zed-items');

    // Route via PlatformContext http facade
    const ping = await app.request(`/api/v1/${slug}/ping`);
    expect(ping.status).toBe(200);
    const pingJson = await ping.json();
    expect(pingJson.data.pong).toBe(true);
    expect(pingJson.data.slug).toBe(slug);
    expect(pingJson.data.capability).toBe(true);
    expect(pingJson.data.declared).toBe(true);

    // Settings SoT (modules.settings) + ACL fail-closed
    const setOk = await app.request(`/api/v1/${slug}/settings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ probe_marker: 'zed-v2' }),
    });
    expect(setOk.status).toBe(200);
    expect((await setOk.json()).data.probe_marker).toBe('zed-v2');
    const ping2 = await (await app.request(`/api/v1/${slug}/ping`)).json();
    expect(ping2.data.settings_marker).toBe('zed-v2');

    const secure = await app.request(`/api/v1/${slug}/secure`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(secure.status).toBe(200);

    const secureAnon = await app.request(`/api/v1/${slug}/secure`);
    expect(secureAnon.status).toBe(401);

    // FE asset from frontend-dist
    const asset = await app.request(`/modules/${slug}/index.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain('zed-frontend-ok');
    expect(asset.headers.get('content-type')).toMatch(/javascript/);

    // Traversal blocked
    const trav = await app.request(`/modules/${slug}/../../../../etc/passwd`);
    expect(trav.status).toBe(404);

    // Dynamic discovery — appears in /site without source whitelist
    const site = await app.request('/api/v1/site');
    expect(site.status).toBe(200);
    const siteJson = await site.json();
    expect(siteJson.data.enabled_plugins).toContain(slug);

    // Event catalog + capability ownership
    expect(EventCatalog.has(`${slug}.ready`)).toBe(true);
    expect(CapabilityRuntime.has(`${slug}.ping`)).toBe(true);
    expect(getJobHandler(`${slug}.tick`)).toBeTypeOf('function');

    const eventsAdmin = await app.request('/api/v1/admin/platform/events', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(eventsAdmin.status).toBe(200);
    const declared = (await eventsAdmin.json()).data.events as { id: string; owner: string }[];
    expect(declared.some((e) => e.id === `${slug}.ready` && e.owner === slug)).toBe(true);

    // Disable clears runtime ownership + unserves
    const disable = await app.request(`/api/v1/admin/modules/${slug}/disable`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(disable.status).toBe(200);

    expect((await app.request(`/api/v1/${slug}/ping`)).status).toBe(404);
    expect((await app.request(`/modules/${slug}/index.js`)).status).toBe(404);
    expect(EventCatalog.has(`${slug}.ready`)).toBe(false);
    expect(CapabilityRuntime.has(`${slug}.ping`)).toBe(false);
    expect(getJobHandler(`${slug}.tick`)).toBeUndefined();

    const siteOff = await (await app.request('/api/v1/site')).json();
    expect(siteOff.data.enabled_plugins).not.toContain(slug);

    // Host still healthy
    expect((await app.request('/api/v1/health')).status).toBe(200);

    // Re-enable restores
    const re = await app.request(`/api/v1/admin/modules/${slug}/enable`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(re.status).toBe(200);
    expect((await app.request(`/api/v1/${slug}/ping`)).status).toBe(200);
    expect((await app.request(`/modules/${slug}/index.js`)).status).toBe(200);
    expect(EventCatalog.has(`${slug}.ready`)).toBe(true);

    // Uninstall
    const uninstall = await app.request(`/api/v1/admin/modules/${slug}/uninstall`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ keep_data: true }),
    });
    expect(uninstall.status).toBe(200);
    expect((await app.request(`/api/v1/${slug}/ping`)).status).toBe(404);
    expect((await app.request(`/modules/${slug}/index.js`)).status).toBe(404);
    expect(EventCatalog.has(`${slug}.ready`)).toBe(false);
    expect((await app.request('/api/v1/health')).status).toBe(200);
  });

  it('production Node source must not hardcode synthetic slug', () => {
    const srcRoot = path.join(process.cwd(), 'src');
    const hit: string[] = [];
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        if (fs.statSync(abs).isDirectory()) walk(abs);
        else if (/\.(ts|js|mjs|json)$/.test(name)) {
          const text = fs.readFileSync(abs, 'utf8');
          // Match slug as product identifier, not accidental substrings in other words
          if (/(['"`/])zed\1|slug['":\s]+zed|modules\/zed|\/zed\//.test(text) || /\bzed\.ping\b|\bzed\.ready\b|\bzed\.tick\b/.test(text)) {
            hit.push(path.relative(srcRoot, abs));
          }
          if (text.includes("'zed'") || text.includes('"zed"') || text.includes('`zed`')) {
            hit.push(path.relative(srcRoot, abs));
          }
        }
      }
    };
    walk(srcRoot);
    expect(hit).toEqual([]);
  });
});
