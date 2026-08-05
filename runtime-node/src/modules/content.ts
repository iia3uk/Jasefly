import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { ok, fail } from '../http/envelope.js';
import { notDeletedClause } from './_helpers.js';

export const name = 'content';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const ADMIN_RESOURCES = [
  'social-links',
  'statistics',
  'experience',
  'education',
  'skill-categories',
  'skills',
  'blog-categories',
  'blog-tags',
  'testimonials',
  'navigation',
  'homepage-sections',
  'pages',
  'services',
] as const;

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/pages/:slug`, async (c) => {
      const slug = c.req.param('slug');
      if (!(await ctx.db.tableExists('pages'))) return fail(c, 'Not found', 404);
      const del = await notDeletedClause(ctx.db, 'pages');
      const cols = await ctx.db.columns('pages');
      const statusFilter = cols.includes('status') ? " AND status='published'" : '';
      const row = await ctx.db.one(`SELECT * FROM pages WHERE slug=?${statusFilter}${del} LIMIT 1`, [slug]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.get(`${p}/projects`, async (c) => {
      if (!(await ctx.db.tableExists('projects'))) return ok(c, []);
      const del = await notDeletedClause(ctx.db, 'projects');
      const items = await ctx.db.all(`SELECT * FROM projects WHERE 1=1${del} ORDER BY id DESC`);
      return ok(c, items);
    });

    ctx.app.get(`${p}/projects/:slug`, async (c) => {
      const row = await ctx.db.one('SELECT * FROM projects WHERE slug=? LIMIT 1', [c.req.param('slug')]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.get(`${p}/services`, async (c) => {
      if (!(await ctx.db.tableExists('services'))) return ok(c, []);
      const del = await notDeletedClause(ctx.db, 'services');
      const cols = await ctx.db.columns('services');
      const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
      return ok(c, await ctx.db.all(`SELECT * FROM services WHERE 1=1${vis}${del} ORDER BY sort_order, id`));
    });

    ctx.app.get(`${p}/profile`, async (c) => {
      if (!(await ctx.db.tableExists('profile'))) return ok(c, null);
      const row = await ctx.db.one('SELECT * FROM profile LIMIT 1');
      return ok(c, row);
    });

    ctx.app.get(`${p}/statistics`, async (c) => {
      if (!(await ctx.db.tableExists('statistics'))) return ok(c, []);
      const cols = await ctx.db.columns('statistics');
      const vis = cols.includes('is_visible') ? ' WHERE is_visible=1' : '';
      return ok(c, await ctx.db.all(`SELECT * FROM statistics${vis} ORDER BY sort_order, id`));
    });

    ctx.app.get(`${p}/experience`, async (c) => {
      if (!(await ctx.db.tableExists('experience'))) return ok(c, []);
      const del = await notDeletedClause(ctx.db, 'experience');
      const cols = await ctx.db.columns('experience');
      const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
      const rows = await ctx.db.all(`SELECT * FROM experience WHERE 1=1${vis}${del} ORDER BY sort_order, start_date DESC`);
      for (const row of rows) {
        if (typeof row.technologies === 'string' && row.technologies.trim()) {
          try {
            row.technologies = JSON.parse(row.technologies);
          } catch {
            row.technologies = [];
          }
        }
      }
      return ok(c, rows);
    });

    ctx.app.get(`${p}/education`, async (c) => {
      if (!(await ctx.db.tableExists('education'))) return ok(c, []);
      const cols = await ctx.db.columns('education');
      const vis = cols.includes('is_visible') ? ' WHERE is_visible=1' : '';
      return ok(c, await ctx.db.all(`SELECT * FROM education${vis} ORDER BY sort_order, id`));
    });

    ctx.app.get(`${p}/skills`, async (c) => {
      if (!(await ctx.db.tableExists('skill_categories'))) return ok(c, []);
      const catDel = await notDeletedClause(ctx.db, 'skill_categories');
      const skillDel = await notDeletedClause(ctx.db, 'skills');
      const catCols = await ctx.db.columns('skill_categories');
      const catVis = catCols.includes('is_visible') ? ' AND is_visible=1' : '';
      const categories = await ctx.db.all(
        `SELECT * FROM skill_categories WHERE 1=1${catVis}${catDel} ORDER BY sort_order, id`,
      );
      for (const category of categories) {
        const skillCols = await ctx.db.columns('skills');
        const skillVis = skillCols.includes('is_visible') ? ' AND is_visible=1' : '';
        category.skills = await ctx.db.all(
          `SELECT * FROM skills WHERE category_id=?${skillVis}${skillDel} ORDER BY sort_order, id`,
          [category.id],
        );
      }
      return ok(c, categories);
    });

    ctx.app.get(`${p}/testimonials`, async (c) => {
      if (!(await ctx.db.tableExists('testimonials'))) return ok(c, []);
      const del = await notDeletedClause(ctx.db, 'testimonials');
      const cols = await ctx.db.columns('testimonials');
      const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
      return ok(c, await ctx.db.all(`SELECT * FROM testimonials WHERE 1=1${vis}${del} ORDER BY sort_order, id`));
    });

    ctx.app.get(`${p}/contact-info`, async (c) => {
      if (!(await ctx.db.tableExists('contact_info'))) return ok(c, null);
      return ok(c, await ctx.db.one('SELECT * FROM contact_info LIMIT 1'));
    });

    ctx.app.get(`${p}/robots.txt`, async (c) => {
      const seo = (await ctx.db.tableExists('seo_settings'))
        ? await ctx.db.one('SELECT robots_txt, canonical_base_url FROM seo_settings LIMIT 1')
        : null;
      let body = seo?.robots_txt ? String(seo.robots_txt) : '';
      if (!body) {
        const base = String(seo?.canonical_base_url || ctx.cfg.url).replace(/\/$/, '');
        const site = (await ctx.db.tableExists('site_settings'))
          ? await ctx.db.one('SELECT * FROM site_settings LIMIT 1')
          : null;
        const adminBase = String(
          (site as { admin_base_path?: string } | null)?.admin_base_path || 'admin',
        )
          .replace(/^\/+|\/+$/g, '')
          .trim() || 'admin';
        const disallow = ['Disallow: /admin', 'Disallow: /api/'];
        if (adminBase !== 'admin') disallow.push(`Disallow: /${adminBase}`);
        body = `User-agent: *\nAllow: /\n${disallow.join('\n')}\nSitemap: ${base}/sitemap.xml\n`;
      }
      return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    });

    ctx.app.get(`${p}/sitemap.xml`, async (c) => {
      const seo = (await ctx.db.tableExists('seo_settings'))
        ? await ctx.db.one('SELECT canonical_base_url FROM seo_settings LIMIT 1')
        : null;
      const base = String(seo?.canonical_base_url || ctx.cfg.url).replace(/\/$/, '');
      // Seed enables all known plugins except template — match PHP SitemapService gates.
      const portfolioOn = true;
      const blogOn = true;
      const productsOn = true;

      type UrlEntry = { loc: string; priority: string; lastmod?: string | null };
      const urls: UrlEntry[] = [
        { loc: `${base}/`, priority: '1.0' },
        { loc: `${base}/privacy`, priority: '0.3' },
      ];

      const excludeSlugs = new Set([
        '__home',
        'privacy',
        'not-found',
        'admin-login',
        'register',
        'lazy-loader',
        'maintenance',
        'payment',
        'payment-success',
        'payment-fail',
        'product-card',
        'product-detail',
        'product-detail-simple',
        'product-detail-storefront',
        'product-detail-marketplace',
        'product-detail-digital',
        'product-detail-landing',
        'projects',
        'services',
      ]);

      if (await ctx.db.tableExists('pages')) {
        const rows = await ctx.db.all(
          "SELECT slug, updated_at, published_at FROM pages WHERE status='published' AND is_home=0",
        );
        for (const p of rows) {
          const slug = String(p.slug ?? '');
          if (!slug || slug.startsWith('__') || excludeSlugs.has(slug)) continue;
          if (slug === 'blog' && !blogOn) continue;
          if ((slug === 'projects' || slug === 'services') && !portfolioOn) continue;
          const lastmod = String(p.updated_at ?? p.published_at ?? '').slice(0, 10);
          urls.push({
            loc: `${base}/${slug.replace(/^\//, '')}`,
            lastmod: lastmod || null,
            priority: '0.5',
          });
        }
      }

      if (portfolioOn) {
        urls.push({ loc: `${base}/projects`, priority: '0.9' });
        urls.push({ loc: `${base}/services`, priority: '0.8' });
        if (await ctx.db.tableExists('projects')) {
          for (const p of await ctx.db.all(
            "SELECT slug, updated_at, published_at FROM projects WHERE status='published'",
          )) {
            const lastmod = String(p.updated_at ?? p.published_at ?? '').slice(0, 10);
            urls.push({
              loc: `${base}/projects/${p.slug}`,
              lastmod: lastmod || null,
              priority: '0.7',
            });
          }
        }
      }

      if (blogOn && (await ctx.db.tableExists('blog_posts'))) {
        for (const p of await ctx.db.all(
          "SELECT slug, updated_at, published_at FROM blog_posts WHERE status='published'",
        )) {
          const lastmod = String(p.updated_at ?? p.published_at ?? '').slice(0, 10);
          urls.push({
            loc: `${base}/blog/${p.slug}`,
            lastmod: lastmod || null,
            priority: '0.6',
          });
        }
      }

      if (productsOn && (await ctx.db.tableExists('products'))) {
        for (const p of await ctx.db.all(
          'SELECT slug, updated_at FROM products WHERE is_visible=1 AND deleted_at IS NULL',
        )) {
          if (!p.slug) continue;
          const lastmod = String(p.updated_at ?? '').slice(0, 10);
          urls.push({
            loc: `${base}/products/${p.slug}`,
            lastmod: lastmod || null,
            priority: '0.6',
          });
        }
      }

      // PHP SitemapService emits compact XML (no newlines between tags).
      let xml = '<?xml version="1.0" encoding="UTF-8"?>';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
      for (const u of urls) {
        xml += '<url>';
        xml += `<loc>${escapeXml(u.loc)}</loc>`;
        if (u.lastmod) xml += `<lastmod>${escapeXml(u.lastmod)}</lastmod>`;
        xml += `<priority>${u.priority}</priority>`;
        xml += '</url>';
      }
      xml += '</urlset>';
      return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    });

    ctx.app.get(`${p}/search`, async (c) => {
      const q = String(c.req.query('q') || '').trim();
      if (!q) return ok(c, { items: [] });
      const like = `%${q}%`;
      const items: unknown[] = [];
      if (await ctx.db.tableExists('pages')) {
        items.push(
          ...(await ctx.db.all(
            `SELECT id, title, slug, 'page' AS type FROM pages WHERE title LIKE ? OR slug LIKE ? LIMIT 20`,
            [like, like],
          )),
        );
      }
      if (await ctx.db.tableExists('blog_posts')) {
        items.push(
          ...(await ctx.db.all(
            `SELECT id, title, slug, 'blog' AS type FROM blog_posts WHERE title LIKE ? OR slug LIKE ? LIMIT 20`,
            [like, like],
          )),
        );
      }
      return ok(c, { items, q });
    });

    for (const resource of ADMIN_RESOURCES) {
      const base = `${p}/admin/${resource}`;
      ctx.app.get(base, admin, async (c) => ctx.crud.list(c, resource));
      ctx.app.post(base, admin, async (c) => ctx.crud.create(c, resource));
      ctx.app.get(`${base}/:id`, admin, async (c) => ctx.crud.show(c, resource, c.req.param('id')));
      ctx.app.put(`${base}/:id`, admin, async (c) => ctx.crud.update(c, resource, c.req.param('id')));
      ctx.app.delete(`${base}/:id`, admin, async (c) => ctx.crud.remove(c, resource, c.req.param('id')));
    }

    ctx.app.post(`${p}/admin/pages/:id/publish`, admin, async (c) =>
      ctx.crud.publish(c, 'pages', c.req.param('id')),
    );
    ctx.app.post(`${p}/admin/navigation/reorder`, admin, async (c) => ctx.crud.reorder(c, 'navigation'));
    ctx.app.post(`${p}/admin/skills/reorder`, admin, async (c) => ctx.crud.reorder(c, 'skills'));
  }
}
