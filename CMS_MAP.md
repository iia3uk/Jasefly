# CMS Map — читать первым

**Бренд:** Jasefly CMS · **Стек:** React/Vite (`frontend/`) + PHP API (`backend/`) · **Деплой:** MCP `user-jasefly-cms` → `cms_release`

**Правила агента:** `.cursorrules` + `.cursor/rules/*.mdc` (alwaysApply).

Агенту: **сначала эта карта**, потом точечный `Read`/`Grep` по указанному пути. Не сканировать репо «с нуля». Живой контент сайта (страницы/nav) — MCP `cms_site_map` / `cms_pages_digest`, не код.

---

## Быстрый роутер «что чинить → куда идти»

| Симптом / задача | Файл(ы) |
| --- | --- |
| Клик/выбор блока, инспектор, дерево | `frontend/src/builder/editor/PageBuilderPage.tsx`, `render/LayoutRenderer.tsx`, `edit/Editable.tsx` |
| Иконки палитры билдера | `builder/lib/widgetIcons.tsx` + CSS `.builder-palette-tile` в `frontend/src/index.css` |
| Виджет (heading/text/hero/…) | `builder/widgets/{basic,structure,blocks,portfolio,landing,commerce,auth}.tsx`; универсальные: `hero-block` `showcase-block` `compare-block` `cta-block` `steps-row` `media-placeholder` `stat-row`; секции: glow/overlay/animation/responsive в `lib/sectionEffects.tsx` |
| Mobile: шаги пайплайна «плывут» | `widgets/structure.tsx` → `steps-row` (1/2 col → N на lg); `panels.tsx` pipeline scroll |
| Snap-скролл / перелистывание секций | `snapPageController.ts` + `sectionEffects.tsx` / `#cms-snap-scroller` / `SnapSectionRail.tsx` |
| UI-панели лендинга (модули/pipeline/MCP) | `builder/widgets/panels.tsx` → `module-toggles` `pipeline-panel` `mcp-inspector` |
| Hero медиа размер / фон | `builder/widgets/blocks.tsx` → `media_mode` side\|background + `media_width/height/object_fit`; клик по картинке → fieldStyles |
| Галерея фото+видео | `modules/projects/components/ProjectGallery.tsx` + виджет `image-gallery` в `builder/widgets/landing.tsx` |
| Lightbox картинок (блог обложка/контент) | `shared/ui/ImageLightbox.tsx` + `MediaImage lightbox` / `RichText` в `shared/ui/index.tsx`, `BlogPostView` |
| Иконки карточек (features-grid, ?) | `shared/icons.tsx` + `shared/techBrandIcons.ts` (Lucide + Simple Icons) |
| Переводчик / auto-warmup 429 | `TranslateAutoWarmup.tsx` + `SoftRateLimitMiddleware` + `TranslateModule` (batch тоже soft) |
| Переводчик не весь DOM (списки) | `TranslateWidget.tsx` + `TranslateCorpus.php` (split HTML li/p) |
| Переводчик статичный (только кэш) | `TranslateService` cacheOnly + `TranslateWidget` / warmup по `content_hash` |
| Переводчик фейки / синк контента | `TranslateCache::purgeInvalid` + `TranslateSync` (resource.afterSave) + админка «Очистить фейки» |
| Google / LibreTranslate / MyMemory / DeepL | `TranslateService` + настройки плагина `provider` (default google) |
| Тикеты / live chat / FAQ-бот | `modules/support/` ↔ `Modules/Support/` + `SupportWidget.tsx` |
| Формы / заявки / виджет form | `modules/forms/` ↔ `Modules/Forms/` + `builder/widgets/forms.tsx` |
| Планировщик / cron jobs | `modules/scheduler/` ↔ `Modules/Scheduler/` + `admin/pages/SchedulerPage.tsx` |
| Автоматизации / уведомления / рассылки | `modules/{automation,notifications,newsletter}/` ↔ `Modules/{Automation,Notifications,Newsletter}/` |
| Jasefly Lab / эксперименты | `modules/lab/` ↔ `Modules/Lab/` + `/lab/:slug` (вне SiteLayout); entries: `starter`, `reference` |
| FAQ клик в чате | `POST /support/faq/{id}/ask` + чипы в `SupportWidget` |
| Support poll 429 | `SoftRateLimit` на GET messages + backoff в `SupportWidget`; DDoS skip `/support/` |
| История чата после reload | `GET /support/active` + cookie/localStorage `visitor_key` |
| Звук чата (виджет / inbox) | `lib/supportNotifySound.ts` + `SupportWidget` / `SupportInboxPage` |
| Стили/цвет/шрифт/градиент текста | `builder/edit/StyleFields.tsx`, `ColorControl.tsx`, `colorUtils.ts`, `lib/googleFonts.ts` |
| Seed-лейауты страниц (home/about/…) | `frontend/src/builder/migrateHome.ts` |
| Публичный рендер страницы из layout | `builder/public/CmsPages.tsx`, `builder/public/parseLayout.ts`, `builder/render/LayoutRenderer.tsx` |
| Черновик на живом URL (только админ) | `backend/.../PublicController.php` → `page()` + `CmsPages.tsx` баннер |
| SEO страницы (title/desc/OG/расписание) | `builder/editor/PageBuilderPage.tsx` → `PageSettings`; `SeoHead` в `SiteLayout.tsx` |
| SEO целевые рынки (CIS/EU/USA/ASIA, areaServed) | `/admin/seo` → `seo_settings.target_regions` + `PrerenderService` JSON-LD |
| SEO боты / пустой `#root` / Яндекс | корневой `index.php` + `spa.html` + `PrerenderService` / `.htaccess` (`?prerender=1`) |
| Beget analyzer / H1 в shell | `PrerenderService::enrichSpaHtml` (seo-fallback) + расширенные BOT_MARKERS / UA в `.htaccess` |
| Last-Modified / HTML cache | `scripts/build-hosting.js` → `rootIndexPhp()` + Cache-Control 300s |
| Breadcrumbs | `SiteBreadcrumbs.tsx` + JSON-LD / prerender `BreadcrumbList` |
| Privacy / Terms | `/privacy`, `/terms` + footer columns |
| Canonical host / HTTPS / www 301 | `scripts/build-hosting.js` → `rootHtaccess()` + `frontend/public/.htaccess` |
| Bot H1 для hero-block | `PrerenderService::walkLayout` (`hero` + `hero-block`) |
| Cookie-баннер + GA gate | `components/layout/CookieBanner.tsx` + `lib/cookieConsent.ts` + `site_settings` |
| Кастомный путь админки (SPA) | `admin/adminBasePath.ts` + `site_settings.admin_base_path` + `AppRouter.tsx` |
| Публичный поиск / 404 | `GET /search` → `SearchService::publicSearch`; `NotFoundPage` |
| Ручные 301/302 редиректы | `admin/pages/RedirectsPage.tsx` + `PathRedirectService` + `SeoModule` routes |
| Telegram с контакт-формы | `Modules/Mail/ContactFormService.php` + `TelegramNotifier.php` + `/admin/mail` |
| Сообщения / mark-read «зависло» | `UtilityPages.tsx` + `.htaccess`: `/api/*` не кэшировать (`IS_API` / `no-store`); не `max-age` с HTML `index.php` |
| Module Package Manager / ZIP модули | `Modules/ModuleManager/` + `Services/Modules/*` + `/admin/modules` + `scripts/build-module.js` + `modules-src/` + docs `MODULE-*.md` |
| Плагин → пакетный модуль | `docs/glossary.md` + `docs/package-lifecycle.md` (эталон `modules-src/demo-kit/`) |
| Platform SDK (ZIP модули) | `backend/src/Platform/` + `frontend/src/platform/` + `docs/platform-sdk.md` |
| SDK validate / certify CLI | `backend/bin/sdk.php` · `Platform/Analysis/*` · `build-module.js` · `backend/bin/certify-lifecycle.php` · `docs/sdk-certification.md` |
| SDK certification / governance | `docs/sdk-certification.md` · `docs/contracts-and-governance.md` · `docs/sdk-versioning.md` |
| Capabilities / SDK report | `GET /admin/platform/capabilities` · `/admin/platform/sdk` · MCP `cms_sdk_report` / `cms_capability_report` / `cms_module_compatibility` / `cms_module_certify` / `cms_sdk_api_diff` / `cms_public_services` / `cms_sdk_deprecations` / `cms_export_sdk` |
| Установка пакета модуля | `ModulePackageService` (upload→inspect→install) + CLI `backend/bin/modules.php` + MCP `cms_module_*` |
| FE runtime пакетных модулей | `packageModuleLoader.ts` + `GET /modules/runtime-assets` + `/modules/{slug}/` assets |
| Отложенная публикация страниц | `PageScheduleService` (lazy publish) + `scheduled_at` в билдере |
| Плагины вкл/выкл, гейты UI | `frontend/src/core/pluginGates.ts`, `components/RequirePlugin.tsx`, `admin/pages/PluginsPage.tsx` |
| Тесты / CI / cms_local_test | `backend/tests/run.php` (+ Permission/API/CleanInstall/…/PackageEnableSync/ProjectsSoftApi/MigrationSqliteCompat/ContractGovernance/…), `backend/bin/certify-lifecycle.php`, `mcp-cms/src/local.js`, `.github/workflows/platform-sdk.yml`, `frontend` vitest (`npm test`) |
| SQLite migrate: OLD.id / MODIFY / prefix(191) | `Core/Db/SqlTranspiler.php` (rowid triggers, skip MODIFY, strip index prefix lengths); smoke: `MigrationSmokeTest` / `MigrationSqliteCompatTest` |
| Contract governance (snapshots) | `Platform/Manifest/{api-snapshot,capabilities,permissions-core,events-core}.v1.json` · `mcp-cms/manifest/mcp-tools.v1.json` · `builder/manifest/widget-types.v1.json` · `ContractGovernanceTest.php` · vitest `widget-types.test.ts` · regen: `node backend/tests/gen-contract-snapshots.js` |
| Security verification (SSRF/2FA/upload) | `Support/SsrfGuard.php` · `SecurityVerificationTest.php` · `TotpService` · `BackupService` · `MediaService` · `AuthController::refresh` (rotation) · `WebhooksModule` (HMAC + SSRF) |
| Maintainability helpers | `Support/{SsrfGuard,OutboundHttp,SecretRedactor}.php` · `Response::error(..., $extra)` · `MaintainabilityTest.php` |
| Диагностика модулей (load fail / safe-mode) | `ModuleRegistry::loadFailures`, `ModuleSafeMode`, `SystemHealthService` → `/admin/system` (`EnterprisePages.tsx`) |
| Целостность ops (snapshot/migrate/schedule/content pack) | `ModulePackageService` + `ModuleSnapshotService` + `PageScheduleService` + `ContentPackImporter` / `import-content.php --confirm` |
| Router 404/405 / CORS OPTIONS / RateLimit | `backend/src/Router.php`, `Request.php`, `public/index.php`, `Middleware/RateLimitMiddleware.php` |
| `/api/v1/projects` 404 при выкл. Portfolio | public GET в `ContentModule`; FE гейт `useProjects` + `HomePage` (не звать без portfolio) |
| `/api/v1/admin/projects` при выкл. Projects | Design B: routes на `ProjectsModule` + `registersRoutesWhenDisabled`; GET list `[]`, GET item 404, mutations 409 `plugin_disabled`; public GET остаётся в `ContentModule` |
| `/admin/{resource}` 404 при выкл. плагине | `ADMIN_RESOURCE_PLUGINS` + `useAdminResourceEnabled`; `PLUGIN_ALIASES` portfolio↔projects; `adminList`/`adminGet` silent 404→[]; Dashboard `contentHealth` gated; PluginsPage re-sync `setPluginStates` |
| Билдер-страницы без Portfolio (about/contact/cta) | `pluginGates` + `widgetRequiredPlugin` (`cta-banner`/`blog-list`/`contact-form` ≠ portfolio) |
| Админ-роуты / CRUD экраны | `admin/adminRoutes.tsx`, `core/moduleRegistry.ts`, `admin/pages/*` |
| Публичные роуты | `frontend/src/routes/AppRouter.tsx`, `pages/PublicPages.tsx` |
| API-клиент фронта | `frontend/src/lib/api.ts`, `hooks/useApi.ts` |
| Тема / site settings / nav | `modules/site/`, `context/SiteContext.tsx`, backend `Modules/System`, `Modules/Content` |
| Проекты / блог / услуги | `modules/projects|blog|services/` ↔ `backend/src/Modules/{Projects,Blog,Content}/` |
| Товары / оплата | `modules/products|payments/` ↔ `Modules/Products|Payments/` |
| Заказы / корзины / возвраты | `modules/orders/` ↔ `Modules/Orders/` + адаптер в `Payments/PaymentService.php` |
| Комментарии / отзывы / рейтинги | `modules/comments/` ↔ `Modules/Comments/` + `builder/widgets/comments.tsx` |
| Аналитика событий / целей | `modules/analytics/` ↔ `Modules/Analytics/` + `beacon.ts` / `AnalyticsBeacon.tsx` (в SiteLayout) |
| Медиа | `modules/media/` ↔ `Modules/Media/`, `Controllers/MediaController.php` |
| Auth / users / 2FA | `context/AuthContext.tsx`, `Modules/Users/`, `Controllers/AuthController.php` |
| Миграции SQL | `backend/migrations/*.sql` (+ plugin migrations в `Modules/*/migrations/`) |
| Module Package Manager (install/update ZIP) | `Modules/ModuleManager/ModuleManagerModule.php`, `Services/Modules/ModulePackageService.php`, `ModulePluginMirror.php`, `bin/modules.php` (`reconcile-mirror`), `Core/Modules/*`, `migrations/020_installed_modules.sql` |
| ZIP enable SoT (installed_modules vs plugins) | Canonical: `installed_modules.status`; mirror: `modules.is_enabled` via `ModulePluginMirror`; Plugins toggle for packages → `ModulePackageService`; CLI `modules.php reconcile-mirror` |
| Demo package module source | `modules-src/demo-kit/` |
| Forms SDK certification reference | `modules-src/forms-sdk-reference/` |
| Журнал MCP / activity время не МСК | `admin/lib/formatDateTime.ts` (naive DATETIME = Moscow); Dashboard/Enterprise; BE `APP_TIMEZONE` + MySQL `SET time_zone` |
| Контент на проде (текст/страницы) | MCP `cms_site_map` → `cms_get` / `cms_bulk` / `cms_put_singleton` |
| Публичная API-документация (люди + агенты) | страница CMS `/api-docs` + `GET /api/v1/docs` ([backend/docs/openapi.php](backend/docs/openapi.php)); локальный черновик `content/jasefly-official/apply-api-docs.mjs` |
| Публичная страница модулей (не `/modules` — конфликт с asset dir) | CMS slug `/cms-modules`; Apache `RewriteRule ^modules/?$ /cms-modules` в `frontend/public/.htaccess` + `scripts/build-hosting.js` |

