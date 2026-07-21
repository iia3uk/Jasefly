import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Play, Shield, ShoppingCart, Gift } from 'lucide-react'
import { registerWidget } from '@/builder/registry'
import { MediaImage, RichText } from '@/components/ui'
import { useProductEntity } from '@/builder/context/ProductEntityContext'
import { DEMO_PRODUCT, formatMoney, resolveBoundString } from '@/builder/bind/resolveBound'
import type { Product, ProductTab, ProductVariant } from '@/types'

function useStoreProduct(editMode?: boolean): Product | null {
  return useProductEntity() ?? (editMode ? DEMO_PRODUCT : null)
}

function curSymbol(p: Product | null): string {
  return !p?.currency || p.currency === 'RUB' ? '₽' : p.currency
}

function ProductBadgeWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const text = resolveBoundString(settings, 'text', { product, editMode }, product?.badge || 'STATUS')
  if (!text && !editMode) return null
  const tone = String(settings.tone || 'success')
  const cls =
    tone === 'accent'
      ? 'border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]'
      : tone === 'muted'
        ? 'border-white/15 bg-white/5 text-zinc-300'
        : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      <Shield size={12} />
      {text || 'BADGE'}
    </span>
  )
}

function ProductStatsWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const showDetection = settings.show_detection !== false
  const showStock = settings.show_stock !== false
  const showSold = settings.show_sold !== false
  const detection = String(product?.attrs?.detection ?? '')
  const items: Array<{ icon: typeof Shield; label: string }> = []
  if (showDetection && (detection || editMode)) {
    items.push({ icon: Shield, label: `Гарантия: ${detection || '—'}` })
  }
  if (showStock && (product?.stock != null || editMode)) {
    items.push({ icon: Gift, label: `${product?.stock ?? '∞'} в наличии` })
  }
  if (showSold && ((product?.sold_count ?? 0) > 0 || editMode)) {
    items.push({ icon: ShoppingCart, label: `${product?.sold_count ?? 0} продано` })
  }
  if (!items.length) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((it) => (
        <li
          key={it.label}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-300"
        >
          <it.icon size={13} className="text-[var(--accent,#8eb6ff)]" />
          {it.label}
        </li>
      ))}
    </ul>
  )
}

function ProductTagsWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const tags = product?.tags?.length ? product.tags : (editMode ? ['Шаблоны', 'Дизайн'] : [])
  if (!tags.length) return null
  const prefix = typeof settings.prefix === 'string' ? settings.prefix : '#'
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <li
          key={t}
          className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400"
        >
          {prefix}{t}
        </li>
      ))}
    </ul>
  )
}

function ProductExpandableTextWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const [open, setOpen] = useState(false)
  const html = resolveBoundString(
    settings,
    'html',
    { product, editMode },
    product?.short_description || product?.description || '<p>Описание</p>',
  )
  const moreLabel = String(settings.more_label || 'Развернуть')
  const lessLabel = String(settings.less_label || 'Свернуть')
  const collapsed = !open && !editMode
  return (
    <div>
      <div className={collapsed ? 'line-clamp-3 text-sm text-[var(--muted)]' : 'text-sm text-[var(--muted)]'}>
        <RichText html={html.includes('<') ? html : `<p>${html}</p>`} />
      </div>
      {!editMode ? (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? lessLabel : moreLabel}
          <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
        </button>
      ) : null}
    </div>
  )
}

