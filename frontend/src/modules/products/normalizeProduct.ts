import type { Product, ProductTab, ProductVariant } from '@/types'

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback
  if (typeof value === 'object') return value as T
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return fallback
}

/** Нормализация сырого ответа API (JSON-колонки могут прийти строкой). */
export function normalizeProduct(raw: Record<string, unknown> | Product | null | undefined): Product | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const variants = parseJson<ProductVariant[]>(r.variants, [])
  const gallery = parseJson<Array<number | string>>(r.gallery, [])
  const tabs = parseJson<ProductTab[]>(r.tabs, [])
  const tags = parseJson<string[]>(r.tags, [])
  const attrs = parseJson<Record<string, unknown>>(r.attrs, {})

  return {
    id: Number(r.id) as Product['id'],
    title: String(r.title ?? ''),
    slug: String(r.slug ?? ''),
    sku: r.sku != null ? String(r.sku) : null,
    badge: r.badge != null ? String(r.badge) : null,
    short_description: r.short_description != null ? String(r.short_description) : null,
    description: r.description != null ? String(r.description) : null,
    price: Number(r.price ?? 0),
    currency: r.currency != null ? String(r.currency) : 'RUB',
    media_id: r.media_id != null && r.media_id !== '' ? Number(r.media_id) : null,
    video_url: r.video_url != null ? String(r.video_url) : null,
    stock: r.stock == null || r.stock === '' ? null : Number(r.stock),
    sold_count: Number(r.sold_count ?? 0),
    is_purchasable: r.is_purchasable as Product['is_purchasable'],
    is_visible: r.is_visible as Product['is_visible'],
    sort_order: Number(r.sort_order ?? 0),
    attrs,
    variants: Array.isArray(variants) ? variants : [],
    gallery: Array.isArray(gallery) ? gallery.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [],
    tabs: Array.isArray(tabs) ? tabs : [],
    tags: Array.isArray(tags) ? tags.map(String) : [],
  }
}
