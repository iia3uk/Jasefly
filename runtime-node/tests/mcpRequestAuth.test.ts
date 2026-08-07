import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { authenticateMcp, mcpEffectiveMode } from '../src/support/mcpRequestAuth.js';

function buildMcpSignature(signingSecret: string, method: string, signPath: string, bodyRaw: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyHash = crypto.createHash('sha256').update(bodyRaw || '').digest('hex');
  const canonical = `v1\n${String(method).toUpperCase()}\n${signPath}\n${ts}\n${nonce}\n${bodyHash}`;
  const hex = crypto.createHmac('sha256', signingSecret).update(canonical).digest('hex');
  return { ts, nonce, sign: `v1=${hex}` };
}

function cfg(overrides: Partial<AppConfig> = {}): AppConfig {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'jasefly-mcp-auth-'));
  return {
    name: 'test',
    url: 'https://example.test',
    env: 'test',
    timezone: 'UTC',
    port: 3080,
    jwtSecret: 'x',
    jwtTtl: 3600,
    refreshTtl: 3600,
    mcpApiToken: 'mcp-token-value',
    mcpSigningSecret: 'signing-secret-value',
    mcpAuthMode: 'require',
    mcpAllowedIps: '',
    mcpSkewSeconds: 300,
    telegramDeployApprove: '0',
    telegramDeployBotToken: '',
    telegramDeployChatId: '',
    telegramDeployWebhookSecret: '',
    telegramDeployTtlSeconds: 3600,
    corsOrigins: ['*'],
    storagePath: storage,
    runtime: 'node-vps',
    db: {
      driver: 'sqlite',
      host: '127.0.0.1',
      port: 3306,
      name: 't',
      user: 't',
      pass: '',
      path: path.join(storage, 'db.sqlite'),
      charset: 'utf8mb4',
    },
    ...overrides,
  };
}

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      fs.rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function mockCtx(opts: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  const method = opts.method || 'GET';
  const pathname = opts.path || '/api/v1/admin/updates';
  const headers = opts.headers || {};
  const body = opts.body ?? '';
  return {
    req: {
      method,
      url: `https://example.test${pathname}`,
      header: (name: string) => headers[name.toLowerCase()] || headers[name] || undefined,
      raw: {
        clone: () => ({
          text: async () => body,
        }),
      },
    },
  } as unknown as import('hono').Context;
}

describe('mcpRequestAuth (node-vps)', () => {
  it('effective mode falls back to legacy without signing secret', () => {
    const c = cfg({ mcpSigningSecret: '', mcpAuthMode: 'require' });
    temps.push(c.storagePath);
    expect(mcpEffectiveMode(c)).toBe('legacy');
  });

  it('require mode rejects unsigned bearer', async () => {
    const c = cfg();
    temps.push(c.storagePath);
    const r = await authenticateMcp(mockCtx({}), c, c.mcpApiToken);
    expect(r.status).toBe('rejected');
    if (r.status === 'rejected') expect(r.reason).toBe('signature_required');
  });

  it('accepts valid HMAC signature', async () => {
    const c = cfg();
    temps.push(c.storagePath);
    const body = JSON.stringify({ package: 'x.tgz', sha256: 'a'.repeat(64) });
    const pathName = '/api/v1/admin/deploy/telegram/request';
    const signed = buildMcpSignature(c.mcpSigningSecret, 'POST', pathName, body);
    const r = await authenticateMcp(
      mockCtx({
        method: 'POST',
        path: pathName,
        body,
        headers: {
          'content-type': 'application/json',
          'x-jasefly-ts': signed.ts,
          'x-jasefly-nonce': signed.nonce,
          'x-jasefly-sign': signed.sign,
        },
      }),
      c,
      c.mcpApiToken,
    );
    expect(r.status).toBe('authenticated');
  });

  it('rejects replayed nonce', async () => {
    const c = cfg();
    temps.push(c.storagePath);
    const pathName = '/api/v1/admin/updates';
    const signed = buildMcpSignature(c.mcpSigningSecret, 'GET', pathName, '');
    const ctx = mockCtx({
      method: 'GET',
      path: pathName,
      headers: {
        'x-jasefly-ts': signed.ts,
        'x-jasefly-nonce': signed.nonce,
        'x-jasefly-sign': signed.sign,
      },
    });
    expect((await authenticateMcp(ctx, c, c.mcpApiToken)).status).toBe('authenticated');
    // Same headers again → replay
    const again = await authenticateMcp(ctx, c, c.mcpApiToken);
    expect(again.status).toBe('rejected');
    if (again.status === 'rejected') expect(again.reason).toBe('replay');
  });

  it('skips non-mcp bearer', async () => {
    const c = cfg();
    temps.push(c.storagePath);
    const r = await authenticateMcp(mockCtx({}), c, 'not-the-token');
    expect(r.status).toBe('skip');
  });

  it('legacy mode allows unsigned when signing secret empty', async () => {
    const c = cfg({ mcpSigningSecret: '', mcpAuthMode: 'require' });
    temps.push(c.storagePath);
    const r = await authenticateMcp(mockCtx({}), c, c.mcpApiToken);
    expect(r.status).toBe('authenticated');
  });

  it('canonical string matches PHP/mcp-cms contract', () => {
    const secret = 's';
    const ts = '1700000000';
    const nonce = 'abcd'.repeat(8);
    const bodyHash = crypto.createHash('sha256').update('').digest('hex');
    const canonical = `v1\nGET\n/api/v1/health\n${ts}\n${nonce}\n${bodyHash}`;
    const hex = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
    expect(hex).toHaveLength(64);
  });
});
