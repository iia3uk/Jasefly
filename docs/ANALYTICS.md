# Analytics

Встроенная first-party аналитика с HMAC-хешированием посетителя и сессии. Исходный IP не записывается.

- Сбор: `POST /api/v1/analytics/collect`.
- Допустимые события перечислены в `AnalyticsService::EVENTS`.
- Обзор: `GET /api/v1/admin/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Helper: `trackAnalytics()` из `frontend/src/modules/analytics/beacon.ts`.
- Scheduler handlers: `analytics.aggregate`, `analytics.retention`.
- Права: `analytics.view`, `analytics.manage`.

Учитывается заголовок DNT. Модуль по умолчанию выключен.
