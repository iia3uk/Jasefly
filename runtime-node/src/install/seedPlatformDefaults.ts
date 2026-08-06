/**
 * Idempotent OOB platform defaults (site name + SEO) for Node VPS / local Docker.
 * Mirrors backend/migrations/clean_base_seed.php SEO — fills only empty fields.
 */
import type { Database } from '../db/Database.js';

const SINGLETONS = [
  'site_settings',
  'theme_settings',
  'seo_settings',
  'footer_settings',
  'hero_settings',
  'contact_info',
  'email_settings',
] as const;

const SEO = {
  site_title: 'Jasefly',
  site_description:
    'AI-first dual-runtime платформа для сайтов и агентов: Page Builder, модули и MCP. PHP на shared-хостинге или Node на VPS.',
  site_keywords:
    'jasefly, cms, page builder, mcp, dual runtime, php, react, node, модули, агенты',
  og_title: 'Jasefly — платформа для сайтов и агентов',
  og_description:
    'Page Builder, модули и MCP в одном ядре. Shared-хостинг или Node VPS — без лишней инфраструктуры.',
  twitter_card: 'summary_large_image',
  twitter_title: 'Jasefly — платформа для сайтов и агентов',
  twitter_description:
    'AI-first dual-runtime платформа: билдер страниц, модули и MCP для агентов.',
  robots_txt: 'User-agent: *\nAllow: /\n',
  target_regions: JSON.stringify(['CIS', 'EU', 'USA', 'ASIA']),
  structured_data_json: JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'Jasefly',
        description:
          'AI-first dual-runtime платформа для сайтов и агентов: Page Builder, модули и MCP.',
        publisher: { '@type': 'Organization', name: 'Jasefly' },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Jasefly',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        description:
          'Dual-runtime CMS/platform (PHP shared + Node VPS) with Page Builder and MCP for agents.',
      },
    ],
  }),
};

function blank(v: unknown): boolean {
  return !String(v ?? '').trim();
}

export async function seedPlatformDefaults(db: Database): Promise<{ seeded: boolean }> {
  let seeded = false;

  for (const table of SINGLETONS) {
    if (!(await db.tableExists(table))) continue;
    const row = await db.one(`SELECT id FROM ${table} WHERE id = 1 LIMIT 1`);
    if (!row) {
      await db.run(`INSERT INTO ${table} (id) VALUES (1)`);
      seeded = true;
    }
  }

  if (await db.tableExists('site_settings')) {
    const site = await db.one('SELECT site_name, locale, timezone FROM site_settings WHERE id = 1');
    if (site && (blank(site.site_name) || String(site.site_name) === 'Portfolio')) {
      await db.run(
        `UPDATE site_settings SET site_name = ?, locale = COALESCE(NULLIF(TRIM(locale), ''), ?), timezone = COALESCE(NULLIF(TRIM(timezone), ''), ?) WHERE id = 1`,
        ['Jasefly', 'ru', 'Europe/Moscow'],
      );
      seeded = true;
    } else if (site && blank(site.locale)) {
      await db.run(`UPDATE site_settings SET locale = ? WHERE id = 1`, ['ru']);
      seeded = true;
    }
  }

  if (await db.tableExists('seo_settings')) {
    const seo = await db.one(
      'SELECT site_title, site_description, og_title, robots_txt, target_regions, structured_data_json FROM seo_settings WHERE id = 1',
    );
    if (seo && (blank(seo.site_title) || blank(seo.site_description))) {
      await db.run(
        `UPDATE seo_settings SET
          site_title = ?,
          site_description = ?,
          site_keywords = ?,
          og_title = ?,
          og_description = ?,
          twitter_card = ?,
          twitter_title = ?,
          twitter_description = ?,
          robots_txt = COALESCE(NULLIF(TRIM(robots_txt), ''), ?),
          target_regions = COALESCE(target_regions, ?),
          structured_data_json = COALESCE(structured_data_json, ?)
        WHERE id = 1`,
        [
          SEO.site_title,
          SEO.site_description,
          SEO.site_keywords,
          SEO.og_title,
          SEO.og_description,
          SEO.twitter_card,
          SEO.twitter_title,
          SEO.twitter_description,
          SEO.robots_txt,
          SEO.target_regions,
          SEO.structured_data_json,
        ],
      );
      seeded = true;
    }
  }

  if (await db.tableExists('footer_settings')) {
    const footer = await db.one('SELECT copyright_text, tagline FROM footer_settings WHERE id = 1');
    if (footer && blank(footer.copyright_text) && blank(footer.tagline)) {
      // Keep footer visually empty OOB (SiteLayout hides empty footer); only soft defaults if both blank — skip tagline.
      await db.run(`UPDATE footer_settings SET show_social = 0 WHERE id = 1`);
    }
  }

  if (await db.tableExists('pages')) {
    const home = await db.one(
      `SELECT id, seo_title, seo_description FROM pages WHERE is_home = 1 OR slug = '__home' LIMIT 1`,
    );
    if (home && (blank(home.seo_title) || blank(home.seo_description))) {
      await db.run(
        `UPDATE pages SET
          seo_title = COALESCE(NULLIF(TRIM(seo_title), ''), ?),
          seo_description = COALESCE(NULLIF(TRIM(seo_description), ''), ?),
          title = COALESCE(NULLIF(TRIM(title), ''), 'Главная')
        WHERE id = ?`,
        [
          'Jasefly — платформа для сайтов и агентов',
          SEO.site_description,
          home.id,
        ],
      );
      seeded = true;
    }
  }

  return { seeded };
}
