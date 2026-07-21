import type { Product } from '@/types'

/** Поля товара + спец-ссылки для bind select. */
export const PRODUCT_BIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'title', label: 'Название' },
  { value: 'badge', label: 'Бейдж статуса' },
  { value: 'short_description', label: 'Краткое описание' },
  { value: 'description', label: 'Описание (HTML)' },
  { value: 'price', label: 'Цена (с валютой)' },
  { value: 'currency', label: 'Валюта' },
  { value: 'sku', label: 'Артикул' },
  { value: 'stock', label: 'Остаток' },
  { value: 'sold_count', label: 'Продано' },
  { value: 'media_id', label: 'Обложка (media_id)' },
  { value: 'video_url', label: 'URL видео' },
  { value: 'attrs.category', label: 'attrs.category' },
  { value: 'attrs.brand', label: 'attrs.brand' },
  { value: 'attrs.detection', label: 'attrs.detection (гарантия)' },
  { value: 'attrs.status', label: 'attrs.status' },
  { value: 'attrs.platform', label: 'attrs.platform' },
  { value: 'attrs.delivery', label: 'attrs.delivery' },
  { value: 'attrs.seller', label: 'attrs.seller' },
  { value: 'attrs.rating', label: 'attrs.rating' },
  { value: 'attrs.old_price', label: 'attrs.old_price' },
  { value: 'product_url', label: 'Ссылка на товар' },
  { value: 'payment_url', label: 'Ссылка на оплату' },
  { value: '__custom__', label: 'Другой путь (attrs.key / поле)' },
]

/** Демо-товар для превью сложных шаблонов в билдере. */
export const DEMO_PRODUCT: Product = {
  id: 0,
  title: 'Pro Template Pack',
  slug: 'demo-product',
  badge: 'Хит продаж',
  short_description:
    'Готовый набор шаблонов и компонентов для быстрого запуска проекта. Лицензия на одного пользователя, обновления 12 месяцев.',
  description:
    '<p>Полное описание товара. Включите «Динамическое» у любого текста и выберите поле или <code>attrs.*</code>.</p>',
  price: 1890,
  currency: 'RUB',
  sku: 'PKG-PRO-30',
  media_id: null,
  video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  stock: 45,
  sold_count: 497,
  is_purchasable: true,
  is_visible: true,
  attrs: {
    category: 'Цифровой товар',
    brand: 'Studio Pack',
    detection: '12 месяцев',
    status: 'В наличии',
    platform: 'Web / Figma',
    delivery: 'Мгновенно',
    seller: 'Official Store',
    seller_rating: '4.9',
    original: true,
    rating: 4.9,
    reviews_count: 67,
    questions_count: 15,
    old_price: 2490,
    discount_label: '−24%',
    price_tag: 'Хорошая цена',
    promo_ends: 'Акция ещё 3 дня',
    specs: [
      { label: 'Артикул', value: 'PKG-PRO-30', group: 'Основное' },
      { label: 'Модель', value: 'Pro Template Pack', group: 'Основное' },
      { label: 'Гарантия', value: '12 месяцев', group: 'Основное' },
      { label: 'Лицензия', value: '1 пользователь', group: 'Основное' },
      { label: 'Формат', value: 'Figma + HTML', group: 'Состав' },
      { label: 'Секций', value: '40+', group: 'Состав' },
      { label: 'Обновления', value: '12 месяцев', group: 'Состав' },
    ],
    reviews: [
      { name: 'Анна', date: '12 марта', rating: 5, text: 'Всё понятно, быстро запустились. Рекомендую.' },
      { name: 'Игорь', date: '3 марта', rating: 5, text: 'Хороший набор секций, сэкономили время на старте.' },
      {
        name: 'Юрий',
        date: '28 февраля',
        rating: 4,
        text: 'Удобно править под свой бренд.',
        pros: ['Удобно пользоваться', 'Хорошее качество'],
      },
    ],
  },
  tags: ['Шаблоны', 'Дизайн'],
  variants: [
    { label: '1 месяц', price: 490, old_price: 590, per_day: null, discount_label: null },
    { label: '3 месяца', price: 990, old_price: 1290, per_day: null, discount_label: '-23%' },
    { label: '6 месяцев', price: 1490, old_price: 1890, per_day: null, discount_label: '-21%' },
    { label: '12 месяцев', price: 1890, old_price: 2490, per_day: null, discount_label: '-24%', highlight: 'ВЫГОДНО' },
  ],
  gallery: [],
  tabs: [
    {
      key: 'features',
      label: 'Что внутри',
      html: '<h3>Состав</h3><ul><li>40+ готовых секций</li><li>Компоненты UI</li><li>Документация и примеры</li></ul>',
    },
    {
      key: 'reviews',
      label: 'Отзывы',
      html: '<p>«Сэкономили неделю на старте» — покупатель</p>',
    },
    {
      key: 'requirements',
      label: 'Требования',
      html: '<ul><li>Современный браузер</li><li>Доступ к редактору макетов</li></ul>',
    },
  ],
}

