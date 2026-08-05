import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context } from 'hono';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { ok, fail } from '../http/envelope.js';
import { moduleSettings, notDeletedClause, readJsonBody, saveModuleSettings } from './_helpers.js';

export const name = 'products';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_SNAPSHOT = JSON.parse(
  fs.readFileSync(path.join(DIR, 'products', 'templates.snapshot.json'), 'utf8'),
) as Record<string, unknown>;
const CONFIG_SNAPSHOT = JSON.parse(
  fs.readFileSync(path.join(DIR, 'products', 'config.snapshot.json'), 'utf8'),
) as Record<string, unknown>;

const TEMPLATE_IDS = ['simple', 'storefront', 'marketplace', 'digital', 'landing'] as const;

function emptyFacets() {
  return {
    brands: [] as unknown[],
    categories: [] as unknown[],
    delivery: [] as unknown[],
    original_count: 0,
    price: { max: 0, min: 0 },
    tags: [] as unknown[],
    total: 0,
  };
}

async function catalogSearch(
  db: ModuleContext['db'],
  query: Record<string, string | undefined>,
): Promise<{
  items: unknown[];
  total: number;
  facets: ReturnType<typeof emptyFacets>;
  meta: Record<string, unknown>;
}> {
  const q = String(query.q ?? '')
    .trim()
    .toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(query.limit ?? 100) || 100));
  const offset = Math.max(0, Number(query.offset ?? 0) || 0);
  const sort = String(query.sort ?? 'popular') || 'popular';
  const minPrice = query.min_price != null && query.min_price !== '' ? Number(query.min_price) : null;
  const maxPrice = query.max_price != null && query.max_price !== '' ? Number(query.max_price) : null;

  const meta = {
    q,
    min_price: minPrice != null && Number.isFinite(minPrice) ? minPrice : null,
    max_price: maxPrice != null && Number.isFinite(maxPrice) ? maxPrice : null,
    brand: [] as string[],
    category: [] as string[],
    tag: [] as string[],
    delivery: [] as string[],
    original: null as boolean | null,
    sort,
    limit,
    offset,
  };

  if (!(await db.tableExists('products'))) {
    return { items: [], total: 0, facets: emptyFacets(), meta };
  }

  const del = await notDeletedClause(db, 'products');
  const cols = await db.columns('products');
  const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
  let rows = await db.all(`SELECT * FROM products WHERE 1=1${vis}${del} ORDER BY sort_order, id`);

  // Facets from full visible set (PHP ProductCatalog::buildFacets)
  const facets = emptyFacets();
  facets.total = rows.length;
  let priceMin = Infinity;
  let priceMax = 0;
  for (const row of rows) {
    const price = Number(row.price ?? 0);
    if (price > 0) {
      priceMin = Math.min(priceMin, price);
      priceMax = Math.max(priceMax, price);
    }
  }
  facets.price = { min: priceMin === Infinity ? 0 : priceMin, max: priceMax };

  if (q) {
    rows = rows.filter((row) => {
      const hay = [row.title, row.sku, row.badge, row.short_description]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }
  if (minPrice != null && Number.isFinite(minPrice)) {
    rows = rows.filter((row) => Number(row.price ?? 0) >= minPrice);
  }
  if (maxPrice != null && Number.isFinite(maxPrice)) {
    rows = rows.filter((row) => Number(row.price ?? 0) <= maxPrice);
  }

  const total = rows.length;
  const items = rows.slice(offset, offset + limit);
  return { items, total, facets, meta };
}

function templatesPayload(active: string): Record<string, unknown> {
  const id = TEMPLATE_IDS.includes(active as (typeof TEMPLATE_IDS)[number]) ? active : 'storefront';
  const snap = { ...TEMPLATES_SNAPSHOT };
  snap.active = id;
  snap.page_slug = `product-detail-${id}`;
  // form_fields depend on active template — use snapshot's for storefront default;
  // when active differs, still OK for parity seed (always storefront).
  return snap;
}

function publicConfig(active: string): Record<string, unknown> {
  const id = TEMPLATE_IDS.includes(active as (typeof TEMPLATE_IDS)[number]) ? active : 'storefront';
  const snap = { ...CONFIG_SNAPSHOT };
  const tpl = (snap.templates as { id: string; title: string }[] | undefined)?.find((t) => t.id === id);
  return {
    ...snap,
    storefront_template: id,
    page_slug: `product-detail-${id}`,
    title: tpl?.title ?? id,
  };
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/products/config`, async (c) => {
      const settings = await moduleSettings(ctx.db, 'products');
      return ok(c, publicConfig(String(settings.storefront_template ?? 'storefront')));
    });

    ctx.app.get(`${p}/products`, async (c) => {
      const result = await catalogSearch(ctx.db, {
        q: c.req.query('q'),
        min_price: c.req.query('min_price'),
        max_price: c.req.query('max_price'),
        brand: c.req.query('brand'),
        category: c.req.query('category'),
        tag: c.req.query('tag'),
        delivery: c.req.query('delivery'),
        original: c.req.query('original'),
        sort: c.req.query('sort'),
        limit: c.req.query('limit') ?? '100',
        offset: c.req.query('offset') ?? '0',
      });
      return ok(c, result.items, 200, result.meta, {
        total: result.total,
        facets: result.facets,
      });
    });

    ctx.app.get(`${p}/products/facets`, async (c) => {
      const result = await catalogSearch(ctx.db, { limit: '1' });
      return ok(c, result.facets);
    });

    ctx.app.get(`${p}/products/:slug`, async (c) => {
      const slug = c.req.param('slug');
      if (slug === 'config') {
        const settings = await moduleSettings(ctx.db, 'products');
        return ok(c, publicConfig(String(settings.storefront_template ?? 'storefront')));
      }
      if (slug === 'facets') {
        const result = await catalogSearch(ctx.db, { limit: '1' });
        return ok(c, result.facets);
      }
      if (!(await ctx.db.tableExists('products'))) return fail(c, 'Not found', 404);
      const del = await notDeletedClause(ctx.db, 'products');
      const cols = await ctx.db.columns('products');
      const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
      const row = await ctx.db.one(`SELECT * FROM products WHERE slug=?${vis}${del} LIMIT 1`, [slug]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.get(`${p}/admin/products-meta/templates`, admin, async (c) => {
      const settings = await moduleSettings(ctx.db, 'products');
      return ok(c, templatesPayload(String(settings.storefront_template ?? 'storefront')));
    });

    ctx.app.put(`${p}/admin/products-meta/templates`, admin, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const id = String(body.storefront_template ?? '').trim();
      if (!TEMPLATE_IDS.includes(id as (typeof TEMPLATE_IDS)[number])) {
        return fail(c, 'Неизвестный шаблон', 422);
      }
      await saveModuleSettings(ctx.db, 'products', { storefront_template: id });
      return ok(c, templatesPayload(id));
    });
  }
}
