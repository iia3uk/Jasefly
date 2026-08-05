/** Outbound JSON POST with SSRF guard (parity with PHP OutboundHttp). */

import { safeFetch } from './ssrfGuard.js';

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 10_000,
): Promise<boolean> {
  try {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const res = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: payload,
      timeoutMs,
    });
    return res.ok;
  } catch {
    return false;
  }
}
