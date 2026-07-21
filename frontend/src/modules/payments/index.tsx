import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { CrudListPage, CrudEditPage } from '@/admin/pages/AdminPages'
import type { Blueprint } from '@/core/pluginTypes'
import { PaymentCheckoutWidget } from '@/builder/widgets/commerce'

const ordersBlueprint: Blueprint = {
  key: 'orders',
  table: 'orders',
  label: 'Заказы',
  singleton: false,
  soft_delete: false,
  slug: false,
  seo: false,
  group: 'Коммерция',
  orderable: false,
  icon: 'shopping-cart',
  columns: {
    number: { type: 'string', widget: 'text', label: 'Номер заказа', required: true, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    customer_email: { type: 'string', widget: 'text', label: 'Email клиента', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    customer_name: { type: 'string', widget: 'text', label: 'Имя клиента', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    amount: { type: 'decimal', widget: 'number', label: 'Сумма', required: true, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    currency: { type: 'string', widget: 'text', label: 'Валюта', required: false, default: 'RUB', nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    status: { type: 'string', widget: 'select', label: 'Статус', required: false, default: 'new', nullable: true, index: false, permission: null, visible: true, options: [{ value: 'new', label: 'Новый' }, { value: 'paid', label: 'Оплачен' }, { value: 'shipped', label: 'Отправлен' }, { value: 'completed', label: 'Завершён' }, { value: 'cancelled', label: 'Отменён' }], min: null, max: null, pattern: null, help: null },
    items: { type: 'json', widget: 'json', label: 'Состав заказа', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    item_type: { type: 'string', widget: 'select', label: 'Тип позиции', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: [{ value: 'service', label: 'Услуга' }, { value: 'product', label: 'Товар' }], min: null, max: null, pattern: null, help: null },
    item_id: { type: 'int', widget: 'number', label: 'ID позиции', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
  },
  indexes: [],
  permissions: ['commerce.manage'],
}

const paymentsBlueprint: Blueprint = {
  key: 'payments',
  table: 'payments',
  label: 'Платежи',
  singleton: false,
  soft_delete: false,
  slug: false,
  seo: false,
  group: 'Коммерция',
  orderable: false,
  icon: 'credit-card',
  columns: {
    provider: { type: 'string', widget: 'select', label: 'Провайдер', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: [
      { value: 'manual', label: 'Вручную' },
      { value: 'yookassa', label: 'ЮKassa' },
      { value: 'tkassa', label: 'Т-Касса' },
      { value: 'robokassa', label: 'Robokassa' },
      { value: 'unitpay', label: 'UnitPay' },
      { value: 'payanyway', label: 'PayAnyWay' },
      { value: 'cloudpayments', label: 'CloudPayments' },
      { value: 'sberbank', label: 'СберБанк' },
      { value: 'alfabank', label: 'Альфа-Банк' },
      { value: 'vtb', label: 'ВТБ' },
      { value: 'gazprombank', label: 'Газпромбанк' },
      { value: 'ubrir', label: 'УБРиР' },
      { value: 'tochka', label: 'Точка' },
      { value: 'stripe', label: 'Stripe' },
      { value: 'paypal', label: 'PayPal' },
      { value: 'crypto', label: 'Крипта (NOWPayments)' },
      { value: 'paddle', label: 'Paddle' },
      { value: 'lemonsqueezy', label: 'Lemon Squeezy' },
      { value: 'adyen', label: 'Adyen' },
    ], min: null, max: null, pattern: null, help: null },
    external_id: { type: 'string', widget: 'text', label: 'Внешний ID', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    order_id: { type: 'int', widget: 'number', label: 'ID заказа', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    amount: { type: 'decimal', widget: 'number', label: 'Сумма', required: true, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    currency: { type: 'string', widget: 'text', label: 'Валюта', required: false, default: 'RUB', nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    status: { type: 'string', widget: 'select', label: 'Статус', required: false, default: 'pending', nullable: true, index: false, permission: null, visible: true, options: [{ value: 'pending', label: 'Ожидает' }, { value: 'succeeded', label: 'Успешен' }, { value: 'failed', label: 'Ошибка' }, { value: 'refunded', label: 'Возврат' }], min: null, max: null, pattern: null, help: null },
  },
  indexes: [],
  permissions: ['commerce.manage'],
}

registerModule({
  name: 'payments',
  label: 'Платежи',
  adminNav: [
    { group: 'Платежи', path: '/admin/orders', label: 'Заказы', permission: 'commerce.manage', icon: 'shopping-cart' },
  ],
  blueprints: [ordersBlueprint, paymentsBlueprint],
  blocks: [
    {
      type: 'payment-checkout',
      label: 'Форма оплаты',
      category: 'commerce',
      defaultSettings: {
        layout: 'marketplace',
        title: 'Оформление заказа',
        subtitle: 'Проверьте товар и подтвердите оплату',
        button_label: 'Заказать',
        show_seller: true,
        show_payment_icons: true,
        show_back: true,
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
        { key: 'show_seller', label: 'Реквизиты продавца', type: 'toggle' },
        { key: 'show_payment_icons', label: 'Иконки карт', type: 'toggle' },
        { key: 'show_back', label: 'Ссылка «К каталогу»', type: 'toggle' },
      ],
      Render: PaymentCheckoutWidget,
    },
  ],
  adminScreens: [
    { path: 'orders', label: 'Заказы', group: 'Коммерция', element: createElement(CrudListPage, { resource: 'orders' }) },
    { path: 'orders/:id', label: 'Редактирование заказа', group: 'Коммерция', element: createElement(CrudEditPage, { resource: 'orders' }) },
    { path: 'payments', label: 'Платежи', group: 'Коммерция', element: createElement(CrudListPage, { resource: 'payments' }) },
    { path: 'payments/:id', label: 'Редактирование платежа', group: 'Коммерция', element: createElement(CrudEditPage, { resource: 'payments' }) },
  ],
})
