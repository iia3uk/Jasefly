/**
 * Plugin enable resolution for Node — parity with PHP PluginStateService
 * after default-off change:
 *  - system/users always on
 *  - missing modules row → off
 *  - explicit is_enabled=1 → on
 */
import type { Database } from '../db/Database.js';

export const CORE_PLUGINS = new Set(['system', 'users']);

/** Seeded ON at first install so CMS shell (pages/media/seo) works without toggling. */
export const PLATFORM_DEFAULT_ON = ['system', 'users', 'content', 'media', 'seo'] as const;

export async function isModuleEnabled(db: Database, name: string): Promise<boolean> {
  if (CORE_PLUGINS.has(name)) return true;
  if (!(await db.tableExists('modules'))) return false;
  const row = await db.one('SELECT is_enabled FROM modules WHERE name=?', [name]);
  if (row == null) return false;
  return Number(row.is_enabled) === 1;
}

/** Ensure platform shell rows exist (idempotent). Does not disable anything. */
export async function seedPlatformPlugins(db: Database): Promise<string[]> {
  if (!(await db.tableExists('modules'))) return [];
  const created: string[] = [];
  for (const name of PLATFORM_DEFAULT_ON) {
    const row = await db.one('SELECT name FROM modules WHERE name=?', [name]);
    if (row) continue;
    await db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, 1, NULL)', [name]);
    created.push(name);
  }
  return created;
}

export async function listEnabledPlugins(db: Database, orderedNames: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const name of orderedNames) {
    if (await isModuleEnabled(db, name)) out.push(name);
  }
  // Core always present even if catalog order missed them
  for (const core of CORE_PLUGINS) {
    if (!out.includes(core)) out.unshift(core);
  }
  return out;
}
