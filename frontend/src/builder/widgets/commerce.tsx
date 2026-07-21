import { Link } from 'react-router-dom'
import { registerWidget } from '@/builder/registry'
import { RichText } from '@/components/ui'
import {
  PaymentCheckoutWidget,
  usePayConfig,
  type SellerInfo,
} from '@/modules/payments/PaymentCheckoutForm'

export { PaymentCheckoutWidget, usePayConfig }
export type { PayConfig, CatalogItem, SellerInfo, ProviderInfo } from '@/modules/payments/PaymentCheckoutForm'

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

const ICON_LABELS: Record<string, string> = {
  mir: 'Мир',
  visa: 'Visa',
  mastercard: 'Mastercard',
  unionpay: 'UnionPay',
  sbp: 'СБП',
  paypal: 'PayPal',
  applepay: 'Apple Pay',
  googlepay: 'Google Pay',
}

/** Compact brand badges for acquiring acceptance (legal/footer style). */
export function PaymentMethodIcons({ icons, className = '' }: { icons: string[]; className?: string }) {
  if (!icons.length) return null
  return (
    <ul className={`flex flex-wrap items-center justify-center gap-2 ${className}`} aria-label="Принимаем к оплате">
      {icons.map((id) => (
        <li
          key={id}
          title={ICON_LABELS[id] || id}
          className="inline-flex h-8 min-w-[3.25rem] items-center justify-center rounded-md border border-white/15 bg-white px-2 text-[10px] font-bold tracking-wide text-zinc-800 shadow-sm"
        >
          {id === 'mir' && <span className="text-[#0D4CD3]">МИР</span>}
          {id === 'visa' && <span className="text-[#1A1F71]">VISA</span>}
          {id === 'mastercard' && <span className="text-[#EB001B]">MC</span>}
          {id === 'unionpay' && <span className="text-[#E21836]">UP</span>}
          {id === 'sbp' && <span className="text-[#1D1346]">СБП</span>}
          {id === 'paypal' && <span className="text-[#003087]">PayPal</span>}
          {id === 'applepay' && <span className="text-black"> Pay</span>}
          {id === 'googlepay' && <span className="text-[#4285F4]">GPay</span>}
          {!ICON_LABELS[id] && id}
        </li>
      ))}
    </ul>
  )
}

