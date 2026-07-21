import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck, ChevronLeft, ChevronRight, Heart, ShoppingCart, Star, Truck, X,
} from 'lucide-react'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { MediaImage, RichText } from '@/components/ui'
import { useProductEntity } from '@/builder/context/ProductEntityContext'
import { DEMO_PRODUCT, formatMoney, formatProductPrice } from '@/builder/bind/resolveBound'
import { readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import type { Product } from '@/types'
import clsx from 'clsx'

type MpSpec = { label: string; value: string; group?: string }
type MpReview = {
  name: string
  date?: string
  rating?: number
  text: string
  pros?: string[]
}

const THEME_FIELDS: SettingsField[] = [
  {
    key: 'tone',
    label: 'Тема блока',
    type: 'select',
    options: [
      { value: 'site', label: 'Как на сайте' },
      { value: 'light', label: 'Светлая карточка' },
    ],
  },
  { key: 'accent_color', label: 'Акцент', type: 'color' },
  { key: 'price_color', label: 'Цвет цены', type: 'color' },
  { key: 'button_bg', label: 'Кнопка — фон', type: 'color' },
  { key: 'button_text', label: 'Кнопка — текст', type: 'color' },
  { key: 'text_color', label: 'Цвет текста', type: 'color' },
  { key: 'muted_color', label: 'Вторичный текст', type: 'color' },
  { key: 'card_bg', label: 'Фон карточки', type: 'color' },
  { key: 'surface_bg', label: 'Фон блока', type: 'color' },
]

function useStoreProduct(editMode?: boolean): Product | null {
  return useProductEntity() ?? (editMode ? DEMO_PRODUCT : null)
}

function asSpecs(raw: unknown): MpSpec[] {
  if (!Array.isArray(raw)) return []
  const out: MpSpec[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const label = String(o.label ?? o.key ?? '').trim()
    const value = String(o.value ?? '').trim()
    if (!label || !value) continue
    const spec: MpSpec = { label, value }
    if (o.group) spec.group = String(o.group)
    out.push(spec)
  }
  return out
}

function asReviews(raw: unknown): MpReview[] {
  if (!Array.isArray(raw)) return []
  const out: MpReview[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const text = String(o.text ?? o.content ?? '').trim()
    if (!text) continue
    const review: MpReview = {
      name: String(o.name ?? o.author ?? 'Покупатель'),
      text,
      rating: o.rating != null ? Number(o.rating) : 5,
    }
    if (o.date) review.date = String(o.date)
    if (Array.isArray(o.pros)) review.pros = o.pros.map(String)
    out.push(review)
  }
  return out
}

function mpMeta(product: Product | null) {
  const a = (product?.attrs && typeof product.attrs === 'object' ? product.attrs : {}) as Record<string, unknown>
  const oldPrice = a.old_price != null ? Number(a.old_price) : null
  const price = product?.price != null ? Number(product.price) : null
  let discount = String(a.discount_label ?? '')
  if (!discount && oldPrice != null && price != null && oldPrice > price) {
    discount = `−${Math.round((1 - price / oldPrice) * 100)}%`
  }
  return {
    brand: String(a.brand ?? a.category ?? ''),
    original: a.original === true || a.original === 1 || a.original === '1',
    rating: Number(a.rating ?? 0) || (product ? 4.9 : 0),
    reviewsCount: Number(a.reviews_count ?? 0),
    questionsCount: Number(a.questions_count ?? 0),
    oldPrice: oldPrice != null && Number.isFinite(oldPrice) ? oldPrice : null,
    discount,
    delivery: String(a.delivery ?? 'Мгновенно'),
    seller: String(a.seller ?? ''),
    sellerRating: String(a.seller_rating ?? ''),
    promoEnds: String(a.promo_ends ?? ''),
    priceTag: String(a.price_tag ?? ''),
    specs: asSpecs(a.specs),
    reviews: asReviews(a.reviews),
  }
}

function resolveMpTheme(settings: Record<string, unknown>): CSSProperties {
  const styles = readStyles(settings)
  const tone = String(settings.tone || 'site')
  const light = tone === 'light'
  const accent = String(settings.accent_color || '').trim() || 'var(--accent, #8eb6ff)'
  const price = String(settings.price_color || '').trim() || accent
  const btnBg = String(settings.button_bg || '').trim() || accent
  const btnFg = String(settings.button_text || '').trim() || 'var(--primary-foreground, #061018)'
  const text = String(settings.text_color || styles.color || '').trim()
    || (light ? '#16181d' : 'var(--text, #f4f6fa)')
  const muted = String(settings.muted_color || '').trim()
    || (light ? '#6b7280' : 'var(--muted, #8b95a8)')
  const card = String(settings.card_bg || '').trim()
    || (light ? '#ffffff' : 'color-mix(in srgb, var(--surface, #0e1219) 92%, white 8%)')
  const surface = String(settings.surface_bg || styles.backgroundColor || '').trim()
    || (light ? '#f3f4f6' : 'transparent')

  return {
    ...stylesToCss(styles),
    ['--mp-accent' as string]: accent,
    ['--mp-price' as string]: price,
    ['--mp-btn-bg' as string]: btnBg,
    ['--mp-btn-fg' as string]: btnFg,
    ['--mp-text' as string]: text,
    ['--mp-muted' as string]: muted,
    ['--mp-card' as string]: card,
    ['--mp-surface' as string]: surface,
    ['--mp-border' as string]: light ? 'rgb(0 0 0 / .08)' : 'rgb(255 255 255 / .1)',
    color: text,
    backgroundColor: surface === 'transparent' ? undefined : surface,
  }
}

function MpShell({
  settings,
  children,
  className,
}: {
  settings: Record<string, unknown>
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('mp-theme text-[15px] leading-snug', className)} style={resolveMpTheme(settings)}>
      {children}
    </div>
  )
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(Math.min(5, Math.max(0, value)))
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" aria-label={`${value} из 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          fill={i < full ? 'currentColor' : 'none'}
          strokeWidth={i < full ? 0 : 1.5}
          className={i < full ? '' : 'text-[var(--mp-muted)] opacity-50'}
        />
      ))}
    </span>
  )
}

function MpGalleryWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const ids = useMemo(() => {
    const g = product?.gallery?.length ? product.gallery : []
    if (product?.media_id && !g.includes(Number(product.media_id))) {
      return [Number(product.media_id), ...g]
    }
    return g
  }, [product])
  const [active, setActive] = useState(0)
  const current = ids[active] ?? ids[0]

  if (!ids.length) {
    return (
      <MpShell settings={settings}>
        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-[var(--mp-border)] bg-[var(--mp-card)] text-sm text-[var(--mp-muted)]">
          {editMode ? 'Галерея: media_id + gallery[]' : 'Нет изображений'}
        </div>
      </MpShell>
    )
  }

  return (
    <MpShell settings={settings}>
      <div className="flex gap-3">
        {ids.length > 1 ? (
          <div className="hidden w-14 shrink-0 flex-col gap-2 sm:flex">
            {ids.map((id, i) => (
              <button
                key={`${id}-${i}`}
                type="button"
                onClick={() => setActive(i)}
                className={clsx(
                  'h-14 w-14 overflow-hidden rounded-xl border-2 bg-[var(--mp-card)]',
                  i === active ? 'border-[var(--mp-accent)]' : 'border-transparent opacity-80 hover:opacity-100',
                )}
              >
                <MediaImage media={id as never} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-[var(--mp-border)] bg-[var(--mp-card)]">
          <MediaImage
            media={current as never}
            alt={product?.title || ''}
            className="aspect-square w-full object-contain"
          />
          {ids.length > 1 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto p-2 sm:hidden">
              {ids.map((id, i) => (
                <button
                  key={`m-${id}-${i}`}
                  type="button"
                  onClick={() => setActive(i)}
                  className={clsx(
                    'h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2',
                    i === active ? 'border-[var(--mp-accent)]' : 'border-[var(--mp-border)]',
                  )}
                >
                  <MediaImage media={id as never} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </MpShell>
  )
}

function MpTitleBlockWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const m = mpMeta(product)
  if (!product && !editMode) return null
  const verifiedLabel = String(settings.verified_label || 'Проверено')

  return (
    <MpShell settings={settings} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {m.brand ? <span className="text-sm font-semibold text-[var(--mp-text)]">{m.brand}</span> : null}
        {m.original ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mp-accent)]/35 bg-[var(--mp-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--mp-accent)]">
            <BadgeCheck size={12} />
            {verifiedLabel}
          </span>
        ) : null}
      </div>
      <h1 className="font-heading text-xl font-semibold tracking-[-0.03em] text-[var(--mp-text)] sm:text-2xl">
        {product?.title || 'Название товара'}
      </h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--mp-muted)]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--mp-text)]">
          <Star size={15} className="text-amber-400" fill="currentColor" strokeWidth={0} />
          {m.rating.toFixed(1).replace('.', ',')}
        </span>
        <span>{m.reviewsCount || (editMode ? 67 : 0)} отзывов</span>
        {(m.questionsCount > 0 || editMode) ? <span>{m.questionsCount || 15} вопросов</span> : null}
      </div>
    </MpShell>
  )
}

function MpSpecsWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const m = mpMeta(product)
  const [open, setOpen] = useState(false)
  const limit = Number(settings.preview_limit) > 0 ? Number(settings.preview_limit) : 5
  const specs = m.specs.length
    ? m.specs
    : (editMode
      ? [
          { label: 'Артикул', value: product?.sku || 'PKG-001' },
          { label: 'Модель', value: 'Pro Pack' },
          { label: 'Гарантия', value: String(product?.attrs?.detection ?? '12 месяцев') },
          { label: 'Доставка', value: m.delivery || 'Мгновенно' },
          { label: 'Лицензия', value: '1 пользователь' },
        ]
      : [])
  const preview = specs.slice(0, limit)
  const groups = useMemo(() => {
    const map = new Map<string, MpSpec[]>()
    for (const s of specs) {
      const g = s.group || 'Основное'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(s)
    }
    return [...map.entries()]
  }, [specs])

  if (!specs.length) return null

  const buyLabel = String(settings.buy_label || 'Купить')
  const cartLabel = String(settings.cart_label || 'Оформить')

  return (
    <MpShell settings={settings}>
      <dl className="space-y-2.5">
        {preview.map((s) => (
          <div key={s.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-3 text-sm">
            <dt className="text-[var(--mp-muted)]">{s.label}</dt>
            <dd className="font-medium text-[var(--mp-text)]">{s.value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="mt-4 text-sm font-medium text-[var(--mp-accent)] underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        {String(settings.open_label || 'Подробные характеристики')}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Закрыть" onClick={() => setOpen(false)} />
          <aside
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--mp-border)] shadow-2xl"
            style={resolveMpTheme(settings)}
          >
            <div className="flex items-center justify-between border-b border-[var(--mp-border)] bg-[var(--mp-card)] px-4 py-3">
              <h2 className="text-base font-semibold text-[var(--mp-text)]">Характеристики</h2>
              <button type="button" className="rounded-full p-2 text-[var(--mp-muted)] hover:bg-white/5" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-quiet-scroll flex-1 overflow-y-auto bg-[var(--mp-card)] px-4 py-4">
              {groups.map(([group, rows]) => (
                <section key={group} className="mb-6">
                  <h3 className="mb-3 text-sm font-bold text-[var(--mp-text)]">{group}</h3>
                  <dl className="space-y-2.5">
                    {rows.map((s) => (
                      <div key={`${group}-${s.label}`} className="flex items-baseline gap-2 text-sm">
                        <dt className="shrink-0 text-[var(--mp-muted)]">{s.label}</dt>
                        <dd className="min-w-0 flex-1 border-b border-dotted border-[var(--mp-border)]" />
                        <dd className="shrink-0 font-semibold text-[var(--mp-text)]">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              {product?.description ? (
                <section className="prose prose-sm max-w-none text-[var(--mp-muted)]">
                  <RichText html={String(product.description)} />
                </section>
              ) : null}
            </div>
            <div className="border-t border-[var(--mp-border)] bg-[var(--mp-card)] px-4 py-3">
              <p className="text-xl font-bold text-[var(--mp-price)]">{formatProductPrice(product)}</p>
              <p className="mt-0.5 text-xs text-[var(--mp-muted)]">{m.delivery}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to={product ? `/payment?item=product:${product.id}` : '/payment'}
                  className="flex h-11 items-center justify-center rounded-xl border border-[var(--mp-accent)] text-sm font-semibold text-[var(--mp-accent)]"
                  onClick={editMode ? (e) => e.preventDefault() : undefined}
                >
                  {buyLabel}
                </Link>
                <Link
                  to={product ? `/payment?item=product:${product.id}` : '/payment'}
                  className="flex h-11 items-center justify-center rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--mp-btn-bg)', color: 'var(--mp-btn-fg)' }}
                  onClick={editMode ? (e) => e.preventDefault() : undefined}
                >
                  {cartLabel}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </MpShell>
  )
}

function MpBuyCardWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const m = mpMeta(product)
  if (!product && !editMode) return null

  const price = formatProductPrice(product) || '1 890 ₽'
  const buyLabel = String(settings.buy_label || 'Купить')
  const cartLabel = String(settings.cart_label || 'Оформить')
  const href = product ? `/payment?item=product:${product.id}` : '/payment'
  const purchasable = product?.is_purchasable !== false && product?.is_purchasable !== 0

  const primaryBtn = (
    className: string,
    label: string,
    withIcon?: boolean,
  ) => {
    const inner = (
      <>
        {withIcon ? <ShoppingCart size={16} /> : null}
        {label}
      </>
    )
    const style = { background: 'var(--mp-btn-bg)', color: 'var(--mp-btn-fg)' }
    if (editMode) {
      return <span className={className} style={style}>{inner}</span>
    }
    return <Link to={href} className={className} style={style}>{inner}</Link>
  }

  const outlineBtn = (className: string, label: string) => {
    if (editMode) {
      return (
        <span className={className} style={{ borderColor: 'var(--mp-accent)', color: 'var(--mp-accent)' }}>
          {label}
        </span>
      )
    }
    return (
      <Link
        to={href}
        className={className}
        style={{ borderColor: 'var(--mp-accent)', color: 'var(--mp-accent)' }}
      >
        {label}
      </Link>
    )
  }

  return (
    <MpShell settings={settings}>
      <div className="rounded-2xl border border-[var(--mp-border)] bg-[var(--mp-card)] p-4 sm:p-5">
        {m.promoEnds ? (
          <p className="mb-2 text-xs font-medium text-[var(--mp-accent)]">{m.promoEnds}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <p className="font-heading text-3xl font-semibold tracking-tight text-[var(--mp-price)]">{price}</p>
          {m.oldPrice != null ? (
            <p className="pb-1 text-sm text-[var(--mp-muted)] line-through">
              {formatMoney(m.oldPrice, product?.currency)}
            </p>
          ) : null}
          {(m.priceTag || m.discount) ? (
            <span className="mb-1 rounded-md bg-[var(--mp-accent)]/15 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--mp-accent)]">
              {m.priceTag || m.discount}
            </span>
          ) : null}
        </div>

        {purchasable || editMode ? (
          <div className="mt-4 space-y-2">
            {primaryBtn('flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition hover:opacity-95', cartLabel, true)}
            {outlineBtn('flex h-12 w-full items-center justify-center rounded-xl border-2 text-sm font-semibold transition hover:opacity-90', buyLabel)}
          </div>
        ) : null}

        <ul className="mt-4 space-y-2.5 border-t border-[var(--mp-border)] pt-4 text-sm text-[var(--mp-muted)]">
          <li className="flex items-start gap-2">
            <Truck size={16} className="mt-0.5 shrink-0 text-[var(--mp-accent)]" />
            <span>
              Доставка: <strong className="font-semibold text-[var(--mp-text)]">{m.delivery || '—'}</strong>
            </span>
          </li>
          {m.seller ? (
            <li className="flex items-start gap-2">
              <BadgeCheck size={16} className="mt-0.5 shrink-0 text-[var(--mp-accent)]" />
              <span>
                {m.seller}
                {m.sellerRating ? <span> · {m.sellerRating}</span> : null}
              </span>
            </li>
          ) : null}
        </ul>
      </div>
    </MpShell>
  )
}

function MpReviewsWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const m = mpMeta(product)
  const [tab, setTab] = useState<'ratings' | 'questions'>('ratings')
  const reviews = m.reviews.length
    ? m.reviews
    : (editMode
      ? [
          { name: 'Анна', date: '12 марта', rating: 5, text: 'Всё понятно, быстро запустились. Рекомендую.' },
          { name: 'Игорь', date: '3 марта', rating: 5, text: 'Хороший набор секций, сэкономили время на старте.' },
          {
            name: 'Юрий',
            date: '28 февраля',
            rating: 4,
            text: 'Удобно править под свой бренд.',
            pros: ['Удобно пользоваться', 'Хорошее качество'],
          },
        ]
      : [])

  if (!reviews.length && !editMode && !m.reviewsCount) return null

  const scrollRef = (dir: 1 | -1) => {
    const el = document.getElementById('mp-reviews-rail')
    if (!el) return
    el.scrollBy({ left: dir * 280, behavior: 'smooth' })
  }

  return (
    <MpShell settings={settings} className="rounded-2xl border border-[var(--mp-border)] bg-[var(--mp-card)] p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--mp-border)] pb-3">
        <button
          type="button"
          className={clsx('text-sm font-semibold', tab === 'ratings' ? 'text-[var(--mp-text)]' : 'text-[var(--mp-muted)]')}
          onClick={() => setTab('ratings')}
        >
          Отзывы <span className="font-normal text-[var(--mp-muted)]">{m.reviewsCount || reviews.length}</span>
        </button>
        <button
          type="button"
          className={clsx('text-sm font-semibold', tab === 'questions' ? 'text-[var(--mp-text)]' : 'text-[var(--mp-muted)]')}
          onClick={() => setTab('questions')}
        >
          Вопросы <span className="font-normal text-[var(--mp-muted)]">{m.questionsCount || 0}</span>
        </button>
      </div>

      {tab === 'ratings' ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <p className="font-heading text-4xl font-semibold tracking-tight text-[var(--mp-text)]">
              {m.rating.toFixed(1).replace('.', ',')}
            </p>
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mp-accent)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--mp-accent)]">
                {String(settings.badge_label || 'Высокий рейтинг')}
              </p>
              <p className="mt-1 text-xs text-[var(--mp-muted)]">{m.reviewsCount || reviews.length} отзывов</p>
            </div>
          </div>

          <div className="relative mt-5">
            <div id="mp-reviews-rail" className="flex gap-3 overflow-x-auto pb-2 scroll-smooth">
              {reviews.map((r, i) => (
                <article
                  key={`${r.name}-${i}`}
                  className="w-[min(100%,280px)] shrink-0 rounded-2xl border border-[var(--mp-border)] bg-[var(--mp-surface)] p-4"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--mp-text)]">{r.name}</p>
                      {r.date ? <p className="text-xs text-[var(--mp-muted)]">{r.date}</p> : null}
                    </div>
                    <Stars value={r.rating ?? 5} size={12} />
                  </div>
                  <p className="text-sm leading-relaxed text-[var(--mp-muted)]">{r.text}</p>
                  {r.pros?.length ? (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[11px] font-medium text-[var(--mp-muted)]">Плюсы</p>
                      <div className="flex flex-wrap gap-1.5">
                        {r.pros.map((p) => (
                          <span key={p} className="rounded-md bg-[var(--mp-accent)]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--mp-accent)]">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {reviews.length > 1 ? (
              <>
                <button
                  type="button"
                  className="absolute -left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-card)] text-[var(--mp-text)] shadow sm:flex"
                  onClick={() => scrollRef(-1)}
                  aria-label="Назад"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="absolute -right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--mp-border)] bg-[var(--mp-card)] text-[var(--mp-text)] shadow sm:flex"
                  onClick={() => scrollRef(1)}
                  aria-label="Вперёд"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            ) : null}
          </div>

          <button
            type="button"
            className="mt-5 flex h-12 w-full max-w-xs items-center justify-center rounded-2xl text-sm font-semibold"
            style={{ background: 'color-mix(in srgb, var(--mp-accent) 18%, transparent)', color: 'var(--mp-accent)' }}
            onClick={editMode ? undefined : () => setTab('ratings')}
          >
            {String(settings.all_label || 'Все отзывы')}
          </button>
        </>
      ) : (
        <p className="mt-6 text-sm text-[var(--mp-muted)]">
          {editMode ? 'Вопросы появятся здесь (attrs.questions_count).' : 'Пока нет вопросов.'}
        </p>
      )}
    </MpShell>
  )
}

function MpCatalogCardWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const m = mpMeta(product)
  if (!product) return null

  const delivery = String(settings.delivery_label || m.delivery || 'Купить')
  const href = `/products/${product.slug}`
  const payHref = `/payment?item=product:${product.id}`

  return (
    <MpShell settings={settings}>
      <article className="flex h-full flex-col overflow-hidden">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-[var(--mp-border)] bg-[var(--mp-card)]">
          {product.media_id ? (
            <Link to={href} onClick={editMode ? (e) => e.preventDefault() : undefined}>
              <MediaImage media={product.media_id as never} alt={product.title} className="h-full w-full object-cover" />
            </Link>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--mp-muted)]">Нет фото</div>
          )}
          <button type="button" className="absolute right-2 top-2 rounded-full bg-black/40 p-2 text-white/90" aria-label="В избранное">
            <Heart size={16} />
          </button>
          {m.discount ? (
            <span className="absolute bottom-2 left-2 rounded-full bg-[var(--mp-accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--mp-btn-fg)]">
              {m.discount}
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col pt-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-lg font-bold text-[var(--mp-price)]">{formatProductPrice(product)}</p>
            {m.oldPrice != null ? (
              <p className="text-sm text-[var(--mp-muted)] line-through">{formatMoney(m.oldPrice, product.currency)}</p>
            ) : null}
          </div>
          <Link
            to={href}
            className="mt-1 line-clamp-2 text-sm text-[var(--mp-text)] hover:text-[var(--mp-accent)]"
            onClick={editMode ? (e) => e.preventDefault() : undefined}
          >
            {m.brand ? <strong>{m.brand}</strong> : null}
            {m.brand ? ' / ' : null}
            {product.title}
          </Link>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--mp-muted)]">
            <Star size={12} className="text-amber-400" fill="currentColor" strokeWidth={0} />
            <span className="font-semibold text-[var(--mp-text)]">{m.rating.toFixed(1)}</span>
            <span>{m.reviewsCount || 0} отзывов</span>
          </p>
          {m.original ? (
            <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full border border-[var(--mp-accent)]/30 px-2 py-0.5 text-[10px] font-medium text-[var(--mp-accent)]">
              <BadgeCheck size={11} /> {String(settings.verified_label || 'Проверено')}
            </span>
          ) : null}
          <Link
            to={payHref}
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--mp-btn-bg)', color: 'var(--mp-btn-fg)' }}
            onClick={editMode ? (e) => e.preventDefault() : undefined}
          >
            <ShoppingCart size={14} />
            {delivery}
          </Link>
        </div>
      </article>
    </MpShell>
  )
}

const themeDefaults = {
  tone: 'site',
  accent_color: '',
  price_color: '',
  button_bg: '',
  button_text: '',
  text_color: '',
  muted_color: '',
  card_bg: '',
  surface_bg: '',
}

export function registerMarketplaceWidgets() {
  registerWidget({
    type: 'product-mp-gallery',
    label: 'Витрина: галерея',
    category: 'commerce',
    defaultSettings: { ...themeDefaults },
    settingsFields: [...THEME_FIELDS],
    Render: MpGalleryWidget,
  })
  registerWidget({
    type: 'product-mp-title',
    label: 'Витрина: название и рейтинг',
    category: 'commerce',
    defaultSettings: { ...themeDefaults, verified_label: 'Проверено' },
    settingsFields: [
      ...THEME_FIELDS,
      { key: 'verified_label', label: 'Бейдж проверки', type: 'text' },
    ],
    Render: MpTitleBlockWidget,
  })
  registerWidget({
    type: 'product-mp-specs',
    label: 'Витрина: характеристики',
    category: 'commerce',
    defaultSettings: {
      ...themeDefaults,
      preview_limit: 5,
      open_label: 'Подробные характеристики',
      buy_label: 'Купить',
      cart_label: 'Оформить',
    },
    settingsFields: [
      ...THEME_FIELDS,
      { key: 'preview_limit', label: 'Строк в превью', type: 'number' },
      { key: 'open_label', label: 'Текст ссылки', type: 'text' },
      { key: 'buy_label', label: 'Кнопка «Купить»', type: 'text' },
      { key: 'cart_label', label: 'Кнопка оформления', type: 'text' },
    ],
    Render: MpSpecsWidget,
  })
  registerWidget({
    type: 'product-mp-buy',
    label: 'Витрина: карточка покупки',
    category: 'commerce',
    defaultSettings: {
      ...themeDefaults,
      cart_label: 'Оформить',
      buy_label: 'Купить',
    },
    settingsFields: [
      ...THEME_FIELDS,
      { key: 'cart_label', label: 'Основная кнопка', type: 'text' },
      { key: 'buy_label', label: 'Вторичная кнопка', type: 'text' },
    ],
    Render: MpBuyCardWidget,
  })
  registerWidget({
    type: 'product-mp-reviews',
    label: 'Витрина: отзывы',
    category: 'commerce',
    defaultSettings: {
      ...themeDefaults,
      all_label: 'Все отзывы',
      badge_label: 'Высокий рейтинг',
    },
    settingsFields: [
      ...THEME_FIELDS,
      { key: 'all_label', label: 'Кнопка всех отзывов', type: 'text' },
      { key: 'badge_label', label: 'Плашка рейтинга', type: 'text' },
    ],
    Render: MpReviewsWidget,
  })
  registerWidget({
    type: 'product-mp-card',
    label: 'Витрина: карточка каталога',
    category: 'commerce',
    defaultSettings: { ...themeDefaults, delivery_label: '', verified_label: 'Проверено' },
    settingsFields: [
      ...THEME_FIELDS,
      { key: 'delivery_label', label: 'Текст на кнопке', type: 'text' },
      { key: 'verified_label', label: 'Бейдж проверки', type: 'text' },
    ],
    Render: MpCatalogCardWidget,
  })
}