---

## Дерево (только важное)

```
portfolio/
  ARCHITECTURE.md     ← layers + ownership (detail in docs/)
  docs/README.md      ← engineer documentation reading order
  CHANGELOG.md        ← пишет cms_release
  CMS_MAP.md          ← эта карта (agent lookup)
  frontend/src/
    admin/            ← админка UI
    builder/          ← page builder (холст + виджеты)
    modules/          ← доменные фичи (зеркало backend Modules)
    core/             ← registry, pluginGates
    pages/ routes/    ← композиция маршрутов
    shared/           ← ui/admin без доменной логики
  backend/src/
    Core/             ← Router, DB, JWT, ModuleRegistry, CRUD
    Modules/{Name}/   ← фича-пакеты (*Module.php)
    Controllers/      ← системные (auth, media, public…)
  backend/migrations/ ← схема
  mcp-cms/            ← MCP-сервер деплоя/контента
  content/            ← контент-паки (импорт)
```

---

## Builder (самый частый контур)

| Зона | Путь | Заметка |
| --- | --- | --- |
| UI редактора | `builder/editor/PageBuilderPage.tsx` | selectedId/Part, сайдбары, save |
| Дерево layout ops | `builder/tree.ts`, `builder/types.ts` | reduceLayout / move / duplicate |
| Рендер секция→колонка→виджет | `builder/render/LayoutRenderer.tsx` | editMode selection, hover ring |
| Inline-edit текста | `builder/edit/Editable.tsx` | EditableShell/Text; `data-builder-editable` |
| Реестр виджетов | `builder/registry.ts`, `widgets/index.ts` | `ensureWidgetsRegistered()` |
| Синк CMS→layout | `builder/editor/cmsSync.ts` | hero/profile pull |
| Bind полей | `builder/bind/resolveBound.ts` | bindable settings |
| Контекст edit | `builder/context/BuilderEditContext.tsx` | onSelectElement / onPatch |

