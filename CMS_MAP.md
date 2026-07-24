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
| Canonical host / HTTPS / www 301 | `scripts/build-hosting.js` → `rootHtaccess()` + `frontend/public/.htaccess` |
| Bot H1 для hero-block | `PrerenderService::walkLayout` (`hero` + `hero-block`) |
| Cookie-баннер + GA gate | `components/layout/CookieBanner.tsx` + `lib/cookieConsent.ts` + `site_settings` |
| Кастомный путь админки (SPA) | `admin/adminBasePath.ts` + `site_settings.admin_base_path` + `AppRouter.tsx` |
| Публичный поиск / 404 | `GET /search` → `SearchService::publicSearch`; `NotFoundPage` |
| Ручные 301/302 редиректы | `admin/pages/RedirectsPage.tsx` + `PathRedirectService` + `SeoModule` routes |
| Telegram с контакт-формы | `Modules/Mail/ContactFormService.php` + `TelegramNotifier.php` + `/admin/mail` |
| Отложенная публикация страниц | `PageScheduleService` (lazy publish) + `scheduled_at` в билдере |
| Плагины вкл/выкл, гейты UI | `frontend/src/core/pluginGates.ts`, `components/RequirePlugin.tsx`, `admin/pages/PluginsPage.tsx` |
| `/api/v1/projects` 404 при выкл. Portfolio | public GET в `ContentModule`; FE гейт `useProjects` + `HomePage` (не звать без portfolio) |
| Билдер-страницы без Portfolio (about/contact/cta) | `pluginGates` + `widgetRequiredPlugin` (`cta-banner`/`blog-list`/`contact-form` ≠ portfolio) |
| Админ-роуты / CRUD экраны | `admin/adminRoutes.tsx`, `core/moduleRegistry.ts`, `admin/pages/*` |
| Публичные роуты | `frontend/src/routes/AppRouter.tsx`, `pages/PublicPages.tsx` |
| API-клиент фронта | `frontend/src/lib/api.ts`, `hooks/useApi.ts` |
| Тема / site settings / nav | `modules/site/`, `context/SiteContext.tsx`, backend `Modules/System`, `Modules/Content` |
| Проекты / блог / услуги | `modules/projects|blog|services/` ↔ `backend/src/Modules/{Projects,Blog,Content}/` |
| Товары / оплата | `modules/products|payments/` ↔ `Modules/Products|Payments/` |
| Медиа | `modules/media/` ↔ `Modules/Media/`, `Controllers/MediaController.php` |
| Auth / users / 2FA | `context/AuthContext.tsx`, `Modules/Users/`, `Controllers/AuthController.php` |
| Миграции SQL | `backend/migrations/*.sql` (+ plugin migrations в `Modules/*/migrations/`) |
| Залить апдейт на хостинг | MCP **`cms_release`** (summary + changes). Не invent deploy вручную |
| Контент на проде (текст/страницы) | MCP `cms_site_map` → `cms_get` / `cms_bulk` / `cms_put_singleton` |
| Публичная API-документация (люди + агенты) | страница CMS `/api-docs` + `GET /api/v1/docs` ([backend/docs/openapi.php](backend/docs/openapi.php)); локальный черновик `content/jasefly-official/apply-api-docs.mjs` |

---

## Дерево (только важное)

```
portfolio/
  CMS_MAP.md          ← эта карта
  ARCHITECTURE.md     ← слои фреймворка (редко)
  CHANGELOG.md        ← пишет cms_release
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
| `mail/` `webhooks/` `ddos/` `system/` | одноимённые | интеграции |

Новый модуль: `backend/docs/MODULES.md` + зеркало в `frontend/src/modules/{name}/`.

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
| Роуты API | `backend/routes/api_v1.php`, `api.php` |
| Реестр модулей | `backend/src/Core/` + каждый `*Module.php` |
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

Не долбить хостинг циклами `cms_list`. Подробности: `mcp-cms/README.md`.

---

## Конвенции агента

1. **Сначала `CMS_MAP.md`**, затем 1–3 файла из таблицы — не полный `Glob`/`Grep` по репо.
2. Баг билдера → тройка `PageBuilderPage` / `LayoutRenderer` / `Editable` (+ нужный `widgets/*.tsx`).
3. После правок кода по просьбе «залей» → только **`cms_release`**.
4. Не коммитить секреты (`.env`, `config.local.php`).
5. Русский UI-копирайт в админке/билдере — норма; код/идентификаторы — English.
6. **Самообновление карты:** при переезде/rename файла, новом виджете, модуле, MCP-tool или битом пути из карты — агент **сам** правит затронутые строки `CMS_MAP.md` в том же изменении. Не ждать просьбы пользователя. Не логировать багфиксы — только навигацию.
