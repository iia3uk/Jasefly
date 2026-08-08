/**
 * Safe static serving of package frontend-dist assets under /modules/{slug}/*.
 * Path jail + enabled-only. No slug whitelist.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Context } from 'hono';
import type { Database } from '../db/Database.js';
import { fail } from '../http/envelope.js';
import { ModulePaths, isDangerousPath } from './ModulePaths.js';

const MIME: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

function assetsRoot(paths: ModulePaths, slug: string): string {
  const dist = path.join(paths.moduleRoot(slug), 'frontend-dist');
  if (fs.existsSync(dist) && fs.statSync(dist).isDirectory()) return dist;
  return paths.moduleRoot(slug);
}

export async function isPackageAssetServable(db: Database, slug: string): Promise<boolean> {
  if (!(await db.tableExists('installed_modules'))) return false;
  const row = await db.one(
    `SELECT status, health_status FROM installed_modules WHERE slug=? LIMIT 1`,
    [slug],
  );
  if (!row) return false;
  if (String(row.status ?? '') !== 'enabled') return false;
  const health = String(row.health_status ?? '');
  if (health === 'quarantined' || health === 'failed') return false;
  return true;
}

export async function serveModuleAsset(
  c: Context,
  db: Database,
  storagePath: string,
  slug: string,
  assetPath: string,
): Promise<Response> {
  const paths = new ModulePaths(storagePath);
  try {
    paths.assertSlug(slug);
  } catch {
    return fail(c, 'Not found', 404);
  }

  if (!(await isPackageAssetServable(db, slug))) {
    return fail(c, 'Not found', 404);
  }

  const rel = String(assetPath ?? '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
  if (!rel || isDangerousPath(rel) || rel.includes('\0')) {
    return fail(c, 'Not found', 404);
  }

  const root = assetsRoot(paths, slug);
  const abs = path.resolve(root, ...rel.split('/'));
  try {
    paths.assertContained(root, abs);
  } catch {
    return fail(c, 'Not found', 404);
  }

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return fail(c, 'Not found', 404);
  }

  const body = fs.readFileSync(abs);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': guessMime(abs),
      'Cache-Control': 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** List enabled package slugs for site/runtime discovery (registry SoT). */
export async function listEnabledInstalledPackageSlugs(db: Database): Promise<string[]> {
  if (!(await db.tableExists('installed_modules'))) return [];
  const rows = await db.all(
    `SELECT slug FROM installed_modules
     WHERE status='enabled'
       AND COALESCE(health_status,'') NOT IN ('failed','quarantined')
       AND COALESCE(source,'package') != 'bundled'
     ORDER BY slug ASC`,
  );
  return rows.map((r) => String(r.slug ?? '')).filter(Boolean);
}

export function registerModuleAssetRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: { get: (path: string, ...handlers: any[]) => unknown },
  db: Database,
  storagePath: string,
): void {
  app.get('/modules/:slug/*', async (c: Context) => {
    const slug = String(c.req.param('slug') ?? '');
    if (!slug) return fail(c, 'Not found', 404);
    const pathname = new URL(c.req.url).pathname;
    const prefix = `/modules/${slug}/`;
    const rel = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
    return serveModuleAsset(c, db, storagePath, slug, decodeURIComponent(rel));
  });
}
