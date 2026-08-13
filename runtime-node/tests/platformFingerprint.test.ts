import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { createDatabase } from '../src/db/Database.js';
import { runMigrations } from '../src/db/migrate.js';
import {
  PLATFORM_FINGERPRINT,
  isWellKnownPath,
  wellKnownBody,
} from '../src/support/platformFingerprint.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.resolve(here, '../../contracts/platform-fingerprint.v1.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
  platform: string;
  http: { header: string; value: string; not_used: string };
  html: { meta_name: string; meta_content: string };
  well_known: {
    path: string;
    body: { platform: string };
    forbidden_keys: string[];
  };
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jasefly-fp-'));
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
  mcpSigningSecret: '',
  mcpAuthMode: 'legacy',
  mcpAllowedIps: '',
  mcpSkewSeconds: 300,
  telegramDeployApprove: '0',
  telegramDeployBotToken: '',
  telegramDeployChatId: '',
  telegramDeployWebhookSecret: '',
  telegramDeployTtlSeconds: 3600,
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
    path: path.join(tmp, 'test.sqlite'),
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
  app = await createApp(db, cfg);
});

afterAll(async () => {
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('platform fingerprint contract', () => {
  it('matches contracts/platform-fingerprint.v1.json', () => {
    expect(PLATFORM_FINGERPRINT.platform).toBe(contract.platform);
    expect(PLATFORM_FINGERPRINT.headerName).toBe(contract.http.header);
    expect(PLATFORM_FINGERPRINT.headerValue).toBe(contract.http.value);
    expect(PLATFORM_FINGERPRINT.generator).toBe(contract.html.meta_content);
    expect(PLATFORM_FINGERPRINT.wellKnownPath).toBe(contract.well_known.path);
    expect(wellKnownBody()).toEqual(contract.well_known.body);
    expect(Object.keys(wellKnownBody())).toEqual(['platform']);
    for (const key of contract.well_known.forbidden_keys) {
      expect(wellKnownBody()).not.toHaveProperty(key);
    }
    expect(contract.http.not_used).toBe('X-Powered-By');
  });

  it('recognizes the well-known path', () => {
    expect(isWellKnownPath('/.well-known/jasefly')).toBe(true);
    expect(isWellKnownPath('/.well-known/jasefly/')).toBe(true);
    expect(isWellKnownPath('/.well-known/acme-challenge/x')).toBe(false);
  });
});

describe('platform fingerprint HTTP (Node)', () => {
  it('GET /.well-known/jasefly returns minimal JSON', async () => {
    const res = await app.request('/.well-known/jasefly');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') || '').toMatch(/application\/json/);
    expect(res.headers.get('x-jasefly')).toBe('1');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('server')).toBeNull();
    const body = await res.json();
    expect(body).toEqual({ platform: 'Jasefly' });
    expect(Object.keys(body)).toEqual(['platform']);
  });

  it('sets X-Jasefly on API responses without X-Powered-By', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-jasefly')).toBe('1');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('server')).toBeNull();
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('sets X-Jasefly on document-root responses without Server/X-Powered-By', async () => {
    const res = await app.request('/');
    expect(res.headers.get('x-jasefly')).toBe('1');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('server')).toBeNull();
  });
});