export function SellerInfoBlock({ seller, compact = false }: { seller?: SellerInfo | null; compact?: boolean }) {
  if (!seller?.name && !seller?.inn && !seller?.email) return null
  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] ${compact ? 'p-3 text-xs' : 'p-4 text-sm'} text-[var(--muted)]`}>
      {seller.name ? <p className="font-medium text-[var(--text)]">{seller.name}</p> : null}
      <dl className="mt-2 space-y-1">
        {seller.inn ? <div><dt className="inline text-zinc-500">ИНН </dt><dd className="inline">{seller.inn}</dd></div> : null}
        {seller.ogrn ? <div><dt className="inline text-zinc-500">ОГРН </dt><dd className="inline">{seller.ogrn}</dd></div> : null}
        {seller.address ? <div><dt className="inline text-zinc-500">Адрес </dt><dd className="inline">{seller.address}</dd></div> : null}
        {seller.email ? (
          <div>
            <dt className="inline text-zinc-500">Email </dt>
            <dd className="inline"><a className="link-text" href={`mailto:${seller.email}`}>{seller.email}</a></dd>
          </div>
        ) : null}
        {seller.phone ? <div><dt className="inline text-zinc-500">Тел. </dt><dd className="inline">{seller.phone}</dd></div> : null}
      </dl>
    </div>
  )
}

function PaymentMethodsWidget({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const config = usePayConfig(editMode)
  const fromSettings = str(settings.icons, '')
  const icons = fromSettings
    ? fromSettings.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : (config?.payment_icons ?? ['mir', 'visa', 'mastercard', 'sbp'])
  const title = str(settings.title, 'Способы оплаты')
  return (
    <div className="mx-auto w-full max-w-lg text-center">
      {title ? <p className="mb-3 text-sm text-[var(--muted)]">{title}</p> : null}
      <PaymentMethodIcons icons={icons} />
      {editMode ? <p className="mt-2 text-xs text-zinc-500">Виджет иконок эквайринга</p> : null}
    </div>
  )
}

function SellerInfoWidget({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const config = usePayConfig(editMode)
  const title = str(settings.title, 'Информация о продавце')
  const showOffer = settings.show_offer !== false
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {title ? <h2 className="font-heading text-2xl">{title}</h2> : null}
      <SellerInfoBlock seller={config?.seller || (editMode ? { name: 'ООО «Пример»', inn: '0000000000' } : null)} />
      {showOffer && (config?.offer_html || editMode) ? (
        <div className="prose max-w-none text-sm">
          <h3 className="font-heading text-lg">{config?.offer_title || 'Публичная оферта'}</h3>
          {config?.offer_html ? (
            <RichText html={config.offer_html} />
          ) : (
            <p className="text-[var(--muted)]">
              Текст оферты задаётся в Плагины → Payments → «Текст оферты».{' '}
              <Link to="/offer" className="link-text">Открыть /offer</Link>
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function OfferDocumentWidget({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const config = usePayConfig(editMode)
  const title = str(settings.title, '') || config?.offer_title || 'Публичная оферта'
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <h1 className="font-heading text-3xl sm:text-4xl">{title}</h1>
      <SellerInfoBlock seller={config?.seller} />
      {config?.offer_html ? (
        <div className="prose max-w-none"><RichText html={config.offer_html} /></div>
      ) : (
        <p className="text-[var(--muted)]">
          {editMode
            ? 'Заполните «Текст оферты» и реквизиты продавца в настройках плагина Payments.'
            : 'Текст публичной оферты пока не задан. Укажите его в админке: Плагины → Payments.'}
        </p>
      )}
      <PaymentMethodIcons icons={config?.payment_icons ?? ['mir', 'visa', 'mastercard', 'sbp']} />
    </div>
  )
}

export function registerCommerceWidgets() {
  registerWidget({
    type: 'payment-checkout',
    label: 'Форма оплаты',
    category: 'commerce',
    defaultSettings: {
      layout: 'classic',
      title: 'Оформить заказ',
      subtitle: 'Выберите товар и подтвердите оферту',
      button_label: 'Перейти к оплате',
      preset_item_type: '',
      preset_item_id: 0,
      show_seller: true,
      show_payment_icons: true,
      show_back: true,
      accent_color: '',
      button_bg: '',
      button_text: '',
      price_color: '',
    },
    settingsFields: [
      {
        key: 'layout',
        label: 'Стиль страницы',
        type: 'select',
        options: [
          { value: 'classic', label: 'Обычный (карточка)' },
          { value: 'marketplace', label: 'Витрина (заказ + итог)' },
        ],
      },
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'button_label', label: 'Текст кнопки', type: 'text' },
      { key: 'accent_color', label: 'Акцент', type: 'color' },
      { key: 'price_color', label: 'Цвет цены', type: 'color' },
      { key: 'button_bg', label: 'Кнопка — фон', type: 'color' },
      { key: 'button_text', label: 'Кнопка — текст', type: 'color' },
      { key: 'preset_item_type', label: 'Тип позиции (service/product)', type: 'text' },
      { key: 'preset_item_id', label: 'ID услуги/товара', type: 'number' },
      { key: 'show_seller', label: 'Показать реквизиты продавца', type: 'toggle' },
      { key: 'show_payment_icons', label: 'Показать иконки карт', type: 'toggle' },
      { key: 'show_back', label: 'Ссылка «К каталогу» (витрина)', type: 'toggle' },
    ],
    Render: PaymentCheckoutWidget,
  })

  registerWidget({
    type: 'payment-methods',
    label: 'Иконки оплаты',
    category: 'commerce',
    defaultSettings: { title: 'Принимаем к оплате', icons: '' },
    settingsFields: [
      { key: 'title', label: 'Подпись', type: 'text' },
      { key: 'icons', label: 'Иконки (через запятую)', type: 'text' },
    ],
    Render: PaymentMethodsWidget,
  })

  registerWidget({
    type: 'seller-info',
    label: 'Реквизиты продавца',
    category: 'commerce',
    defaultSettings: { title: 'Информация о продавце', show_offer: true },
    settingsFields: [
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'show_offer', label: 'Показать текст оферты', type: 'toggle' },
    ],
    Render: SellerInfoWidget,
  })

  registerWidget({
    type: 'offer-document',
    label: 'Документ оферты',
    category: 'commerce',
    defaultSettings: { title: '' },
    settingsFields: [
      { key: 'title', label: 'Заголовок', type: 'text' },
    ],
    Render: OfferDocumentWidget,
  })
}