### Виджеты → файл

| types | файл |
| --- | --- |
| `heading` `text` `image` `button` `spacer` `divider` `html` `page-loader` `chip` `chip-row` `connector-line` `step-badge` `steps-row` `media-placeholder` | `widgets/basic.tsx` + `structure.tsx` + `blocks.tsx` |
| `hero` `projects-grid` `skills` `experience` `services` `testimonials` `blog-list` `contact-form` `profile-card` `cta-banner` | `widgets/portfolio.tsx` |
| `image-gallery` `faq` `logos-strip` `pricing-table` `features-grid` `video-embed` `content-tabs` `hero-block` `compare-block` `showcase-block` `cta-block` `stat-row` | `widgets/landing.tsx` + `structure.tsx` + `blocks.tsx` |
| `payment-checkout` `payment-methods` `seller-info` `offer-document` | `widgets/commerce.tsx` |
| `auth-login` `auth-register` | `widgets/auth.tsx` |
| `form` | `widgets/forms.tsx` (plugin forms) |
| `newsletter-signup` | `widgets/newsletter.tsx` (plugin newsletter) |
| `comments` `reviews` `rating-summary` `review-form` | `widgets/comments.tsx` (plugin comments) |

Видео-URL логика: `builder/lib/videoEmbed.ts`.

