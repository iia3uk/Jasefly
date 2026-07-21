import { createElement, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { registerModule } from '@/core/moduleRegistry'
import { CrudListPage } from '@/admin/pages/AdminPages'
import type { Blueprint } from '@/core/pluginTypes'
import { api, endpoints } from '@/lib/api'
import { MediaImage, RichText } from '@/components/ui'
import { registerWidget } from '@/builder/registry'
import { LayoutRenderer } from '@/builder/render/LayoutRenderer'
import { parseLayout } from '@/builder/public/parseLayout'
import { ProductEntityProvider, useProductEntity } from '@/builder/context/ProductEntityContext'
import { DEMO_PRODUCT, formatProductPrice } from '@/builder/bind/resolveBound'
import { normalizeProduct } from '@/modules/products/normalizeProduct'
import { registerProductStorefrontWidgets } from '@/modules/products/storefrontWidgets'
import { registerMarketplaceWidgets } from '@/modules/products/marketplaceWidgets'
import { registerProductsCatalogWidget } from '@/modules/products/productsCatalogWidget'
import { ProductsSettingsPage } from '@/modules/products/ProductsSettingsPage'
import { ProductEditPage } from '@/modules/products/ProductEditPage'
import type { Page, PageLayout, Product } from '@/types'

registerProductStorefrontWidgets()
registerMarketplaceWidgets()
registerProductsCatalogWidget()

const col = (
  label: string,
  widget: string,
  opts: Partial<Blueprint['columns'][string]> = {},
): Blueprint['columns'][string] => ({
  type: (opts.type as Blueprint['columns'][string]['type']) || 'string',
  widget: widget as Blueprint['columns'][string]['widget'],
  label,
  required: opts.required ?? false,
  default: opts.default ?? null,
  nullable: opts.nullable ?? true,
  index: false,
  permission: null,
  visible: true,
  options: opts.options ?? null,
  min: null,
  max: null,
  pattern: null,
  help: opts.help ?? null,
})

const productsBlueprint: Blueprint = {
  key: 'products',
  table: 'products',
  label: 'Товары',
  singleton: false,
  soft_delete: true,
  slug: true,
  seo: false,
  group: 'Коммерция',
  orderable: true,
  icon: 'shopping-cart',
  columns: {
    title: col('Название', 'text', { required: true, type: 'string' }),
    sku: col('Артикул', 'text'),
    short_description: col('Краткое описание', 'textarea', { type: 'text' }),
    description: col('Описание', 'richtext', { type: 'longtext' }),
    price: col('Цена', 'number', { type: 'decimal', required: true, default: 0 }),
    currency: col('Валюта', 'text', { default: 'RUB' }),
    media_id: col('Обложка', 'media', { type: 'int' }),
    video_url: col('URL видео', 'url'),
    badge: col('Бейдж статуса', 'text', { help: 'Напр. Хит продаж, Новинка' }),
    stock: col('Остаток (пусто = ∞)', 'number', { type: 'int', help: 'NULL = безлимит' }),
    sold_count: col('Продано', 'number', { type: 'int', default: 0 }),
    attrs: col('Атрибуты (JSON)', 'json', { type: 'json', help: '{"brand":"Studio","rating":4.9,"old_price":2490,"specs":[{"label":"Артикул","value":"…"}],"reviews":[{"name":"Анна","text":"…"}]}' }),
    variants: col('Тарифы (JSON)', 'json', { type: 'json', help: '[{"label":"12 месяцев","price":1890,"old_price":2490,"highlight":"ВЫГОДНО"}]' }),
    gallery: col('Галерея media_id (JSON)', 'json', { type: 'json', help: '[12, 15, 18]' }),
    tabs: col('Вкладки (JSON)', 'json', { type: 'json', help: '[{"label":"Что внутри","html":"<p>…</p>"}]' }),
    tags: col('Теги (JSON)', 'json', { type: 'json', help: '["Шаблоны","Дизайн"]' }),
    is_purchasable: col('Можно купить', 'toggle', { type: 'bool', default: true }),
    is_visible: col('Видим', 'toggle', { type: 'bool', default: true }),
    sort_order: col('Порядок', 'number', { type: 'int', default: 0 }),
  },
  indexes: [],
  permissions: ['commerce.manage'],
}

function ProductPriceWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useProductEntity() ?? (editMode ? DEMO_PRODUCT : null)
  const prefix = typeof settings.prefix === 'string' ? settings.prefix : ''
  const align = String(settings.align || 'left')
  const price = formatProductPrice(product)
  const color = String(settings.color || '').trim() || 'var(--accent)'
  return (
    <p
      className="font-heading text-lg font-semibold"
      style={{ textAlign: align as 'left' | 'center' | 'right', color }}
    >
      {prefix}{price || (editMode ? '1 990 ₽' : '')}
    </p>
  )
}

function ProductBuyWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useProductEntity() ?? (editMode ? DEMO_PRODUCT : null)
  const label = typeof settings.label === 'string' && settings.label ? settings.label : 'Купить'
  const mode = String(settings.mode || 'payment')
  const align = String(settings.align || 'left')
  const wrap = align === 'center' ? 'flex justify-center' : align === 'right' ? 'flex justify-end' : ''
  const href = !product
    ? '/payment'
    : mode === 'detail'
      ? `/products/${product.slug}`
      : `/payment?item=product:${product.id}`
  const purchasable = product?.is_purchasable !== false && product?.is_purchasable !== 0

  if (!purchasable && !editMode) return null

  if (editMode) {
    return (
      <div className={wrap || undefined}>
        <span
          className="inline-flex rounded-lg px-4 py-2 text-sm font-medium"
          style={{
            background: String(settings.button_bg || '').trim() || 'var(--accent, #2563eb)',
            color: String(settings.button_text || '').trim() || 'var(--primary-foreground, #fff)',
          }}
        >
          {label}
        </span>
      </div>
    )
  }

  return (
    <div className={wrap || undefined}>
      <Link
        to={href}
        className="inline-flex rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90"
        style={{
          background: String(settings.button_bg || '').trim() || 'var(--accent, #2563eb)',
          color: String(settings.button_text || '').trim() || 'var(--primary-foreground, #fff)',
        }}
      >
        {label}
      </Link>
    </div>
  )
}

function FallbackProductCard({ product }: { product: Product }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      {product.media_id ? (
        <MediaImage media={product.media_id as never} alt={product.title} className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" />
      ) : null}
      <h3 className="font-heading text-lg">
        <Link to={`/products/${product.slug}`} className="hover:text-[var(--accent)]">{product.title}</Link>
      </h3>
      {product.short_description ? <p className="mt-1 text-sm text-[var(--muted)]">{product.short_description}</p> : null}
      <p className="mt-3 text-sm font-medium text-[var(--accent)]">{formatProductPrice(product)}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link to={`/products/${product.slug}`} className="link-text">Подробнее</Link>
        {product.is_purchasable !== false && product.is_purchasable !== 0 ? (
          <Link to={`/payment?item=product:${product.id}`} className="link-text">Купить</Link>
        ) : null}
      </div>
    </article>
  )
}

function ProductsGridWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const title = typeof settings.title === 'string' ? settings.title : ''
  const subtitle = typeof settings.subtitle === 'string' ? settings.subtitle : ''
  const limit = Number(settings.limit) > 0 ? Number(settings.limit) : 12
  const columns = Number(settings.columns) >= 2 && Number(settings.columns) <= 4 ? Number(settings.columns) : 3
  const [items, setItems] = useState<Product[]>([])
  const [cardLayout, setCardLayout] = useState<PageLayout | null>(null)

  useEffect(() => {
    if (editMode) {
      setItems([DEMO_PRODUCT])
      endpoints.page('product-card')
        .then((page) => setCardLayout(parseLayout(page as Page)))
        .catch(() => setCardLayout(null))
      return
    }
    let cancelled = false
    Promise.all([
      api.get<{ data: Product[] }>('/products'),
      endpoints.page('product-card').catch(() => null),
    ]).then(([res, page]) => {
      if (cancelled) return
      const raw = (res as { data?: unknown })?.data
      const rows = Array.isArray(raw) ? raw : []
      const list = rows
        .map((row) => normalizeProduct(row as Record<string, unknown>))
        .filter((p): p is Product => Boolean(p))
      setItems(list.slice(0, limit))
      setCardLayout(page ? parseLayout(page as Page) : null)
    }).catch(() => {
      if (!cancelled) {
        setItems([])
        setCardLayout(null)
      }
    })
    return () => { cancelled = true }
  }, [editMode, limit])

  const colClass =
    columns === 2 ? 'sm:grid-cols-2'
      : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4'
        : 'sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="mx-auto w-full max-w-5xl">
      {(title || subtitle) && (
        <div className="mb-8 text-center">
          {title ? <h2 className="font-heading text-3xl">{title}</h2> : null}
          {subtitle ? <p className="mt-2 text-sm text-[var(--muted)]">{subtitle}</p> : null}
        </div>
      )}
      {editMode && !cardLayout ? (
        <p className="mb-4 text-center text-xs text-zinc-500">
          Шаблон карточки: страница «product-card». Пока используется запасной вид.
        </p>
      ) : null}
      <div className={`grid gap-6 ${colClass}`}>
        {items.map((p) => (
          cardLayout?.elements?.length ? (
            <div key={String(p.id)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <ProductEntityProvider product={p}>
                <LayoutRenderer layout={cardLayout} editMode={false} />
              </ProductEntityProvider>
            </div>
          ) : (
            <FallbackProductCard key={String(p.id)} product={p} />
          )
        ))}
      </div>
    </div>
  )
}

