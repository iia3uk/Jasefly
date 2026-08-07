import type { Context } from 'hono';
import type { Database } from '../db/Database.js';
import { fail, ok } from '../http/envelope.js';
import { runMigrations } from '../db/migrate.js';
import { listEnabledPlugins } from '../plugins/pluginState.js';
import { NODE_MODULE_NAMES } from './moduleNames.js';

async function singleton(db: Database, table: string) {
  if (!(await db.tableExists(table))) return null;
  return db.one(`SELECT * FROM ${table} LIMIT 1`);
}

/**
 * PHP ModuleRegistry discovery order. Only names present in modules.is_enabled=1
 * (plus core system/users) are returned — default-off when no row.
 */
const PHP_PLUGIN_ORDER = [
  'module-manager',
  'system',
  'demo',
  'scheduler',
  'overload',
  'access',
  'ddos',
  'users',
  'automation',
  'notifications',
  'content',
  'media',
  'portfolio',
  'projects',
  'forms',
  'newsletter',
  'blog',
  'registration',
  'comments',
  'mail',
  'support',
  'translate',
  'analytics',
  'webhooks',
  'orders',
  'payments',
  'products',
  'lab',
  'seo',
] as const;

function pluginOn(plugins: string[], name: string): boolean {
  return plugins.includes(name);
}

async function normalizePage(row: Record<string, unknown> | null) {
  if (!row) return null;
  const out: Record<string, unknown> = { ...row };
  if (typeof out.layout_json === 'string' && out.layout_json) {
    try {
      out.layout = JSON.parse(String(out.layout_json));
    } catch {
      out.layout = null;
    }
  } else if (!('layout' in out)) {
    out.layout = null;
  }
  // PHP PublicController::normalizePage — boolean is_home
  out.is_home = Number(out.is_home ?? 0) === 1;
  if (!('og_image' in out)) out.og_image = null;
  return out;
}

export async function siteHandler(c: Context, db: Database) {
  try {
    await runMigrations(db).catch(() => undefined);
  } catch {
    /* ignore */
  }

  const catalog = PHP_PLUGIN_ORDER.filter((n) => (NODE_MODULE_NAMES as readonly string[]).includes(n));
  const plugins = await listEnabledPlugins(db, catalog);
  const portfolioOn = pluginOn(plugins, 'portfolio');
  const translateOn = pluginOn(plugins, 'translate');

  const navTable = (await db.tableExists('navigation_items')) ? 'navigation_items' : null;
  let navigation: unknown[] = [];
  let footerNav: unknown[] = [];
  if (navTable) {
    const del = (await db.columns(navTable)).includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
    navigation = await db
      .all(
        `SELECT * FROM ${navTable} WHERE is_visible=1 AND location IN ('header','both')${del} ORDER BY sort_order ASC, id ASC`,
      )
      .catch(() => []);
    footerNav = await db
      .all(
        `SELECT * FROM ${navTable} WHERE is_visible=1 AND location IN ('footer','both')${del} ORDER BY sort_order ASC, id ASC`,
      )
      .catch(() => []);
  }

  let social: unknown[] = [];
  if (await db.tableExists('social_links')) {
    social = await db
      .all('SELECT * FROM social_links WHERE is_visible=1 ORDER BY sort_order ASC, id ASC')
      .catch(() => []);
  }

  let homePage: unknown = null;
  if (await db.tableExists('pages')) {
    const raw = await db
      .one(`SELECT * FROM pages WHERE is_home=1 AND status='published' LIMIT 1`)
      .catch(() => db.one(`SELECT * FROM pages WHERE is_home=1 LIMIT 1`));
    homePage = await normalizePage(raw as Record<string, unknown> | null);
  }

  let lazyLoader: unknown = null;
  if (await db.tableExists('pages')) {
    const raw = await db
      .one(`SELECT * FROM pages WHERE slug='lazy-loader' LIMIT 1`)
      .catch(() => null);
    lazyLoader = await normalizePage(raw as Record<string, unknown> | null);
  }

  let hero: unknown = null;
  if (portfolioOn) {
    const h = (await singleton(db, 'hero_settings')) || {};
    hero = { ...h, background: (h as { background?: unknown }).background ?? null };
  }

  let homepageSections: unknown[] = [];
  if (portfolioOn && (await db.tableExists('homepage_sections'))) {
    homepageSections = await db
      .all('SELECT * FROM homepage_sections WHERE is_visible=1 ORDER BY sort_order ASC, id ASC')
      .catch(() => db.all('SELECT * FROM homepage_sections ORDER BY sort_order ASC, id ASC').catch(() => []));
  }

  const seoRow = (await singleton(db, 'seo_settings')) || {};
  let seo: unknown = Array.isArray(seoRow) ? seoRow : seoRow && Object.keys(seoRow).length ? seoRow : [];
  if (seo && typeof seo === 'object' && !Array.isArray(seo)) {
    const row = { ...(seo as Record<string, unknown>) };
    // PHP json-decodes target_regions; SQLite may store the JSON string.
    if (typeof row.target_regions === 'string') {
      try {
        const decoded = JSON.parse(row.target_regions);
        if (Array.isArray(decoded)) row.target_regions = decoded;
      } catch {
        /* keep string */
      }
    }
    seo = row;
  }

  return ok(c, {
    site_settings: await singleton(db, 'site_settings'),
    theme: await singleton(db, 'theme_settings'),
    seo,
    navigation,
    footer_nav: footerNav,
    footer: await singleton(db, 'footer_settings'),
    social,
    hero,
    homepage_sections: homepageSections,
    home_page: homePage,
    lazy_loader_page: lazyLoader,
    portfolio: portfolioOn
      ? {
          homepage_template: 'classic',
          show_blog: true,
          show_services: true,
          show_testimonials: true,
        }
      : null,
    translate: translateOn
      ? {
          widget_enabled: true,
          auto_warmup: true,
          geo_auto_lang: true,
          source_lang: 'ru',
          languages: ['en', 'de', 'fr', 'es'],
          position: 'bottom-right',
          provider: 'memory',
          cache_ready: false,
          content_hash: '',
          mode: 'cache',
          visitor_country: null,
          suggested_lang: 'en',
          geo_via: 'neutral-en',
        }
      : null,
    enabled_plugins: plugins,
  });
}

export async function healthHandler(c: Context) {
  return ok(c, {
    status: 'ok',
    time: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'),
    api_version: 'v1',
  });
}

export function notFound(c: Context) {
  return fail(c, 'Not found', 404);
}
