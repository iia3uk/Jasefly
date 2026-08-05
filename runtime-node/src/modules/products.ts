import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { ok, fail } from '../http/envelope.js';
import { moduleSettings, notDeletedClause, readJsonBody, saveModuleSettings } from './_helpers.js';

export const name = 'products';

const PRODUCT_TEMPLATES = [
  { id: 'simple', title: 'Simple', description: 'Минимальная карточка товара' },
  { id: 'storefront', title: 'Storefront', description: 'Стандартная витрина' },
  { id: 'marketplace', title: 'Marketplace', description: 'Маркетплейс-стиль' },
  { id: 'digital', title: 'Digital', description: 'Цифровой товар' },
  { id: 'landing', title: 'Landing', description: 'Лендинг товара' },
];

async function productFacets(db: ModuleContext['db']) {
  if (!(await db.tableExists('products'))) {
    return { brands: [], categories: [], tags: [], price: { min: 0, max: 0 } };
  }
  const del = await notDeletedClause(db, 'products');
  const cols = await db.columns('products');
  const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
  const select = ['price', 'brand', 'category', 'tags'].filter((c) => cols.includes(c));
  if (!select.length) {
    return { brands: [], categories: [], tags: [], price: { min: 0, max: 0 } };
  }
  const rows = await db.all(`SELECT ${select.join(', ')} FROM products WHERE 1=1${vis}${del}`);
  const brands = new Set<string>();
  const categories = new Set<string>();
  const tags = new Set<string>();
  let min = Infinity;
  let max = 0;
  for (const row of rows) {
    const price = Number(row.price ?? 0);
    if (price > 0) {
      min = Math.min(min, price);
      max = Math.max(max, price);
    }
    if (row.brand) brands.add(String(row.brand));
    if (row.category) categories.add(String(row.category));
    if (row.tags) {
      try {
        const parsed = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
        if (Array.isArray(parsed)) parsed.forEach((t) => tags.add(String(t)));
      } catch {
        /* ignore */
      }
    }
  }
  return {
    brands: [...brands].sort(),
    categories: [...categories].sort(),
    tags: [...tags].sort(),
    price: { min: min === Infinity ? 0 : min, max },
  };
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/products/config`, async (c) =>
      ok(c, { storefront_template: 'default', page_slug: 'product-card', templates: [] }),
    );

    ctx.app.get(`${p}/products`, async (c) => {
      if (!(await ctx.db.tableExists('products'))) return ok(c, []);
      const del = await notDeletedClause(ctx.db, 'products');
      const cols = await ctx.db.columns('products');
      const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
      const q = String(c.req.query('q') ?? '').trim();
      let sql = `SELECT * FROM products WHERE 1=1${vis}${del}`;
      const params: unknown[] = [];
      if (q) {
        sql += ' AND (title LIKE ? OR slug LIKE ?)';
        const like = `%${q}%`;
        params.push(like, like);
      }
      sql += ' ORDER BY sort_order ASC, id DESC LIMIT 100';
      return ok(c, await ctx.db.all(sql, params));
    });

    ctx.app.get(`${p}/products/facets`, async (c) => ok(c, await productFacets(ctx.db)));

    ctx.app.get(`${p}/products/:slug`, async (c) => {
      if (!(await ctx.db.tableExists('products'))) return fail(c, 'Not found', 404);
      const slug = c.req.param('slug');
      const del = await notDeletedClause(ctx.db, 'products');
      const cols = await ctx.db.columns('products');
      const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
      const row = await ctx.db.one(`SELECT * FROM products WHERE slug=?${vis}${del} LIMIT 1`, [slug]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.get(`${p}/admin/products-meta/templates`, admin, async (c) => {
      const settings = await moduleSettings(ctx.db, 'products');
      const current = String(settings.storefront_template ?? 'storefront');
      return ok(c, {
        templates: PRODUCT_TEMPLATES,
        storefront_template: current,
        page_slug: `product-detail-${current}`,
      });
    });

    ctx.app.put(`${p}/admin/products-meta/templates`, admin, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const id = String(body.storefront_template ?? '').trim();
      if (!PRODUCT_TEMPLATES.some((t) => t.id === id)) return fail(c, 'Неизвестный шаблон', 422);
      const merged = await saveModuleSettings(ctx.db, 'products', { storefront_template: id });
      return ok(c, {
        templates: PRODUCT_TEMPLATES,
        storefront_template: merged.storefront_template,
        page_slug: `product-detail-${id}`,
      });
    });
  }
}
