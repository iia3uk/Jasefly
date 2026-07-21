import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Check, CreditCard, Shield } from 'lucide-react'
import { api } from '@/lib/api'
import { MediaImage } from '@/components/ui'
import clsx from 'clsx'

export type ProviderInfo = {
  id: string
  label: string
  group: string
  configured: boolean
}

export type CatalogVariant = {
  label: string
  price?: number | null
  old_price?: number | null
  discount_label?: string | null
  highlight?: string | null
}

export type CatalogItem = {
  type: 'service' | 'product'
  id: number
  title: string
  slug?: string
  price: number
  currency: string
  description?: string
  offer_text?: string | null
  duration_label?: string | null
  media_id?: number | null
  badge?: string | null
  old_price?: number | null
  variants?: CatalogVariant[]
}

export type SellerInfo = {
  name?: string
  inn?: string
  ogrn?: string
  address?: string
  email?: string
  phone?: string
}

export type PayConfig = {
  providers?: ProviderInfo[]
  provider: string
  default_provider?: string
  currency: string
  currency_symbol: string
  merchant_name: string
  test_mode: boolean
  configured: boolean
  acquiring_ready?: boolean
  catalog_mode?: boolean
  allow_open_amount?: boolean
  offer_url?: string
  offer_title?: string
  offer_html?: string
  seller?: SellerInfo
  payment_icons?: string[]
  catalog?: CatalogItem[]
  cloudpayments_public_id?: string
}

type CheckoutResult = {
  mode: 'redirect' | 'widget'
  redirect_url?: string
  widget?: {
    publicId: string
    description: string
    amount: number
    currency: string
    invoiceId: string
    accountId?: string | null
    email?: string | null
    data?: Record<string, unknown>
  }
  success_url?: string
  fail_url?: string
  order_number?: string
  payment_id?: number
  message?: string
  provider_label?: string
  amount?: number
  item?: CatalogItem
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function money(amount: number, symbol: string): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return `0 ${symbol}`
  return `${n.toLocaleString('ru-RU')} ${symbol}`
}

declare global {
  interface Window {
    cp?: {
      CloudPayments: new () => {
        pay: (
          method: string,
          options: Record<string, unknown>,
          callbacks?: { onSuccess?: () => void; onFail?: () => void },
        ) => void
      }
    }
  }
}

function loadCloudPaymentsScript(): Promise<void> {
  if (window.cp?.CloudPayments) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cloudpayments]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('CloudPayments script failed')))
      return
    }
    const s = document.createElement('script')
    s.src = 'https://widget.cloudpayments.ru/bundles/cloudpayments.js'
    s.async = true
    s.dataset.cloudpayments = '1'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('CloudPayments script failed'))
    document.head.appendChild(s)
  })
}

export function usePayConfig(editMode?: boolean) {
  const [config, setConfig] = useState<PayConfig | null>(null)
  useEffect(() => {
    if (editMode) {
      setConfig({
        provider: 'manual',
        currency: 'RUB',
        currency_symbol: '₽',
        merchant_name: 'Demo',
        test_mode: true,
        configured: true,
        catalog_mode: true,
        catalog: [
          {
            type: 'product',
            id: 1,
            title: 'Pro Template Pack',
            price: 1890,
            currency: 'RUB',
            description: 'Демо-товар для превью формы',
            media_id: null,
            variants: [
              { label: '1 месяц', price: 490 },
              { label: '12 месяцев', price: 1890, highlight: 'Выгодно' },
            ],
          },
        ],
        payment_icons: ['mir', 'visa', 'mastercard', 'sbp'],
        seller: { name: 'Demo Seller' },
        offer_title: 'Публичная оферта',
        offer_url: '/offer',
      })
      return
    }
    let cancelled = false
    api.get<{ data?: PayConfig } | PayConfig>('/payments/config')
      .then((res) => {
        if (cancelled) return
        const data = res && typeof res === 'object' && 'data' in res
          ? (res as { data?: PayConfig }).data ?? null
          : (res as PayConfig)
        setConfig(data)
      })
      .catch(() => {
        if (!cancelled) setConfig(null)
      })
    return () => { cancelled = true }
  }, [editMode])
  return config
}

