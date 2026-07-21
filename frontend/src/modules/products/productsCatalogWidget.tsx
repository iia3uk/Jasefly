import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown, Heart, Search, ShoppingCart, SlidersHorizontal, Star, X,
} from 'lucide-react'
import { registerWidget } from '@/builder/registry'
import { MediaImage } from '@/components/ui'
import { api } from '@/lib/api'
import { ProductEntityProvider } from '@/builder/context/ProductEntityContext'
import { LayoutRenderer } from '@/builder/render/LayoutRenderer'
import { parseLayout } from '@/builder/public/parseLayout'
import { DEMO_PRODUCT, formatMoney, formatProductPrice } from '@/builder/bind/resolveBound'
import { normalizeProduct } from '@/modules/products/normalizeProduct'
import type { Page, PageLayout, Product } from '@/types'
import clsx from 'clsx'

type FacetItem = { value: string; count: number }
type Facets = {
  price?: { min: number; max: number }
  brands?: FacetItem[]
  categories?: FacetItem[]
  tags?: FacetItem[]
  delivery?: FacetItem[]
  original_count?: number
  total?: number
}

type CatalogFilters = {
  q: string
  minPrice: string
  maxPrice: string
  brands: string[]
  categories: string[]
  tags: string[]
  delivery: string[]
  original: boolean
  sort: string
}

const SORT_OPTIONS = [
  { value: 'popular', label: 'Популярные' },
  { value: 'price_asc', label: 'Сначала дешевле' },
  { value: 'price_desc', label: 'Сначала дороже' },
  { value: 'newest', label: 'Новинки' },
  { value: 'title', label: 'По названию' },
]

const emptyFilters = (): CatalogFilters => ({
  q: '',
  minPrice: '',
  maxPrice: '',
  brands: [],
  categories: [],
  tags: [],
  delivery: [],
  original: false,
  sort: 'popular',
})

function toggleIn(list: string[], value: string): string[] {
  const key = value.toLowerCase()
  const has = list.some((x) => x.toLowerCase() === key)
  return has ? list.filter((x) => x.toLowerCase() !== key) : [...list, value]
}

function hasActive(f: CatalogFilters): boolean {
  return Boolean(
    f.q.trim()
    || f.minPrice
    || f.maxPrice
    || f.brands.length
    || f.categories.length
    || f.tags.length
    || f.delivery.length
    || f.original,
  )
}

function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1.5 text-left text-xs font-medium transition',
        active
          ? 'border-[var(--accent,#f5d547)] bg-[var(--accent,#f5d547)]/20 text-white'
          : 'border-white/12 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:bg-white/[0.07]',
      )}
    >
      {children}
    </button>
  )
}

