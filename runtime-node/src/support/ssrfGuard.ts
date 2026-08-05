/** SSRF guard for outbound webhook URLs (parity with PHP SsrfGuard / OutboundHttp). */

import dns from 'node:dns/promises';
import net from 'node:net';

export type LookupFn = (
  hostname: string,
  options: { all: true; verbatim: boolean },
) => Promise<Array<{ address: string; family: number }>>;

let lookupImpl: LookupFn = (hostname, options) => dns.lookup(hostname, options);

/** Test-only DNS injection (DNS rebind simulation). */
export function setDnsLookupForTests(fn: LookupFn | null): void {
  lookupImpl = fn ?? ((hostname, options) => dns.lookup(hostname, options));
}

export function isBlockedIp(ip: string): boolean {
  const h = ip.toLowerCase().trim();
  if (!h) return true;
  if (net.isIP(h) === 4) {
    const parts = h.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIP(h) === 6) {
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('fe80:') || h.startsWith('fec0:')) return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true;
    // IPv4-mapped
    const mapped = h.match(/^:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true;
}

/** Lexical host blocklist (no DNS). Private literal IPs + localhost names. */
export function isBlockedHost(host: string): boolean {
  let h = host.toLowerCase().trim();
  if (!h) return true;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (['localhost', 'metadata.google.internal'].includes(h)) return true;
  if (net.isIP(h)) return isBlockedIp(h);
  return false;
}

/**
 * Resolve host to a single public IP for connect pinning (anti DNS-rebinding).
 */
export async function resolvePublicIp(host: string): Promise<string | null> {
  let h = host.toLowerCase().trim();
  if (!h) return null;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (net.isIP(h)) {
    return isBlockedIp(h) ? null : h;
  }
  if (isBlockedHost(h)) return null;
  try {
    const results = await lookupImpl(h, { all: true, verbatim: true });
    const publicIps = results.map((r) => r.address).filter((a) => !isBlockedIp(a));
    return publicIps[0] ?? null;
  } catch {
    return null;
  }
}

export async function isSafeHttpUrl(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (!u.hostname) return false;
    const ip = await resolvePublicIp(u.hostname);
    return ip !== null;
  } catch {
    return false;
  }
}

const MAX_REDIRECTS = 3;

export type SafeFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRedirects?: number;
};

/**
 * Outbound fetch with DNS pin semantics: resolve → block private → revalidate every redirect hop.
 * Does not follow fetch auto-redirects (redirect: manual).
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!(await isSafeHttpUrl(current))) {
      throw new Error(`SSRF blocked URL: ${current}`);
    }
    const u = new URL(current);
    const pinIp = await resolvePublicIp(u.hostname);
    if (!pinIp) {
      throw new Error(`SSRF blocked host: ${u.hostname}`);
    }
    // Re-check pin after resolve (DNS rebind between checks).
    if (isBlockedIp(pinIp)) {
      throw new Error(`SSRF blocked resolved IP: ${pinIp}`);
    }

    const res = await fetch(current, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        throw new Error(`Redirect without Location from ${current}`);
      }
      if (hop === maxRedirects) {
        throw new Error(`Too many redirects (>${maxRedirects})`);
      }
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error('SSRF redirect loop');
}
