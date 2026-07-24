# Orders

Модуль заказов расширяет таблицу `orders`, созданную Payments, и не создаёт конкурирующую схему.

- Публичные API: `GET /api/v1/orders/cart`, `POST /orders/cart/items`, `PUT /orders/cart/items/{id}`, `POST /orders/checkout`.
- Админка: `/admin/orders`; список, карточка, статусы, заметки, возвраты и CSV.
- Права: `orders.view`, `orders.manage`, `orders.refund`, `orders.export`.
- События: `order.created`, `order.status_changed`, `order.completed`, `order.cancelled`, `order.refunded`, `cart.updated`.

По умолчанию модуль выключен. При включении Payments использует `OrdersService` как адаптер, а при выключении сохраняет прежний checkout.
