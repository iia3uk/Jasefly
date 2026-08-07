import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { DeployTelegramApprove } from '../src/support/DeployTelegramApprove.js';

function tmpCfg(overrides: Partial<AppConfig> = {}): AppConfig {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'jasefly-tg-'));
  return {
    name: 'test',
    url: 'https://example.test',
    env: 'test',
    timezone: 'UTC',
    port: 3080,
    jwtSecret: 'x',
    jwtTtl: 3600,
    refreshTtl: 3600,
    mcpApiToken: '',
    mcpSigningSecret: '',
    mcpAuthMode: 'legacy',
    mcpAllowedIps: '',
    mcpSkewSeconds: 300,
    telegramDeployApprove: '1',
    telegramDeployBotToken: '123456:TEST-BOT',
    telegramDeployChatId: '998877',
    telegramDeployWebhookSecret: 'webhook-secret-value-xyz',
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

describe('DeployTelegramApprove (node-vps)', () => {
  it('enabled / configured / assertConfigured', () => {
    const off = tmpCfg({ telegramDeployApprove: '0' });
    temps.push(off.storagePath);
    const on = tmpCfg();
    temps.push(on.storagePath);
    expect(DeployTelegramApprove.enabled(off)).toBe(false);
    expect(DeployTelegramApprove.enabled(on)).toBe(true);
    expect(DeployTelegramApprove.configured(off)).toBe(true);
    expect(DeployTelegramApprove.configured(tmpCfg({ telegramDeployChatId: '' }))).toBe(false);
    expect(() =>
      DeployTelegramApprove.assertConfigured(tmpCfg({ telegramDeployChatId: '' })),
    ).toThrow(/TELEGRAM_DEPLOY/);
  });

  it('webhook rejects bad secret and wrong chat', async () => {
    const cfg = tmpCfg();
    temps.push(cfg.storagePath);
    const svc = new DeployTelegramApprove(cfg);
    const bad = await svc.handleWebhook('wrong', JSON.stringify({ callback_query: { id: '1' } }));
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('bad_secret');

    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    try {
      const denied = await svc.handleWebhook(
        'webhook-secret-value-xyz',
        JSON.stringify({
          callback_query: {
            id: '2',
            data: 'dapp:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            message: { chat: { id: 111 }, message_id: 2 },
            from: { id: 111 },
          },
        }),
      );
      expect(denied.ok).toBe(false);
      expect(denied.error).toBe('chat_denied');
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('approve → redeem once; replay approve rejected', () => {
    const cfg = tmpCfg();
    temps.push(cfg.storagePath);
    const svc = new DeployTelegramApprove(cfg);
    const id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const dir = path.join(cfg.storagePath, 'updates', 'pending');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${id}.json`),
      JSON.stringify({
        id,
        package: 'release.tgz',
        sha256: 'a'.repeat(64),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        status: 'pending',
        requested_by: 'mcp',
        message_id: null,
        chat_id: cfg.telegramDeployChatId,
        runtime: 'node-vps',
      }),
    );

    const approved = svc.approve(id, 'admin');
    expect(approved.approved).toBe(true);
    expect(() => svc.approve(id, 'admin')).toThrow(/обработан/);

    const redeemed = svc.redeem({ deploy_id: id });
    expect(redeemed.redeemed).toBe(true);
    expect(() => svc.redeem({ deploy_id: id })).toThrow(/redeemed/);
  });

  it('statusPublic never leaks secrets', () => {
    const cfg = tmpCfg();
    temps.push(cfg.storagePath);
    const pub = new DeployTelegramApprove(cfg).statusPublic();
    const json = JSON.stringify(pub);
    expect(pub.enabled).toBe(true);
    expect(pub.configured).toBe(true);
    expect(json).not.toContain('TEST-BOT');
    expect(json).not.toContain('webhook-secret');
  });

  it('reject marks rejected', () => {
    const cfg = tmpCfg();
    temps.push(cfg.storagePath);
    const svc = new DeployTelegramApprove(cfg);
    const id = 'cccccccccccccccccccccccccccccccc';
    const dir = path.join(cfg.storagePath, 'updates', 'pending');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${id}.json`),
      JSON.stringify({
        id,
        package: 'x.tgz',
        sha256: 'b'.repeat(64),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        status: 'pending',
        requested_by: 'admin',
        message_id: null,
        chat_id: cfg.telegramDeployChatId,
        runtime: 'node-vps',
      }),
    );
    const rej = svc.reject(id, 'admin');
    expect(rej.status).toBe('rejected');
  });
});