---

## Frontend modules ↔ backend

| FE `modules/` | BE `Modules/` | Суть |
| --- | --- | --- |
| `portfolio/` | `Portfolio/` | портфолио-плагин / витрина |
| `projects/` | `Projects/` | кейсы |
| `blog/` | (часто Content/Blog) `Blog/` | посты |
| `services/` | Content/услуги | услуги |
| `products/` | `Products/` | каталог |
| `payments/` | `Payments/` | checkout |
| `media/` | `Media/` | файлы |
| `users/` | `Users/` | админы/роли |
| `site/` | `System` + Content | тема, SEO, settings |
| `site/productLanding/` | — | витринный лендинг продукта Jasefly (`ProductLanding`) |
| `registration/` | `Registration/` | публичная регистрация |
| `translate/` | `Translate/` | оверлей-переводчик сайта |
| `support/` | `Support/` | тикеты / live chat / FAQ-бот |
| `automation/` | `Automation/` | сценарии событий и действий |
| `notifications/` | `Notifications/` | inbox и внешняя доставка уведомлений |
| `newsletter/` | `Newsletter/` | подписчики и email-кампании |
| `orders/` | `Orders/` | корзины, заказы, статусы и возвраты |
| `comments/` | `Comments/` | комментарии, отзывы и модерация |
| `analytics/` | `Analytics/` | события, цели, агрегация и retention |
| `mail/` `webhooks/` `ddos/` `system/` | одноимённые | интеграции |

