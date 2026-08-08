import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPlatformContext, clearPackageOwnership } from '../src/platform/sdk.js';
import type { AppConfig } from '../src/config.js';
import { createDatabase } from '../src/db/Database.js';
import { runMigrations } from '../src/db/migrate.js';
import { EventBus } from '../src/platform/events.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jasefly-settings-'));
const dbPath = path.join(tmp, 'settings.sqlite');

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

let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  fs.mkdirSync(cfg.storagePath, { recursive: true });
  db = await createDatabase(cfg);
  await runMigrations(db, { install: true });
  await db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, 1, ?)', [
    'probe-mod',
    JSON.stringify({ alpha: 1, beta: 'keep' }),
  ]);
  await db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, 1, ?)', [
    'mail',
    JSON.stringify({ from_email: 'a@b.c' }),
  ]);
});

afterAll(async () => {
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('PlatformSettings bag + key parity', () => {
  it('get bag, get key, set key, set patch, getModule', async () => {
    const routes = new Map<string, unknown>();
    const routeTable = {
      get: (k: string) => routes.get(k),
      set: (k: string, v: unknown) => routes.set(k, v),
      has: (k: string) => routes.has(k),
    };
    const ctx = createPlatformContext({
      db,
      events: new EventBus(),
      cfg,
      slug: 'probe-mod',
      app: { get: () => {}, post: () => {}, put: () => {}, delete: () => {} },
      apiPrefixes: ['/api/v1'],
      isActive: () => true,
      routes: routeTable as never,
    });

    const settings = ctx.settings();
    const bag = await settings.get();
    expect(bag).toMatchObject({ alpha: 1, beta: 'keep' });
    expect(await settings.get('alpha', 0)).toBe(1);
    expect(await settings.get('missing', 'fallback')).toBe('fallback');
    expect(await settings.all()).toMatchObject({ alpha: 1 });

    await settings.set('gamma', true);
    expect(await settings.get('gamma')).toBe(true);

    await settings.set({ beta: 'updated', delta: 2 });
    expect(await settings.get('beta')).toBe('updated');
    expect(await settings.get('delta')).toBe(2);

    const mailBag = await settings.getModule('mail');
    expect(mailBag).toMatchObject({ from_email: 'a@b.c' });
    expect(await settings.getModule('mail', 'from_email', '')).toBe('a@b.c');

    clearPackageOwnership('probe-mod');
  });
});
