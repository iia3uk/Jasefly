# Cookie Consent (Jasefly ZIP module)

GDPR / 152-ФЗ: категории cookie, пресеты аналитики/рекламы, журнал согласий, плавающий виджет и `window.jaseflyCookieGate`.

Работает **поверх** тонкого core gate (`CookieBanner` / `cookieConsent.ts`). При включённом модуле core-баннер скрывается.

## Сборка

```bash
php backend/bin/sdk.php certify modules-src/cookie-consent
node scripts/build-module.js cookie-consent --yes
```

## Права

- `cookie-consent.view` — настройки, журнал, статистика
- `cookie-consent.manage` — сохранение, purge
- `cookie-consent.export` — CSV / Excel

## JS API

```js
window.jaseflyCookieGate.open()
window.jaseflyCookieGate.get()
window.jaseflyCookieGate.set({ necessary: true, analytics: true, marketing: false }, 'widget')
window.jaseflyCookieGate.allows('analytics')
```

События: `jasefly-cookie-consent`, `jasefly-cookie:change`.  
Атрибут: `data-jasefly-cookie-open` на любом элементе.