Новый модуль: `docs/module-system.md` + `docs/extension-points.md` + зеркало в `frontend/src/modules/{name}/`.

---

## Admin UI

| Что | Где |
| --- | --- |
| Shell админки | `admin/AdminApp.tsx` |
| Роутинг экранов | `admin/adminRoutes.tsx` |
| Хабы меню | `admin/adminHubs.ts` |
| Страницы CMS (list/builder entry) | `admin/pages/PagesAdmin.tsx` |
| Site / theme / nav singletons | `admin/pages/SitePages.tsx` |
| Редиректы 301/302 | `admin/pages/RedirectsPage.tsx` |
| Плагины | `admin/pages/PluginsPage.tsx` |
| CRUD generic | `admin/pages/AdminPages.tsx` |
| Rich text | `admin/components/RichTextEditor.tsx` |

---

## Backend ядро

| Что | Где |
| --- | --- |
| Роуты API (live) | `ModuleRegistry::registerRoutes` via `public/index.php` (`routes/api_v1.php` — tests/legacy) |
| Реестр модулей | `backend/src/Core/ModuleRegistry.php` + каждый `*Module.php` · docs: `docs/bootstrap-and-request.md` |
| Публичный bootstrap | `Controllers/PublicController.php` |
| Конфиг | `backend/config/app.php`, `config.local.php`, `.env` |
| Установка/миграции CLI | `backend/migrate.php`, `install.php` |

