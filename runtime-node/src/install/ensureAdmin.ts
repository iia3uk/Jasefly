/**
 * First-admin bootstrap for Node VPS (parity with PHP install.php admin step).
 * Creates a super_admin only when the users table is empty and credentials are provided.
 */
import type { Database } from '../db/Database.js';
import { hashPassword } from '../auth/password.js';
import { seedPlatformPlugins } from '../plugins/pluginState.js';
import { seedPlatformDefaults } from './seedPlatformDefaults.js';

export type EnsureAdminResult =
  | { ok: true; created: false; reason: string }
  | { ok: true; created: true; email: string }
  | { ok: false; error: string };

export async function ensureFirstAdmin(
  db: Database,
  opts?: { email?: string; password?: string; name?: string },
): Promise<EnsureAdminResult> {
  if (!(await db.tableExists('users'))) {
    return { ok: false, error: 'users table missing — run migrations with --install first' };
  }

  // Always ensure CMS shell plugins exist (idempotent; does not disable others).
  await seedPlatformPlugins(db);
  // OOB site name + SEO about Jasefly (fills empty fields only).
  await seedPlatformDefaults(db);

  const countRow = await db.one('SELECT COUNT(*) AS n FROM users');
  const n = Number(countRow?.n ?? 0);
  if (n > 0) {
    return { ok: true, created: false, reason: 'users_already_exist' };
  }

  const email = String(opts?.email ?? process.env.ADMIN_EMAIL ?? '')
    .trim()
    .toLowerCase();
  const password = String(opts?.password ?? process.env.ADMIN_PASSWORD ?? '');
  const name = String(opts?.name ?? process.env.ADMIN_NAME ?? 'Administrator').trim() || 'Administrator';

  if (!email || !password) {
    return {
      ok: true,
      created: false,
      reason: 'ADMIN_EMAIL/ADMIN_PASSWORD not set — skip first-admin bootstrap',
    };
  }
  if (password.length < 12) {
    return { ok: false, error: 'ADMIN_PASSWORD must be at least 12 characters (same as install.php)' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'ADMIN_EMAIL is not a valid email' };
  }

  const hash = await hashPassword(password);
  await db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
    email,
    hash,
    name,
    'super_admin',
  ]);

  return { ok: true, created: true, email };
}
