/** SSRF guard for outbound webhook URLs (parity with PHP SsrfGuard). */

export function isBlockedHost(host: string): boolean {
  let h = host.toLowerCase().trim();
  if (!h) return true;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (['localhost', '127.0.0.1', '::1'].includes(h)) return true;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  if (h.includes(':')) {
    if (h === '::1') return true;
    if (h.startsWith('fe80:')) return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true;
  }

  return false;
}

export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.hostname !== '' && !isBlockedHost(u.hostname);
  } catch {
    return false;
  }
}
