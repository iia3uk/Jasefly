import type { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

/**
 * Public, non-sensitive platform identity for CMS/framework detectors.
 * Parity with PHP App\Support\PlatformFingerprint.
 *
 * X-Powered-By is not used (PHP strips it to hide runtime versions).
 */
export const PLATFORM_FINGERPRINT = {
  platform: 'Jasefly',
  headerName: 'X-Jasefly',
  headerValue: '1',
  generator: 'Jasefly',
  wellKnownPath: '/.well-known/jasefly',
} as const;

export function wellKnownBody(): { platform: 'Jasefly' } {
  return { platform: PLATFORM_FINGERPRINT.platform };
}

export function isWellKnownPath(path: string): boolean {
  const normalized = '/' + path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalized === PLATFORM_FINGERPRINT.wellKnownPath;
}

export function platformFingerprintMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header(PLATFORM_FINGERPRINT.headerName, PLATFORM_FINGERPRINT.headerValue);
  };
}

export function registerPlatformFingerprint(app: Hono<any>): void {
  app.get(PLATFORM_FINGERPRINT.wellKnownPath, (c) => {
    c.header('Cache-Control', 'public, max-age=86400, must-revalidate');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header(PLATFORM_FINGERPRINT.headerName, PLATFORM_FINGERPRINT.headerValue);
    return c.json(wellKnownBody());
  });
}
