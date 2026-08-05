import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isBlockedHost,
  isBlockedIp,
  isSafeHttpUrl,
  resolvePublicIp,
  safeFetch,
  setDnsLookupForTests,
} from '../src/support/ssrfGuard.js';

afterEach(() => {
  setDnsLookupForTests(null);
});

describe('ssrfGuard', () => {
  it('blocks loopback / link-local / private IPv4', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('10.0.0.5')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedHost('localhost')).toBe(true);
  });

  it('resolvePublicIp rejects private literals', async () => {
    expect(await resolvePublicIp('127.0.0.1')).toBeNull();
    expect(await resolvePublicIp('::1')).toBeNull();
    expect(await resolvePublicIp('169.254.169.254')).toBeNull();
    expect(await resolvePublicIp('10.1.2.3')).toBeNull();
  });

  it('isSafeHttpUrl rejects private URLs', async () => {
    expect(await isSafeHttpUrl('http://127.0.0.1/admin')).toBe(false);
    expect(await isSafeHttpUrl('http://[::1]/')).toBe(false);
    expect(await isSafeHttpUrl('http://169.254.169.254/latest')).toBe(false);
    expect(await isSafeHttpUrl('http://192.168.0.1/x')).toBe(false);
    expect(await isSafeHttpUrl('ftp://example.com/x')).toBe(false);
  });

  it('allows public HTTPS after DNS resolve to public IP', async () => {
    setDnsLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }]);
    expect(await isSafeHttpUrl('https://example.com/hook')).toBe(true);
    expect(await resolvePublicIp('example.com')).toBe('93.184.216.34');
  });

  it('DNS rebind: public then private fails resolve', async () => {
    setDnsLookupForTests(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    // First public IP wins for pin — still OK for isSafeHttpUrl
    expect(await resolvePublicIp('rebind.test')).toBe('93.184.216.34');

    setDnsLookupForTests(async () => [{ address: '127.0.0.1', family: 4 }]);
    expect(await resolvePublicIp('rebind.test')).toBeNull();
    expect(await isSafeHttpUrl('https://rebind.test/x')).toBe(false);
  });

  it('blocks redirect hop to private IP', async () => {
    setDnsLookupForTests(async (hostname) => {
      if (hostname === 'evil.local') return [{ address: '127.0.0.1', family: 4 }];
      return [{ address: '93.184.216.34', family: 4 }];
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('public.example')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://evil.local/meta' },
        });
      }
      return new Response('ok', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      safeFetch('https://public.example/start', { method: 'POST', body: '{}', timeoutMs: 2000 }),
    ).rejects.toThrow(/SSRF/);

    vi.unstubAllGlobals();
  });
});