function FancyCheckbox({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-xs transition',
        checked
          ? 'border-[var(--pay-accent)]/50 bg-[var(--pay-accent)]/10'
          : 'border-white/12 bg-white/[0.02] hover:border-white/20',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={clsx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
          checked
            ? 'border-[var(--pay-accent)] bg-[var(--pay-accent)] text-[var(--pay-btn-fg,#061018)]'
            : 'border-white/25 bg-transparent text-transparent',
        )}
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1 leading-relaxed text-[var(--muted)]">{children}</span>
    </button>
  )
}

function resolveTheme(settings: Record<string, unknown>): CSSProperties {
  const accent = str(settings.accent_color).trim() || 'var(--accent, #8eb6ff)'
  const btnBg = str(settings.button_bg).trim() || accent
  const btnText = str(settings.button_text).trim() || 'var(--primary-foreground, #061018)'
  const price = str(settings.price_color).trim() || accent
  return {
    ['--pay-accent' as string]: accent,
    ['--pay-btn-bg' as string]: btnBg,
    ['--pay-btn-fg' as string]: btnText,
    ['--pay-price' as string]: price,
  }
}

export function PaymentCheckoutWidget({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const layout = str(settings.layout, 'classic') === 'marketplace' ? 'marketplace' : 'classic'
  const title = str(settings.title, layout === 'marketplace' ? 'Оформление заказа' : 'Оформить заказ')
  const subtitle = str(settings.subtitle, '')
  const buttonLabel = str(settings.button_label, layout === 'marketplace' ? 'Заказать' : 'Перейти к оплате')
  const presetType = str(settings.preset_item_type, '')
  const presetId = num(settings.preset_item_id, 0)
  const showSeller = settings.show_seller !== false
  const showIcons = settings.show_payment_icons !== false
  const showBack = settings.show_back !== false

  const config = usePayConfig(editMode)
  const [extraItems, setExtraItems] = useState<CatalogItem[]>([])
  const catalog = useMemo(() => {
    const base = config?.catalog ?? []
    const map = new Map<string, CatalogItem>()
    for (const c of [...base, ...extraItems]) {
      map.set(`${c.type}:${c.id}`, c)
    }
    return [...map.values()]
  }, [config?.catalog, extraItems])
  const catalogMode = Boolean(config?.catalog_mode) || catalog.length > 0
  const symbol = config?.currency_symbol || '₽'
  const theme = resolveTheme(settings)

  const [provider, setProvider] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [itemKey, setItemKey] = useState('')
  const [variantIndex, setVariantIndex] = useState<number | null>(null)
  const [acceptOffer, setAcceptOffer] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [hydrateError, setHydrateError] = useState('')

  // Parse URL item once + keep in sync when config arrives.
  useEffect(() => {
    if (!config && !editMode) return
    const ready = (config?.providers ?? []).filter((p) => p.configured)
    const preferred = config?.default_provider || config?.provider
    const pick = ready.find((p) => p.id === preferred)?.id ?? ready[0]?.id ?? preferred ?? 'manual'
    setProvider(pick)

    let fromUrl = ''
    let variantFromUrl: number | null = null
    try {
      const params = new URLSearchParams(window.location.search)
      const q = params.get('item') || ''
      if (/^(service|product):\d+$/.test(q)) fromUrl = q
      const v = params.get('variant')
      if (v != null && v !== '' && Number.isFinite(Number(v))) variantFromUrl = Number(v)
    } catch { /* ignore */ }

    if (fromUrl) {
      setItemKey(fromUrl)
    } else if (presetType && presetId > 0) {
      const found = catalog.find((c) => c.type === presetType && Number(c.id) === presetId)
      if (found) setItemKey(`${found.type}:${found.id}`)
    } else if (catalog.length === 1) {
      setItemKey(`${catalog[0].type}:${catalog[0].id}`)
    }
    if (variantFromUrl != null) setVariantIndex(variantFromUrl)
  }, [config, catalog, presetType, presetId, editMode])

  // If URL points to a product missing from catalog — fetch it.
  useEffect(() => {
    if (editMode || !itemKey.includes(':')) return
    const [type, idStr] = itemKey.split(':')
    const id = Number(idStr)
    if (!type || !id) return
    if (catalog.some((c) => c.type === type && Number(c.id) === id)) {
      setHydrateError('')
      return
    }
    let cancelled = false
    api.get<{ data?: CatalogItem } | CatalogItem>(`/commerce/item?type=${encodeURIComponent(type)}&id=${id}`)
      .then((res) => {
        if (cancelled) return
        const item = res && typeof res === 'object' && 'data' in res
          ? (res as { data?: CatalogItem }).data
          : (res as CatalogItem)
        if (item?.id) {
          setExtraItems((prev) => [...prev.filter((x) => !(x.type === item.type && x.id === item.id)), item])
          setHydrateError('')
        } else {
          setHydrateError('Товар по ссылке не найден')
        }
      })
      .catch(() => {
        if (!cancelled) setHydrateError('Не удалось загрузить товар из ссылки')
      })
    return () => { cancelled = true }
  }, [itemKey, catalog, editMode])

  const readyProviders = useMemo(
    () => (config?.providers ?? []).filter((p) => p.configured),
    [config],
  )
  const selected = readyProviders.find((p) => p.id === provider)
  const canPay = Boolean(selected?.configured || provider === 'manual')
  const selectedItem = useMemo(() => {
    if (!itemKey.includes(':')) return null
    const [type, id] = itemKey.split(':')
    return catalog.find((c) => c.type === type && String(c.id) === id) ?? null
  }, [itemKey, catalog])

  const variants = selectedItem?.variants?.length ? selectedItem.variants : []
  const activeVariant = (() => {
    if (!variants.length) return null
    const idx = variantIndex != null && variantIndex >= 0 ? variantIndex : 0
    return variants[idx] ?? null
  })()
  const effectiveVariantIndex = variants.length
    ? (variantIndex != null && variantIndex >= 0 ? variantIndex : 0)
    : null
  const payAmount = activeVariant?.price != null && activeVariant.price > 0
    ? Number(activeVariant.price)
    : (selectedItem?.price ?? (num(amount, 0) || 0))
  const oldAmount = activeVariant?.old_price != null
    ? Number(activeVariant.old_price)
    : (selectedItem?.old_price ?? null)
  const discount = oldAmount != null && oldAmount > payAmount
    ? Math.round(oldAmount - payAmount)
    : 0

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (editMode) return
    setError('')
    setInfo('')
    if (!provider) {
      setError('Выберите способ оплаты')
      return
    }

    const payload: Record<string, unknown> = {
      currency: config?.currency || 'RUB',
      name,
      email,
      provider,
      accept_offer: acceptOffer,
    }

    if (catalogMode || selectedItem) {
      if (!selectedItem) {
        setError('Выберите услугу или товар')
        return
      }
      if (!acceptOffer) {
        setError('Подтвердите согласие с договором-офертой')
        return
      }
      payload.item_type = selectedItem.type
      payload.item_id = selectedItem.id
      if (effectiveVariantIndex != null && effectiveVariantIndex >= 0) {
        payload.variant_index = effectiveVariantIndex
      }
    } else {
      const value = num(amount, 0)
      if (value <= 0) {
        setError('Укажите сумму больше нуля')
        return
      }
      payload.amount = value
    }

    setBusy(true)
    try {
      const res = await api.post<{ data: CheckoutResult }>('/payments/checkout', payload)
      const data = (res as { data?: CheckoutResult })?.data
      if (!data) throw new Error('Пустой ответ сервера')

      if (data.mode === 'redirect' && data.redirect_url) {
        window.location.href = data.redirect_url
        return
      }

      if (data.mode === 'widget' && data.widget) {
        await loadCloudPaymentsScript()
        const widget = new window.cp!.CloudPayments()
        widget.pay('charge', {
          publicId: data.widget.publicId,
          description: data.widget.description,
          amount: data.widget.amount,
          currency: data.widget.currency,
          invoiceId: data.widget.invoiceId,
          accountId: data.widget.accountId || undefined,
          email: data.widget.email || undefined,
          data: data.widget.data,
          skin: 'mini',
        }, {
          onSuccess: () => { window.location.href = data.success_url || '/payment-success' },
          onFail: () => { window.location.href = data.fail_url || '/payment-fail' },
        })
        return
      }

      setInfo(data.message || (data.order_number ? `Заказ ${data.order_number} создан` : 'Заказ создан'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось начать оплату')
    } finally {
      setBusy(false)
    }
  }

  const fieldClass = 'w-full rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--pay-accent)]'
  const labelClass = 'mb-1.5 block text-xs font-medium text-[var(--muted)]'

  const itemSelect = (catalogMode || catalog.length > 0) ? (
    <div>
      <span className={labelClass}>Услуга или товар</span>
      {catalog.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-sm text-[var(--muted)]">
          {hydrateError || 'В каталоге пока нет товаров с ценой. Проверьте «Видим» и цену в админке.'}
        </p>
      ) : (
        <select
          value={itemKey}
          onChange={(e) => {
            setItemKey(e.target.value)
            setVariantIndex(null)
          }}
          className={clsx(fieldClass, 'cursor-pointer [color-scheme:dark]')}
          disabled={editMode || busy || (presetType !== '' && presetId > 0)}
          required={catalogMode}
        >
          <option value="">Выберите…</option>
          {catalog.map((c) => (
            <option key={`${c.type}:${c.id}`} value={`${c.type}:${c.id}`}>
              {c.type === 'product' ? 'Товар' : 'Услуга'}: {c.title} — {money(c.price, symbol)}
            </option>
          ))}
        </select>
      )}
      {hydrateError && catalog.length > 0 ? (
        <p className="mt-1 text-xs text-amber-400">{hydrateError}</p>
      ) : null}
    </div>
  ) : null

  const offerBox = (catalogMode || selectedItem) ? (
    <FancyCheckbox
      checked={acceptOffer}
      onChange={setAcceptOffer}
      disabled={editMode || busy}
    >
      Согласен с{' '}
      <a
        href={config?.offer_url || '/offer'}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-[var(--pay-accent)] underline-offset-2 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {config?.offer_title || 'публичной офертой'}
      </a>
      {selectedItem?.offer_text ? ` — ${selectedItem.offer_text}` : ''}
    </FancyCheckbox>
  ) : null

  const variantPicker = variants.length > 0 ? (
    <div>
      <p className={labelClass}>Вариант</p>
      <ul className="space-y-2">
        {variants.map((v, i) => {
          const selected = variantIndex === i || (variantIndex == null && i === 0)
          const price = v.price != null ? Number(v.price) : selectedItem?.price ?? 0
          return (
            <li key={`${v.label}-${i}`}>
              <button
                type="button"
                disabled={editMode || busy}
                onClick={() => setVariantIndex(i)}
                className={clsx(
                  'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition',
                  selected
                    ? 'border-[var(--pay-accent)] bg-[var(--pay-accent)]/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--text)]">{v.label || `Вариант ${i + 1}`}</span>
                  {v.discount_label || v.highlight ? (
                    <span className="text-[11px] text-[var(--pay-accent)]">{v.highlight || v.discount_label}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold text-[var(--pay-price)]">{money(price, symbol)}</span>
                {selected ? <Check size={14} className="shrink-0 text-[var(--pay-accent)]" /> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  ) : null

  const providerPicker = readyProviders.length > 1 ? (
    layout === 'marketplace' ? (
      <div>
        <p className={labelClass}>Способ оплаты</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {readyProviders.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={editMode || busy}
                onClick={() => setProvider(p.id)}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition',
                  provider === p.id
                    ? 'border-[var(--pay-accent)] bg-[var(--pay-accent)]/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                )}
              >
                <CreditCard size={16} className="text-[var(--pay-accent)]" />
                <span className="font-medium text-[var(--text)]">{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <label className="block">
        <span className={labelClass}>Способ оплаты</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className={fieldClass}
          disabled={editMode || busy}
        >
          {readyProviders.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
    )
  ) : null

  const contactFields = (
    <>
      <label className="block">
        <span className={labelClass}>Имя</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
          placeholder="Как к вам обращаться"
          disabled={editMode || busy}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
          placeholder="you@example.com"
          disabled={editMode || busy}
          required={catalogMode}
        />
        {layout === 'marketplace' ? (
          <span className="mt-1 block text-[11px] text-[var(--muted)]">На почту придёт подтверждение заказа</span>
        ) : null}
      </label>
    </>
  )

  const submitBtn = (
    <button
      type="submit"
      disabled={editMode || busy || !canPay}
      className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold transition hover:opacity-95 disabled:opacity-50"
      style={{ background: 'var(--pay-btn-bg)', color: 'var(--pay-btn-fg)' }}
    >
      {busy ? 'Создание платежа…' : buttonLabel}
    </button>
  )

  const openAmount = !catalogMode ? (
    <label className="block">
      <span className={labelClass}>Сумма, {symbol}</span>
      <input
        type="number"
        min={1}
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={fieldClass}
        disabled={editMode || busy}
      />
    </label>
  ) : null

  if (layout === 'marketplace') {
    return (
      <div className="mx-auto w-full max-w-5xl" style={theme}>
        {showBack ? (
          <Link to="/products" className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)]">
            <ArrowLeft size={16} /> К каталогу
          </Link>
        ) : null}

        <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-[var(--surface,#0e1219)] p-4 sm:p-5">
              <h1 className="font-heading text-xl font-semibold sm:text-2xl">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}

              {selectedItem ? (
                <div className="mt-4 flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
                    {selectedItem.media_id ? (
                      <MediaImage media={selectedItem.media_id as never} alt={selectedItem.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-[var(--muted)]">Нет фото</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {selectedItem.badge ? (
                      <span className="mb-1 inline-flex rounded-md bg-[var(--pay-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--pay-accent)]">
                        {selectedItem.badge}
                      </span>
                    ) : null}
                    <p className="font-medium text-[var(--text)]">{selectedItem.title}</p>
                    {activeVariant?.label || selectedItem.duration_label ? (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{activeVariant?.label || selectedItem.duration_label}</p>
                    ) : null}
                    {selectedItem.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{selectedItem.description}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-[var(--pay-price)]">{money(payAmount, symbol)}</p>
                    {oldAmount != null && oldAmount > payAmount ? (
                      <p className="text-xs text-[var(--muted)] line-through">{money(oldAmount, symbol)}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {itemSelect}
                {variantPicker}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[var(--surface,#0e1219)] p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold">Контакты</h2>
              <div className="space-y-3">{contactFields}</div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[var(--surface,#0e1219)] p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold">Оплата</h2>
              <div className="space-y-3">
                {providerPicker}
                {openAmount}
                {offerBox}
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                {info ? <p className="text-sm text-emerald-400">{info}</p> : null}
                <div className="lg:hidden">{submitBtn}</div>
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-white/10 bg-[var(--surface,#0e1219)] p-4 sm:p-5 lg:sticky lg:top-24">
            <p className="text-sm font-semibold">Итого</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3 text-[var(--muted)]">
                <dt>{selectedItem ? 'Товар' : 'Сумма'}</dt>
                <dd>{money(payAmount || (oldAmount ?? 0), symbol)}</dd>
              </div>
              {discount > 0 ? (
                <div className="flex justify-between gap-3 text-[var(--muted)]">
                  <dt>Скидка</dt>
                  <dd className="text-[var(--pay-accent)]">− {money(discount, symbol)}</dd>
                </div>
              ) : null}
              <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-3">
                <dt className="text-base font-semibold text-[var(--text)]">К оплате</dt>
                <dd className="font-heading text-2xl font-semibold text-[var(--pay-price)]">{money(payAmount, symbol)}</dd>
              </div>
            </dl>
            <div className="mt-4 hidden lg:block">{submitBtn}</div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Shield size={12} className="text-[var(--pay-accent)]" />
              Безопасная оплата
              {selected ? ` · ${selected.label}` : ''}
              {config?.test_mode ? ' · тест' : ''}
            </p>
            {showIcons && (config?.payment_icons?.length || editMode) ? (
              <div className="mt-4">
                <PaymentMethodIconsMini icons={config?.payment_icons?.length ? config.payment_icons : ['mir', 'visa', 'mastercard', 'sbp']} />
              </div>
            ) : null}
            {showSeller && (config?.seller?.name || editMode) ? (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-[var(--muted)]">
                <BadgeCheck size={12} className="mt-0.5 shrink-0 text-[var(--pay-accent)]" />
                {config?.seller?.name || config?.merchant_name || 'Продавец'}
              </p>
            ) : null}
          </aside>
        </form>
      </div>
    )
  }

  // classic
  return (
    <div
      className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[var(--surface,#0e1219)] p-6 shadow-lg"
      style={theme}
    >
      <div className="mb-5 text-center">
        <h2 className="font-heading text-2xl font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
        {!editMode && config ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            {config.merchant_name || config.seller?.name || 'Оплата'}
            {selected ? ` · ${selected.label}` : ''}
            {config.test_mode ? ' · тест' : ''}
          </p>
        ) : null}
        {editMode ? <p className="mt-2 text-xs text-[var(--muted)]">Превью · стиль «Обычный»</p> : null}
      </div>

      <form onSubmit={onSubmit} className="space-y-3.5">
        {itemSelect}
        {variantPicker}
        {selectedItem && !variants.length ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">К оплате</span>
              <span className="font-semibold text-[var(--pay-price)]">{money(payAmount, symbol)}</span>
            </div>
          </div>
        ) : null}
        {openAmount}
        {providerPicker}
        {contactFields}
        {offerBox}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {info ? <p className="text-sm text-emerald-400">{info}</p> : null}
        {submitBtn}
      </form>

      {showIcons && (config?.payment_icons?.length || editMode) ? (
        <div className="mt-5">
          <p className="mb-2 text-center text-[10px] uppercase tracking-wider text-zinc-500">Принимаем</p>
          <PaymentMethodIconsMini icons={config?.payment_icons?.length ? config.payment_icons : ['mir', 'visa', 'mastercard', 'sbp']} />
        </div>
      ) : null}

      {showSeller && (config?.seller || editMode) ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-[var(--muted)]">
          <p className="font-medium text-[var(--text)]">{config?.seller?.name || 'Реквизиты продавца'}</p>
          {config?.seller?.inn ? <p className="mt-1">ИНН {config.seller.inn}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function PaymentMethodIconsMini({ icons }: { icons: string[] }) {
  if (!icons.length) return null
  return (
    <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="Принимаем к оплате">
      {icons.map((id) => (
        <li
          key={id}
          className="inline-flex h-8 min-w-[3.25rem] items-center justify-center rounded-md border border-white/15 bg-white px-2 text-[10px] font-bold tracking-wide text-zinc-800"
        >
          {id === 'mir' && <span className="text-[#0D4CD3]">МИР</span>}
          {id === 'visa' && <span className="text-[#1A1F71]">VISA</span>}
          {id === 'mastercard' && <span className="text-[#EB001B]">MC</span>}
          {id === 'sbp' && <span className="text-[#1D1346]">СБП</span>}
          {id === 'paypal' && <span className="text-[#003087]">PayPal</span>}
          {!['mir', 'visa', 'mastercard', 'sbp', 'paypal'].includes(id) && id}
        </li>
      ))}
    </ul>
  )
}