export function formatMoney(amount: number | null | undefined, currency = 'RUB'): string {
  if (amount == null || !Number.isFinite(Number(amount))) return ''
  const cur = currency === 'RUB' || !currency ? '₽' : currency
  return `${Number(amount)} ${cur}`
}

export function formatProductPrice(product: Pick<Product, 'price' | 'currency'> | null | undefined): string {
  if (!product || product.price == null) return ''
  return formatMoney(product.price, product.currency)
}

function dig(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function getProductField(product: Product | null | undefined, path: string): unknown {
  if (!product || !path || path === '__custom__') return ''
  switch (path) {
    case 'product_url':
      return product.slug ? `/products/${product.slug}` : '/products'
    case 'payment_url':
      return product.id != null ? `/payment?item=product:${product.id}` : '/payment'
    case 'price':
      return formatProductPrice(product)
    case 'title':
      return product.title ?? ''
    case 'badge':
      return product.badge ?? ''
    case 'short_description':
      return product.short_description ?? ''
    case 'description':
      return product.description ?? ''
    case 'currency':
      return product.currency ?? 'RUB'
    case 'sku':
      return product.sku ?? ''
    case 'stock':
      return product.stock == null ? '' : product.stock
    case 'sold_count':
      return product.sold_count ?? 0
    case 'media_id':
      return product.media_id ?? null
    case 'video_url':
      return product.video_url ?? ''
    default:
      break
  }

  if (path.startsWith('attrs.')) {
    const key = path.slice('attrs.'.length)
    const attrs = product.attrs && typeof product.attrs === 'object' ? product.attrs : {}
    return dig(attrs, key) ?? ''
  }

  if (path.includes('.')) {
    return dig(product, path) ?? ''
  }

  return (product as unknown as Record<string, unknown>)[path] ?? ''
}

export function isFieldDynamic(settings: Record<string, unknown>, key: string): boolean {
  return Boolean(settings[`${key}_dynamic`])
}

export function getBindPath(settings: Record<string, unknown>, key: string): string {
  const path = String(settings[`${key}_bind`] ?? '')
  if (path === '__custom__') {
    return String(settings[`${key}_bind_custom`] ?? '')
  }
  return path
}

/**
 * Статичное значение или поле товара, если `{key}_dynamic` включён.
 * Без товара в editMode подставляется DEMO_PRODUCT.
 */
export function resolveBound(
  settings: Record<string, unknown>,
  key: string,
  opts?: { product?: Product | null; editMode?: boolean },
): unknown {
  if (!isFieldDynamic(settings, key)) {
    return settings[key]
  }
  const path = getBindPath(settings, key)
  let product = opts?.product ?? null
  if (!product && opts?.editMode) {
    product = DEMO_PRODUCT
  }
  return getProductField(product, path)
}

export function resolveBoundString(
  settings: Record<string, unknown>,
  key: string,
  opts?: { product?: Product | null; editMode?: boolean },
  fallback = '',
): string {
  const v = resolveBound(settings, key, opts)
  if (v == null) return fallback
  return String(v)
}
