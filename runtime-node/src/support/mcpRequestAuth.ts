/**
 * Dual-secret MCP auth for Node (parity with PHP McpRequestAuth).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../config.js';
import type { Context } from 'hono';

export type McpAuthResult =
  | { status: 'authenticated' }
  | { status: 'rejected'; reason: string }
  | { status: 'skip'; reason: string };

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function mcpEffectiveMode(cfg: AppConfig): 'legacy' | 'prefer' | 'require' {
  let mode = String(cfg.mcpAuthMode || 'legacy').toLowerCase();
  if (!['legacy', 'prefer', 'require'].includes(mode)) mode = 'legacy';
  if (!cfg.mcpSigningSecret) return 'legacy';
  return mode as 'legacy' | 'prefer' | 'require';
}

export async function authenticateMcp(
  c: Context,
  cfg: AppConfig,
  bearer: string,
): Promise<McpAuthResult> {
  const token = cfg.mcpApiToken || '';
  if (!token || !bearer || !timingSafeEqualStr(token, bearer)) {
    return { status: 'skip', reason: 'not_mcp' };
  }

  const signingSecret = cfg.mcpSigningSecret || '';
  const mode = mcpEffectiveMode(cfg);
  const skew = Math.max(30, Number(cfg.mcpSkewSeconds || 300));

  if (!ipAllowed(clientIp(c), cfg.mcpAllowedIps || '')) {
    return { status: 'rejected', reason: 'ip_denied' };
  }

  const ts = String(c.req.header('X-Jasefly-Ts') || '').trim();
  const nonce = String(c.req.header('X-Jasefly-Nonce') || '').trim();
  const sign = String(c.req.header('X-Jasefly-Sign') || '').trim();
  const hasSig = Boolean(ts && nonce && sign);

  if (!hasSig) {
    if (mode === 'require') return { status: 'rejected', reason: 'signature_required' };
    if (mode === 'prefer') console.warn('McpRequestAuth: unsigned MCP Bearer accepted (prefer mode)');
    return { status: 'authenticated' };
  }

  if (!signingSecret) {
    if (mode === 'require') return { status: 'rejected', reason: 'signing_not_configured' };
    return { status: 'authenticated' };
  }

  if (!/^\d+$/.test(ts)) return { status: 'rejected', reason: 'bad_ts' };
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > skew) {
    return { status: 'rejected', reason: 'skew' };
  }
  if (!/^[a-fA-F0-9]{32,128}$/.test(nonce)) return { status: 'rejected', reason: 'bad_nonce' };

  const contentType = String(c.req.header('content-type') || '').toLowerCase();
  let bodyRaw = '';
  if (!contentType.includes('multipart/form-data')) {
    try {
      bodyRaw = await c.req.raw.clone().text();
    } catch {
      bodyRaw = '';
    }
  }
  const bodyHash = crypto.createHash('sha256').update(bodyRaw).digest('hex');
  const url = new URL(c.req.url);
  const signPath = `${url.pathname}${url.search || ''}`;
  const canonical = `v1\n${c.req.method.toUpperCase()}\n${signPath}\n${ts}\n${nonce.toLowerCase()}\n${bodyHash}`;
  const expected = `v1=${crypto.createHmac('sha256', signingSecret).update(canonical).digest('hex')}`;
  if (!timingSafeEqualStr(expected, sign)) return { status: 'rejected', reason: 'bad_signature' };

  const claimed = claimNonce(cfg, nonce.toLowerCase(), Number(ts) + skew + 60);
  if (claimed === 'replay') return { status: 'rejected', reason: 'replay' };
  if (claimed === 'unavailable') return { status: 'rejected', reason: 'nonce_store_unavailable' };

  return { status: 'authenticated' };
}

function clientIp(c: Context): string {
  const trusted = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip');
  if (trusted && /^[\d.:a-fA-F]+$/.test(trusted)) return trusted;
  return '0.0.0.0';
}

function ipAllowed(ip: string, allowlist: string): boolean {
  const list = allowlist.trim();
  if (!list) return true;
  return list.split(/[\s,;]+/).filter(Boolean).some((entry) => entry === ip);
}

function claimNonce(cfg: AppConfig, nonce: string, expiresAt: number): 'ok' | 'replay' | 'unavailable' {
  const dir = path.join(cfg.storagePath, 'mcp_nonces');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return 'unavailable';
  }
  const file = path.join(dir, `${crypto.createHash('sha256').update(nonce).digest('hex')}.nonce`);
  if (fs.existsSync(file)) {
    const prev = Number(fs.readFileSync(file, 'utf8').trim() || 0);
    if (prev >= Math.floor(Date.now() / 1000)) return 'replay';
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
  try {
    const fd = fs.openSync(file, 'wx');
    fs.writeFileSync(fd, String(expiresAt));
    fs.closeSync(fd);
    return 'ok';
  } catch {
    return 'replay';
  }
}