registerWidget({
  type: 'product-price',
  label: 'Цена товара',
  category: 'commerce',
  defaultSettings: { prefix: '', align: 'left' },
  settingsFields: [
    { key: 'prefix', label: 'Префикс', type: 'text' },
    { key: 'color', label: 'Цвет цены', type: 'color' },
    { key: 'align', label: 'Выравнивание', type: 'select', options: [
      { value: 'left', label: 'Слева' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Справа' },
    ] },
  ],
  Render: ProductPriceWidget,
})

registerWidget({
  type: 'product-buy',
  label: 'Кнопка покупки',
  category: 'commerce',
  defaultSettings: { label: 'Купить', mode: 'payment', align: 'left' },
  settingsFields: [
    { key: 'label', label: 'Текст', type: 'text' },
    { key: 'button_bg', label: 'Фон кнопки', type: 'color' },
    { key: 'button_text', label: 'Текст кнопки', type: 'color' },
    { key: 'mode', label: 'Куда ведёт', type: 'select', options: [
      { value: 'payment', label: 'Оплата' },
      { value: 'detail', label: 'Страница товара' },
    ] },
    { key: 'align', label: 'Выравнивание', type: 'select', options: [
      { value: 'left', label: 'Слева' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Справа' },
    ] },
  ],
  Render: ProductBuyWidget,
})

registerWidget({
  type: 'products-grid',
  label: 'Сетка товаров',
  category: 'commerce',
  defaultSettings: { title: 'Товары', subtitle: '', limit: 12, columns: 3 },
  settingsFields: [
    { key: 'title', label: 'Заголовок', type: 'text' },
    { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
    { key: 'limit', label: 'Лимит', type: 'number' },
    { key: 'columns', label: 'Колонки', type: 'number' },
  ],
  Render: ProductsGridWidget,
})

registerModule({
  name: 'products',
  label: 'Товары',
  adminNav: [
    { group: 'Товары', path: '/admin/products', label: 'Товары', icon: 'shopping-cart' },
  ],
  blueprints: [productsBlueprint],
  adminScreens: [
    { path: 'products', label: 'Товары', group: 'Коммерция', element: createElement(CrudListPage, { resource: 'products' }) },
    { path: 'products/new', label: 'Новый товар', group: 'Коммерция', element: createElement(ProductEditPage) },
    { path: 'products/:id', label: 'Редактирование товара', group: 'Коммерция', element: createElement(ProductEditPage) },
    { path: 'products-templates', label: 'Шаблоны витрины', group: 'Коммерция', element: createElement(ProductsSettingsPage) },
  ],
})

/** Запасной вид страницы товара (если нет шаблона product-detail). */
export function ProductDetailFallback({ product }: { product: Product }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-0 md:grid-cols-2 md:gap-10">
      <div>
        {product.media_id ? (
          <MediaImage media={product.media_id as never} alt={product.title} className="aspect-square w-full rounded-2xl object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-white/15 text-sm text-[var(--muted)]">
            Нет обложки
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h1 className="break-words font-heading text-2xl font-semibold tracking-[-0.03em] sm:text-3xl md:text-4xl">{product.title}</h1>
        {product.short_description ? <p className="mt-3 text-sm text-[var(--muted)] sm:text-base">{product.short_description}</p> : null}
        <p className="mt-6 font-heading text-xl text-[var(--accent)] sm:text-2xl">{formatProductPrice(product)}</p>
        {product.description ? (
          <div className="prose mt-6 max-w-none overflow-x-auto"><RichText html={String(product.description)} /></div>
        ) : null}
        {product.is_purchasable !== false && product.is_purchasable !== 0 ? (
          <Link
            to={`/payment?item=product:${product.id}`}
            className="mt-8 inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent,#2563eb)] px-5 py-2.5 text-sm font-medium text-white sm:w-auto"
          >
            Купить
          </Link>
        ) : null}
      </div>
    </div>
  )
}