function ProductGalleryWidget({
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
      <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-white/15 text-sm text-zinc-500">
        {editMode ? 'Галерея: media_id + gallery[] у товара' : 'Нет изображений'}
      </div>
    )
  }

  const ratio = String(settings.ratio || 'square')
  return (
    <div className="space-y-3">
      <MediaImage
        media={current as never}
        alt={product?.title || ''}
        className="w-full rounded-2xl object-cover"
        style={{ aspectRatio: ratio === '16/9' ? '16/9' : '1' }}
      />
      {ids.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          {ids.map((id, i) => (
            <button
              key={`${id}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${i === active ? 'border-[var(--accent)]' : 'border-white/10'}`}
            >
              <MediaImage media={id as never} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ProductVideoWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const url = resolveBoundString(settings, 'url', { product, editMode }, product?.video_url || '')
  const label = String(settings.label || 'Смотреть видео')
  if (!url && !editMode) return null
  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noreferrer"
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.08]"
      onClick={editMode ? (e) => e.preventDefault() : undefined}
    >
      <Play size={16} className="text-[var(--accent)]" />
      {label}
    </a>
  )
}

function ProductTabsWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const tabs: ProductTab[] = product?.tabs?.length
    ? product.tabs
    : (editMode
      ? [{ label: 'Функционал', html: '<p>Контент вкладки из поля tabs у товара</p>' }, { label: 'Отзывы', html: '<p>…</p>' }]
      : [])
  const [active, setActive] = useState(0)
  if (!tabs.length) return null
  const current = tabs[Math.min(active, tabs.length - 1)]
  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-white/10">
        {tabs.map((t, i) => (
          <button
            key={`${t.label}-${i}`}
            type="button"
            onClick={() => setActive(i)}
            className={`px-3 py-2 text-sm transition ${i === active ? 'border-b-2 border-[var(--accent)] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="prose mt-4 max-w-none text-sm">
        <RichText html={String(current?.html || settings.empty_html || '<p></p>')} />
      </div>
    </div>
  )
}

function ProductVariantsWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const product = useStoreProduct(editMode)
  const variants: ProductVariant[] = product?.variants?.length
    ? product.variants
    : (editMode
      ? [
          { label: '1 день', price: 285, old_price: 300 },
          { label: '30 дней', price: 1891, old_price: 1990, highlight: 'ВЫГОДНО', discount_label: '-78%' },
        ]
      : [])
  const [idx, setIdx] = useState(() => {
    const hi = variants.findIndex((v) => v.highlight)
    return hi >= 0 ? hi : 0
  })
  const [accept, setAccept] = useState(false)
  const title = String(settings.title || 'Оформление заказа')
  const cta = String(settings.button_label || 'Перейти к оплате')
  const showPromo = settings.show_promo !== false
  const promoText = String(settings.promo_text || 'Для этого товара доступен промокод!')
  const offerLabel = String(settings.offer_label || 'Я согласен с условиями оферты')
  const selected = variants[idx] ?? variants[0]
  const symbol = curSymbol(product)

  if (!variants.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-zinc-500">
        Добавьте тарифы в поле variants у товара (JSON).
      </div>
    )
  }

  const href = product
    ? `/payment?item=product:${product.id}&variant=${idx}`
    : '/payment'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h3 className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
        {title}
      </h3>
      <ul className="space-y-2">
        {variants.map((v, i) => {
          const active = i === idx
          return (
            <li key={`${v.label}-${i}`}>
              <button
                type="button"
                onClick={() => setIdx(i)}
                className={`relative flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${active ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-zinc-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-100">{v.label}</span>
                  {v.per_day != null ? (
                    <span className="text-[11px] text-zinc-500">−{v.per_day}{symbol}/день</span>
                  ) : null}
                </span>
                <span className="text-right">
                  {v.old_price != null && Number(v.old_price) > Number(v.price) ? (
                    <span className="mr-2 text-xs text-zinc-500 line-through">{v.old_price}{symbol}</span>
                  ) : null}
                  <span className="text-sm font-semibold text-white">{v.price}{symbol}</span>
                  {v.discount_label ? (
                    <span className="mt-0.5 block text-[10px] font-bold text-emerald-400">{v.discount_label}</span>
                  ) : null}
                </span>
                {v.highlight ? (
                  <span className="absolute -right-1 -top-2 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-black">
                    {v.highlight}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {showPromo ? (
        <p className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
          {promoText}
        </p>
      ) : null}

      <label className="mt-4 flex items-start gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          disabled={editMode}
        />
        <span>
          {offerLabel}{' '}
          <Link to="/offer" className="link-text" onClick={editMode ? (e) => e.preventDefault() : undefined}>
            офертой
          </Link>
        </span>
      </label>

      {editMode ? (
        <span className="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--accent,#2563eb)] px-4 py-3 text-sm font-semibold text-white">
          {cta}
          {selected ? ` · ${formatMoney(selected.price, product?.currency)}` : ''}
        </span>
      ) : (
        <Link
          to={accept ? href : '#'}
          onClick={(e) => {
            if (!accept) e.preventDefault()
          }}
          className={`mt-4 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
            accept ? 'bg-[var(--accent,#2563eb)] hover:opacity-90' : 'cursor-not-allowed bg-zinc-700 opacity-60'
          }`}
        >
          {cta}
        </Link>
      )}
    </div>
  )
}

export function registerProductStorefrontWidgets() {
  registerWidget({
    type: 'product-badge',
    label: 'Бейдж товара',
    category: 'commerce',
    defaultSettings: { text: '', text_dynamic: true, text_bind: 'badge', tone: 'success' },
    settingsFields: [
      { key: 'text', label: 'Текст', type: 'text', bindable: true },
      { key: 'tone', label: 'Стиль', type: 'select', options: [
        { value: 'success', label: 'Зелёный' },
        { value: 'accent', label: 'Акцент' },
        { value: 'muted', label: 'Нейтральный' },
      ] },
    ],
    Render: ProductBadgeWidget,
  })

  registerWidget({
    type: 'product-stats',
    label: 'Статистика товара',
    category: 'commerce',
    defaultSettings: { show_detection: true, show_stock: true, show_sold: true },
    settingsFields: [
      { key: 'show_detection', label: 'Гарантия / статус (attrs.detection)', type: 'toggle' },
      { key: 'show_stock', label: 'Остаток', type: 'toggle' },
      { key: 'show_sold', label: 'Продано', type: 'toggle' },
    ],
    Render: ProductStatsWidget,
  })

  registerWidget({
    type: 'product-tags',
    label: 'Теги товара',
    category: 'commerce',
    defaultSettings: { prefix: '# ' },
    settingsFields: [
      { key: 'prefix', label: 'Префикс', type: 'text' },
    ],
    Render: ProductTagsWidget,
  })

  registerWidget({
    type: 'product-expandable',
    label: 'Описание (развернуть)',
    category: 'commerce',
    defaultSettings: {
      html: '',
      html_dynamic: true,
      html_bind: 'short_description',
      more_label: 'Развернуть',
      less_label: 'Свернуть',
    },
    settingsFields: [
      { key: 'html', label: 'Текст', type: 'richtext', bindable: true },
      { key: 'more_label', label: 'Кнопка «ещё»', type: 'text' },
      { key: 'less_label', label: 'Кнопка «свернуть»', type: 'text' },
    ],
    Render: ProductExpandableTextWidget,
  })

  registerWidget({
    type: 'product-gallery',
    label: 'Галерея товара',
    category: 'commerce',
    defaultSettings: { ratio: 'square' },
    settingsFields: [
      { key: 'ratio', label: 'Пропорции', type: 'select', options: [
        { value: 'square', label: '1:1' },
        { value: '16/9', label: '16:9' },
      ] },
    ],
    Render: ProductGalleryWidget,
  })

  registerWidget({
    type: 'product-video',
    label: 'Кнопка видео',
    category: 'commerce',
    defaultSettings: {
      url: '',
      url_dynamic: true,
      url_bind: 'video_url',
      label: 'Смотреть видео',
    },
    settingsFields: [
      { key: 'url', label: 'URL', type: 'url', bindable: true },
      { key: 'label', label: 'Текст кнопки', type: 'text' },
    ],
    Render: ProductVideoWidget,
  })

  registerWidget({
    type: 'product-tabs',
    label: 'Вкладки товара',
    category: 'commerce',
    defaultSettings: { empty_html: '<p></p>' },
    settingsFields: [
      { key: 'empty_html', label: 'Пустой fallback HTML', type: 'textarea' },
    ],
    Render: ProductTabsWidget,
  })

  registerWidget({
    type: 'product-variants',
    label: 'Тарифы / оформление',
    category: 'commerce',
    defaultSettings: {
      title: 'Оформление заказа',
      button_label: 'Перейти к оплате',
      show_promo: true,
      promo_text: 'Для этого товара доступен промокод!',
      offer_label: 'Я согласен с',
    },
    settingsFields: [
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'button_label', label: 'Кнопка', type: 'text' },
      { key: 'show_promo', label: 'Промо-баннер', type: 'toggle' },
      { key: 'promo_text', label: 'Текст промо', type: 'text' },
      { key: 'offer_label', label: 'Текст оферты', type: 'text' },
    ],
    Render: ProductVariantsWidget,
  })
}