---

## MCP (хостинг / контент)

Сервер: `user-jasefly-cms` (`mcp-cms/`). Секреты только в `mcp-cms/.env`.

| Инструмент | Когда |
| --- | --- |
| **`cms_release`** | Любая заливка кода (build→test→changelog→deploy→verify) |
| `cms_site_map` | Карта живого сайта перед правками контента |
| `cms_pages_digest` / `cms_page_digest` | Короткие выжимки страниц |
| `cms_list` / `cms_get` / `cms_update` / `cms_bulk` | CRUD ресурсов (bulk ≤25) |
| `cms_put_singleton` | theme, site settings, profile… |
| `cms_verify_alive` / `cms_site_diagnostics` | После проблем |
| `cms_hosting_guard` | Лимиты запросов к хостингу |
| `list_lab_experiments` / `create_lab_experiment` / … | Lab CRUD + preview/publish |

Не долбить хостинг циклами `cms_list`. Подробности: `mcp-cms/README.md`, деплой: `docs/deployment.md`. Канон docs: `docs/README.md`.

---

## Конвенции агента

1. **Сначала `CMS_MAP.md`**, затем 1–3 файла из таблицы — не полный `Glob`/`Grep` по репо.
2. Баг билдера → тройка `PageBuilderPage` / `LayoutRenderer` / `Editable` (+ нужный `widgets/*.tsx`).
3. После правок кода по просьбе «залей» → только **`cms_release`**.
4. Не коммитить секреты (`.env`, `config.local.php`).
5. Русский UI-копирайт в админке/билдере — норма; код/идентификаторы — English.
6. **Самообновление карты:** при переезде/rename файла, новом виджете, модуле, MCP-tool или битом пути из карты — агент **сам** правит затронутые строки `CMS_MAP.md` в том же изменении. Не ждать просьбы пользователя. Не логировать багфиксы — только навигацию.