function CatalogCard({ product, editMode }: { product: Product; editMode?: boolean }) {
  const a = product.attrs ?? {}
  const brand = String(a.brand ?? '')
  const rating = Number(a.rating ?? 0) || 4.8
  const reviews = Number(a.reviews_count ?? 0)
  const oldPrice = a.old_price != null ? Number(a.old_price) : null
  const discount = String(a.discount_label ?? '')
  const delivery = String(a.delivery ?? 'Завтра')
  const href = `/products/${product.slug}`
  const pay = `/payment?item=product:${product.id}`

  return (
    <article className="group flex h-full flex-col">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/[0.04]">
        {product.media_id ? (
          <Link to={href} onClick={editMode ? (e) => e.preventDefault() : undefined}>
            <MediaImage media={product.media_id as never} alt={product.title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
          </Link>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">Нет фото</div>
        )}
        <button type="button" className="absolute right-2 top-2 rounded-full bg-black/45 p-2 text-zinc-200 backdrop-blur" aria-label="В избранное">
          <Heart size={15} />
        </button>
        {discount ? (
          <span className="absolute left-2 top-2 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {discount}
          </span>
        ) : null}
        {!editMode ? (
          <Link
            to={pay}
            className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent,#f5d547)] text-black shadow-lg transition hover:brightness-110"
            aria-label="В корзину"
          >
            <ShoppingCart size={16} />
          </Link>
        ) : (
          <span className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent,#f5d547)] text-black shadow-lg">
            <ShoppingCart size={16} />
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <p className="text-lg font-bold text-emerald-400">{formatProductPrice(product)}</p>
        {oldPrice != null && oldPrice > Number(product.price) ? (
          <p className="text-xs text-zinc-500 line-through">{formatMoney(oldPrice, product.currency)}</p>
        ) : null}
        <Link
          to={href}
          className="mt-1 line-clamp-2 text-sm text-zinc-100 hover:text-[var(--accent,#f5d547)]"
          onClick={editMode ? (e) => e.preventDefault() : undefined}
        >
          {brand ? <span className="font-semibold">{brand} / </span> : null}
          {product.title}
        </Link>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1 text-zinc-300">
            <Star size={12} className="text-amber-400" fill="currentColor" strokeWidth={0} />
            {rating.toFixed(1)}
          </span>
          {reviews > 0 ? <span>({reviews})</span> : null}
          {(product.sold_count ?? 0) > 0 ? <span>{product.sold_count} купили</span> : null}
        </p>
        <p className="mt-auto pt-2 text-xs text-zinc-500">{delivery}</p>
      </div>
    </article>
  )
}

function ProductsCatalogWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const title = typeof settings.title === 'string' ? settings.title : 'Каталог'
  const columns = Number(settings.columns) >= 2 && Number(settings.columns) <= 4 ? Number(settings.columns) : 3
  const pageSize = Number(settings.limit) > 0 ? Number(settings.limit) : 24
  const cardStyle = String(settings.card_style || 'market') // market | template
  const showSidebar = settings.show_sidebar !== false
  const showSearch = settings.show_search !== false

  const [filters, setFilters] = useState<CatalogFilters>(emptyFilters)
  const [draftQ, setDraftQ] = useState('')
  const [items, setItems] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<Facets>({})
  const [loading, setLoading] = useState(false)
  const [cardLayout, setCardLayout] = useState<PageLayout | null>(null)
  const [mobileFilters, setMobileFilters] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (filters.q.trim()) p.set('q', filters.q.trim())
    if (filters.minPrice) p.set('min_price', filters.minPrice)
    if (filters.maxPrice) p.set('max_price', filters.maxPrice)
    if (filters.brands.length) p.set('brand', filters.brands.join(','))
    if (filters.categories.length) p.set('category', filters.categories.join(','))
    if (filters.tags.length) p.set('tag', filters.tags.join(','))
    if (filters.delivery.length) p.set('delivery', filters.delivery.join(','))
    if (filters.original) p.set('original', '1')
    p.set('sort', filters.sort)
    p.set('limit', String(pageSize))
    return p.toString()
  }, [filters, pageSize])

  const load = useCallback(async () => {
    if (editMode) {
      setItems([DEMO_PRODUCT, { ...DEMO_PRODUCT, id: 1 as Product['id'], title: 'Starter Kit', slug: 'starter-kit', price: 990 }])
      setTotal(2)
      setFacets({
        price: { min: 490, max: 2490 },
        brands: [{ value: 'Studio Pack', count: 2 }],
        categories: [{ value: 'Цифровой товар', count: 2 }],
        tags: [{ value: 'Шаблоны', count: 1 }, { value: 'Дизайн', count: 1 }],
        delivery: [{ value: 'Мгновенно', count: 2 }],
        original_count: 1,
        total: 2,
      })
      return
    }
    setLoading(true)
    try {
      const res = await api.get<{
        data?: unknown
        total?: number
        facets?: Facets
      }>(`/products?${queryString}`)
      const rows = Array.isArray(res?.data) ? res.data : []
      setItems(
        rows
          .map((row) => normalizeProduct(row as Record<string, unknown>))
          .filter((p): p is Product => Boolean(p)),
      )
      setTotal(Number(res?.total ?? rows.length))
      setFacets(res?.facets ?? {})
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [editMode, queryString])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (cardStyle !== 'template') return
    endpointsLoadCard().then(setCardLayout).catch(() => setCardLayout(null))
  }, [cardStyle, editMode])

  async function endpointsLoadCard() {
    const { endpoints } = await import('@/lib/api')
    const page = await endpoints.page('product-card')
    return parseLayout(page as Page)
  }

  const chips = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: () => void }> = []
    if (filters.q.trim()) {
      out.push({
        key: 'q',
        label: `«${filters.q.trim()}»`,
        clear: () => { setFilters((f) => ({ ...f, q: '' })); setDraftQ('') },
      })
    }
    if (filters.minPrice || filters.maxPrice) {
      out.push({
        key: 'price',
        label: `Цена ${filters.minPrice || '…'}–${filters.maxPrice || '…'}`,
        clear: () => setFilters((f) => ({ ...f, minPrice: '', maxPrice: '' })),
      })
    }
    for (const b of filters.brands) {
      out.push({
        key: `b-${b}`,
        label: b,
        clear: () => setFilters((f) => ({ ...f, brands: f.brands.filter((x) => x !== b) })),
      })
    }
    for (const c of filters.categories) {
      out.push({
        key: `c-${c}`,
        label: c,
        clear: () => setFilters((f) => ({ ...f, categories: f.categories.filter((x) => x !== c) })),
      })
    }
    for (const t of filters.tags) {
      out.push({
        key: `t-${t}`,
        label: t,
        clear: () => setFilters((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) })),
      })
    }
    for (const d of filters.delivery) {
      out.push({
        key: `d-${d}`,
        label: d,
        clear: () => setFilters((f) => ({ ...f, delivery: f.delivery.filter((x) => x !== d) })),
      })
    }
    if (filters.original) {
      out.push({
        key: 'original',
        label: 'Оригинал',
        clear: () => setFilters((f) => ({ ...f, original: false })),
      })
    }
    return out
  }, [filters])

  const colClass =
    columns === 2 ? 'sm:grid-cols-2'
      : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4'
        : 'sm:grid-cols-2 lg:grid-cols-3'

  const priceMinHint = facets.price?.min ?? 0
  const priceMaxHint = facets.price?.max ?? 0

  const sidebar = (
    <aside className="space-y-6">
      {(facets.categories?.length ?? 0) > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Категории</h3>
          <div className="flex flex-wrap gap-1.5">
            {facets.categories!.map((c) => (
              <Pill
                key={c.value}
                active={filters.categories.some((x) => x.toLowerCase() === c.value.toLowerCase())}
                onClick={() => setFilters((f) => ({ ...f, categories: toggleIn(f.categories, c.value) }))}
              >
                {c.value} <span className="opacity-50">{c.count}</span>
              </Pill>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white">Цена, ₽</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-zinc-500">
            От
            <input
              className="mt-1 w-full rounded-xl border border-white/12 bg-[#121214] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              inputMode="numeric"
              placeholder={String(Math.floor(priceMinHint))}
              value={filters.minPrice}
              onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value.replace(/[^\d.]/g, '') }))}
            />
          </label>
          <label className="block text-[11px] text-zinc-500">
            До
            <input
              className="mt-1 w-full rounded-xl border border-white/12 bg-[#121214] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              inputMode="numeric"
              placeholder={String(Math.ceil(priceMaxHint))}
              value={filters.maxPrice}
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value.replace(/[^\d.]/g, '') }))}
            />
          </label>
        </div>
      </section>

      {(facets.original_count ?? 0) > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Проверенные</h3>
          <Pill active={filters.original} onClick={() => setFilters((f) => ({ ...f, original: !f.original }))}>
            Оригинал <span className="opacity-50">{facets.original_count}</span>
          </Pill>
        </section>
      ) : null}

      {(facets.brands?.length ?? 0) > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Бренд</h3>
          <div className="flex flex-wrap gap-1.5">
            {facets.brands!.map((b) => (
              <Pill
                key={b.value}
                active={filters.brands.some((x) => x.toLowerCase() === b.value.toLowerCase())}
                onClick={() => setFilters((f) => ({ ...f, brands: toggleIn(f.brands, b.value) }))}
              >
                {b.value} <span className="opacity-50">{b.count}</span>
              </Pill>
            ))}
          </div>
        </section>
      ) : null}

      {(facets.delivery?.length ?? 0) > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Доставка</h3>
          <div className="flex flex-wrap gap-1.5">
            {facets.delivery!.map((d) => (
              <Pill
                key={d.value}
                active={filters.delivery.some((x) => x.toLowerCase() === d.value.toLowerCase())}
                onClick={() => setFilters((f) => ({ ...f, delivery: toggleIn(f.delivery, d.value) }))}
              >
                {d.value}
              </Pill>
            ))}
          </div>
        </section>
      ) : null}

      {(facets.tags?.length ?? 0) > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">Теги</h3>
          <div className="flex flex-wrap gap-1.5">
            {facets.tags!.map((t) => (
              <Pill
                key={t.value}
                active={filters.tags.some((x) => x.toLowerCase() === t.value.toLowerCase())}
                onClick={() => setFilters((f) => ({ ...f, tags: toggleIn(f.tags, t.value) }))}
              >
                {t.value}
              </Pill>
            ))}
          </div>
        </section>
      ) : null}

      {hasActive(filters) ? (
        <button
          type="button"
          className="text-xs font-medium text-zinc-400 underline-offset-2 hover:text-white hover:underline"
          onClick={() => {
            setFilters(emptyFilters())
            setDraftQ('')
          }}
        >
          Сбросить все фильтры
        </button>
      ) : null}
    </aside>
  )

  return (
    <div className="mx-auto w-full max-w-6xl">
      {showSearch ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setFilters((f) => ({ ...f, q: draftQ }))
              }}
              placeholder="Поиск по товарам"
              className="h-12 w-full rounded-2xl border border-white/12 bg-[#121214] pl-10 pr-10 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-[var(--accent)]"
              aria-label="Поиск"
            />
            {draftQ ? (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:text-white"
                onClick={() => { setDraftQ(''); setFilters((f) => ({ ...f, q: '' })) }}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="h-12 shrink-0 rounded-2xl bg-[var(--accent,#f5d547)] px-5 text-sm font-semibold text-black"
            onClick={() => setFilters((f) => ({ ...f, q: draftQ }))}
          >
            Найти
          </button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {title ? <h2 className="font-heading text-2xl text-white sm:text-3xl">{title}</h2> : null}
          <p className="mt-1 text-sm text-zinc-500">
            {loading ? 'Загрузка…' : `${total} ${pluralGoods(total)}`}
            {filters.q.trim() ? ` по запросу «${filters.q.trim()}»` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showSidebar ? (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 px-3 text-sm text-zinc-300 lg:hidden"
              onClick={() => setMobileFilters(true)}
            >
              <SlidersHorizontal size={14} />
              Фильтры
            </button>
          ) : null}
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 px-3 text-sm text-zinc-300"
              onClick={() => setSortOpen((v) => !v)}
            >
              Сортировка
              <ChevronDown size={14} />
            </button>
            {sortOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[200px] overflow-hidden rounded-xl border border-white/12 bg-[#16161a] py-1 shadow-xl">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={clsx(
                      'block w-full px-3 py-2 text-left text-sm',
                      filters.sort === o.value ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white',
                    )}
                    onClick={() => {
                      setFilters((f) => ({ ...f, sort: o.value }))
                      setSortOpen(false)
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {chips.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-200"
              onClick={c.clear}
            >
              {c.label}
              <X size={12} />
            </button>
          ))}
        </div>
      ) : null}

      <div className={clsx('grid gap-6', showSidebar && 'lg:grid-cols-[240px_minmax(0,1fr)]')}>
        {showSidebar ? (
          <div className="hidden lg:block">{sidebar}</div>
        ) : null}

        <div>
          {!loading && !items.length ? (
            <p className="rounded-2xl border border-dashed border-white/15 px-4 py-12 text-center text-sm text-zinc-500">
              Ничего не найдено. Смягчите фильтры или измените запрос.
            </p>
          ) : (
            <div className={`grid gap-5 ${colClass}`}>
              {items.map((p) => (
                cardStyle === 'template' && cardLayout?.elements?.length ? (
                  <div key={String(p.id)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <ProductEntityProvider product={p}>
                      <LayoutRenderer layout={cardLayout} editMode={false} />
                    </ProductEntityProvider>
                  </div>
                ) : (
                  <CatalogCard key={String(p.id)} product={p} editMode={editMode} />
                )
              ))}
            </div>
          )}
        </div>
      </div>

      {mobileFilters ? (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Закрыть" onClick={() => setMobileFilters(false)} />
          <div className="relative z-10 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-white/10 bg-[#101012] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-white">Фильтры</p>
              <button type="button" className="rounded-full p-2 text-zinc-400" onClick={() => setMobileFilters(false)}>
                <X size={18} />
              </button>
            </div>
            {sidebar}
            <button
              type="button"
              className="mt-4 h-12 w-full rounded-2xl bg-[var(--accent,#f5d547)] text-sm font-semibold text-black"
              onClick={() => setMobileFilters(false)}
            >
              Показать {total}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function pluralGoods(n: number): string {
  const m = Math.abs(n) % 100
  const m1 = m % 10
  if (m > 10 && m < 20) return 'товаров'
  if (m1 === 1) return 'товар'
  if (m1 >= 2 && m1 <= 4) return 'товара'
  return 'товаров'
}

export function registerProductsCatalogWidget() {
  registerWidget({
    type: 'products-catalog',
    label: 'Каталог: поиск и фильтры',
    category: 'commerce',
    defaultSettings: {
      title: 'Товары',
      limit: 24,
      columns: 3,
      card_style: 'market',
      show_sidebar: true,
      show_search: true,
    },
    settingsFields: [
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'limit', label: 'Лимит на странице', type: 'number' },
      { key: 'columns', label: 'Колонки сетки', type: 'number' },
      {
        key: 'card_style',
        label: 'Вид карточки',
        type: 'select',
        options: [
          { value: 'market', label: 'Маркетплейс' },
          { value: 'template', label: 'Шаблон product-card' },
        ],
      },
      { key: 'show_search', label: 'Строка поиска', type: 'toggle' },
      { key: 'show_sidebar', label: 'Боковые фильтры', type: 'toggle' },
    ],
    Render: ProductsCatalogWidget,
  })
}
