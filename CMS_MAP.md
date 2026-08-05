# CMS Map — читать первым

**Бренд:** Jasefly (framework; CMS — часть админки) · **Стек:** React/Vite (`frontend/`) + PHP API (`backend/`) · **Деплой:** MCP `user-jasefly-cms` → `cms_release`

**Правила агента:** `.cursorrules` + `.cursor/rules/*.mdc` (alwaysApply).

Агенту: **сначала эта карта**, потом точечный `Read`/`Grep` по указанному пути. Не сканировать репо «с нуля». Живой контент сайта (страницы/nav) — MCP `cms_site_map` / `cms_pages_digest`, не код.

---

## Быстрый роутер «что чинить → куда идти»

| Симптом / задача | Файл(ы) |
| --- | --- |
| Клик/выбор блока, инспектор, дерево | `frontend/src/builder/editor/PageBuilderPage.tsx`, `render/LayoutRenderer.tsx`, `edit/Editable.tsx` |
| Билдер «не сохраняет» правки текста | `PageBuilderPage.save` → `flushInlineEdits` (плоские поля + `step_*` → `items[]`); `AdminController` snapshot в try/catch |
| Hero «Убрать» фон не сбрасывается | `resolveEditorSettings` take/bake + `cmsSync` pull/push — owned `null`/`''` не затирать CMS `background_media_id`; `portfolio` не fallback на legacy `background`; MediaPicker clear `media_id` → ещё `media_url`/`url` |
| Admin Hero без превью, на сайте есть | `cmsSync`: `hero-block.media_id` ↔ `hero_settings.background_media_id`; heal в `SitePages` + push при сохранении Admin Hero |
| Билдер: ложный dirty / hotkeys | bake-on-open без dirty; undo к baseline save; Ctrl+C/V не перехватывают text selection; Delete (не Backspace) удаляет виджет |
| Иконки палитры билдера | `builder/lib/widgetIcons.tsx` + CSS `.builder-palette-tile` в `frontend/src/index.css` |
| Виджет (heading/text/hero/…) | `builder/widgets/{basic,structure,blocks,portfolio,landing,processDiagram,journey,framework,frameworkPulse,commerce,auth,access}.tsx`; универсальные: `hero-block` `showcase-block` `compare-block` `cta-block` `steps-row` `media-placeholder` `stat-row` `stats-strip` `relation-flow` `process-diagram` `features-grid` (`last_row_alignment`, optional `href`/`markers`) `projects-grid` (`layout: grid\|lead-with-stack`, `featured_priority`, cover portrait/landscape) `journey-timeline` `profile-hero`; framework: `architecture-stack` `code-snippet` `code-tabs` `status-roadmap` `dev-journey` `repo-tree` `status-timeline` `github-pulse` `explore-doors`; секции: glow/overlay/animation/responsive в `lib/sectionEffects.tsx`; /about hero: `shared/views` `ProfileHeroView` (`items-start`); journey: `shared/aboutJourneyContent.ts`; showcase: `ProjectShowcase.tsx` + `ResponsiveProjectCover` + `shared/projectCover.ts` + `shared/showcaseGeometry.ts` (secondary media ≈1:1); process: `shared/processDiagram.ts`; лендинг seed: `migrateHome.buildDefaultHomeLayout` |
| Access / paywall / «кто видит блок» | Platform `Access/` + `Modules/Access/` (`GET/POST /access/*`); виджет «Доступ» (`access-container`) + `edit/AccessRuleEditor.tsx`; описания в `PluginCatalogMeta`; публичный `filterLayout` в `PublicController`; ZIP: `modules-src/{user-groups,subscriptions,wallet}/` |
| Admin ACL / роли / capabilities | `Platform/Access/Acl/*` + provider `capability`; `PermissionService` adapter; `GET /auth/me` caps; `GET /admin/access/bootstrap`; FE `AuthContext.can` (не `role===admin`); Users/Roles UI; миграция `024_admin_access_layer.sql` |
| Корзина empty-all 500 / нет deleted_at | `SoftDeleteService::emptyTrash`/`restore`/`trash` → `hasDeletedAt`; TRASHABLE: pages/education без колонки; UI `EnterprisePages` + `TrashController` |
| Demo Sandbox (публичный Admin/Builder) | `Modules/Demo/*` + `025_demo_sandbox.sql`; `/demo?to=builder` → билдер, `/demo?to=admin` → дашборд (`DemoEntryPage`); doors: `explore-doors` + `resolveDemoDoor`; docs `docs/demo-sandbox.md` |
| Mobile: шаги пайплайна «плывут» | `widgets/structure.tsx` → `steps-row` (1/2 col → N на lg); `panels.tsx` pipeline scroll |
| Mobile адаптив / safe-area / FAB | `index.css` (`.cms-hero-bleed`, overlay pad, snap rail); `SiteLayout` menu lock; `CookieBanner` / `TranslateWidget` / `SupportWidget` |
| steps-row на проде «Описание», в билдере нет | `structure.tsx` `asSteps`: в данных `body`, виджет ждал `text`; public не должен рисовать placeholder |
| Snap-скролл / перелистывание секций | `snapPageController.ts` + `sectionEffects.tsx` / `#cms-snap-scroller` / `SnapSectionRail.tsx` |
| UI-панели лендинга (модули/pipeline/MCP) | `builder/widgets/panels.tsx` → `module-toggles` `pipeline-panel` `mcp-inspector` |
| Hero медиа размер / фон | `builder/widgets/blocks.tsx` → `hero-block`: `height_preset` viewport\|tall\|compact\|custom (основной = весь экран); `media_mode` background\|side; `acceptsChildren` |
| Деплой раздувает `assets/` на хостинге | `SiteUpdater::pruneStaleFrontendAssets` — после update ZIP удаляет хеши не из пакета |
| Галерея фото+видео | `modules/projects/components/ProjectGallery.tsx` + виджет `image-gallery` в `builder/widgets/landing.tsx` |
| Lightbox картинок (блог обложка/контент) | `shared/ui/ImageLightbox.tsx` + `MediaImage lightbox` / `RichText` в `shared/ui/index.tsx`, `BlogPostView` |
| Иконки карточек (features-grid, ?) | `shared/icons.tsx` + `shared/techBrandIcons.ts` (Lucide + Simple Icons) |
| Переводчик выключен, но FE бьёт `/translate/batch` 404 | `TranslateWidget` / `TranslateAutoWarmup`: fail-closed до гидрации `enabled_plugins` + требовать `site.translate`; `siteHasPlugin` без массива = fail-open |
| Переводчик / auto-warmup 429 | `TranslateAutoWarmup.tsx` + `SoftRateLimitMiddleware` + `TranslateModule` (batch тоже soft) |
| Прогрев «Нет прогресса» / en→en | `TranslateModule::allowedTargets` исключает `source_lang`; иначе chunk крутит same-lang и FE стопорится |
| Переводчик медленный при «всё в кэше» | FE `TranslateWidget`: session/memory map + paint до API; `fill_misses=false` если `cache_ready`; Google без Libre-fallback |
| Переводчик не весь DOM / attrs / chrome | `TranslateWidget.tsx`: корни `main/header/footer/[data-translate-root]`, attrs placeholder/aria-label/title/alt, `document.title`, MutationObserver; chrome: breadcrumbs/cookie/rail/custom_html |
| Переводчик кэш + soft miss-fill | `POST /translate/batch` `fill_misses` → `TranslateService::translateBatch(..., fillMissCap=12)`; warmup/corpus для полноты |
| Переводчик авто-язык по стране | `TranslateGeo.php` (CF/CDN/Accept-Language) → `publicConfig.suggested_lang`; FE `TranslateWidget` если нет localStorage; fallback `en` |
| Переводчик corpus ≠ DOM | `TranslateCorpus::ingest` = `TranslateSync` HTML-split; singleton JSON → walkJson; без slug |
| Переводчик фейки / синк контента | `TranslateCache::purgeInvalid` + `TranslateSync` (resource.afterSave) + админка «Очистить фейки» |
| Google / LibreTranslate / MyMemory / DeepL | `TranslateService` + настройки плагина `provider` (default google) |
| Тикеты / live chat / FAQ-бот | `modules/support/` ↔ `Modules/Support/` + `SupportWidget.tsx` |
| Формы / заявки / виджет form | `modules/forms/` ↔ `Modules/Forms/` + `builder/widgets/forms.tsx` |
| Планировщик / cron jobs | `modules/scheduler/` ↔ `Modules/Scheduler/` + `admin/pages/SchedulerPage.tsx` (справка «Как пользоваться» на странице) |
| Автоматизации / уведомления / рассылки | `modules/{automation,notifications,newsletter}/` ↔ `Modules/{Automation,Notifications,Newsletter}/`; справки в `AutomationAdminPage` / `NotificationsPage` (+ POST `/admin/notifications/test`) |
| Jasefly Lab / эксперименты | `modules/lab/` ↔ `Modules/Lab/` + `/lab/:slug` (вне SiteLayout); entries: `starter`, `reference` |
| FAQ клик в чате | `POST /support/faq/{id}/ask` + чипы в `SupportWidget` |
| Support poll 429 | `SoftRateLimit` на GET messages + backoff в `SupportWidget`; DDoS skip `/support/` |
| История чата после reload | `GET /support/active` + cookie/localStorage `visitor_key` |
| Звук чата (виджет / inbox) | `lib/supportNotifySound.ts` + `SupportWidget` / `SupportInboxPage` |
| Стили/цвет/шрифт/градиент текста | `builder/edit/StyleFields.tsx`, `ColorControl.tsx`, `colorUtils.ts`, `lib/googleFonts.ts` |
| Seed-лейауты страниц (home/about/…) | `frontend/src/builder/migrateHome.ts` (`buildDefaultContactLayout` — карта+контакты 2 кол.) |
| Билдер: 2 колонки съезжают в столбец | `LayoutRenderer` секция = CSS grid `Nfr` (не flex %+gap) |
| Публичный рендер страницы из layout | `builder/public/CmsPages.tsx`, `builder/public/parseLayout.ts`, `builder/render/LayoutRenderer.tsx` |
| «Сайт не из pages / не из БД» | `isSeedLayout` (`CmsPages.tsx`): seed/пусто → classic `HomePage` из `hero_settings`+секций; `useOnSite:true` → `pages.layout_json`. Локальный apply-пак `content/jasefly-official/` (gitignored) — только apply в БД, не runtime |
| Админ «Главная» / Оформление | Редирект в билдер `pages` is_home (`SitePages.HomepagePage`). Не путать с пустой `homepage_sections` — контент в `pages.layout_json` |
| Черновик на живом URL (только админ) | `backend/.../PublicController.php` → `page()` + `CmsPages.tsx` баннер |
| SEO страницы (title/desc/OG/расписание) | `builder/editor/PageBuilderPage.tsx` → `PageSettings`; `SeoHead` в `SiteLayout.tsx` |
| SEO целевые рынки (CIS/EU/USA/ASIA, areaServed) | `/admin/seo` → `seo_settings.target_regions` + `PrerenderService` JSON-LD |
| SEO боты / пустой `#root` / Яндекс | корневой `index.php` + `spa.html` + `PrerenderService` / `.htaccess` (`?prerender=1`) |
| Beget analyzer / H1 в shell | `PrerenderService::enrichSpaHtml` (seo-fallback) + расширенные BOT_MARKERS / UA в `.htaccess` |
| Last-Modified / HTML cache | `scripts/build-hosting.js` → `rootIndexPhp()` + Cache-Control 60s; missing `/assets/*` → 404 (не SPA HTML) |
| После деплоя белый экран / MIME assets | Inline recovery в `frontend/index.html` + `main.tsx` `vite:preloadError`: один hard-reload с `?_=` |
| Breadcrumbs / контент под прозрачным header (не home) | `SiteLayout` + `.cms-nav-overlay-offset` (не padding на `#cms-snap-scroller` — у него `display:contents`); home: spacer скрыт при `.cms-hero-bleed` |
| Breadcrumbs | `SiteBreadcrumbs.tsx` + JSON-LD / prerender `BreadcrumbList` |
| Privacy / Terms | `/privacy`, `/terms` + footer columns |
| Canonical host / HTTPS / www 301 | `scripts/build-hosting.js` → `rootHtaccess()` + `frontend/public/.htaccess` |
| Bot H1 для hero-block | `PrerenderService::walkLayout` (`hero` + `hero-block`) |
| Cookie-баннер + GA gate | `components/layout/CookieBanner.tsx` + `lib/cookieConsent.ts` + `site_settings`; ZIP `modules-src/cookie-consent/` (категории/пресеты/лог/JS API) скрывает core-баннер |
| Cookie Consent (ZIP, GDPR/152-ФЗ) | `modules-src/cookie-consent/` → ZIP; админка `/admin/cookie-consent`; `window.jaseflyCookieGate`; `data-jasefly-cookie-open` |
| Jasefly Character / дух CMS (ZIP) | `modules-src/jasefly-character/` → ZIP 1.6+; ≤3 слова/emoji/тишина; idle→docs nudge; life milestones; Event API |
| Кастомный путь админки (SPA) | `admin/adminBasePath.ts` + `site_settings.admin_base_path` + `AppRouter.tsx` |
| Публичный поиск / 404 | `GET /search` → `SearchService::publicSearch`; `NotFoundPage` |
| Ручные 301/302 редиректы | `admin/pages/RedirectsPage.tsx` + `PathRedirectService` + `SeoModule` routes |
| Telegram с контакт-формы | `Modules/Mail/ContactFormService.php` + `TelegramNotifier.php` + `/admin/mail` |
| Сообщения / mark-read «зависло» | `UtilityPages.tsx` + `.htaccess`: `/api/*` не кэшировать (`IS_API` / `no-store`); не `max-age` с HTML `index.php` |
| Module Package Manager / ZIP модули | `Modules/ModuleManager/` + `Services/Modules/*` + `/admin/modules` + `scripts/build-module.js` + `modules-src/` + docs `MODULE-*.md`; FE reload: `packageModuleLoader` `?v=version` + unload on update; Node VPS: `runtime-node/src/modules/module-manager.ts` + `runtime-node/src/packages/*` |
| ZIP обновился, админка модуля «старая» | кэш ESM: `packageModuleLoader` должен unload+import `?v=`; Ctrl+F5; на хостинге файл `/modules/{slug}/index.js` уже новый |
| Плагин → пакетный модуль | `docs/glossary.md` + `docs/package-lifecycle.md` (эталон `modules-src/demo-kit/`) |
| Platform SDK (ZIP модули) | `backend/src/Platform/` + `frontend/src/platform/` + `docs/platform-sdk.md` |
| SDK validate / certify CLI | `backend/bin/sdk.php` · `Platform/Analysis/*` · `build-module.js` · `backend/bin/certify-lifecycle.php` · `docs/sdk-certification.md` |
| SDK certification / governance | `docs/sdk-certification.md` · `docs/contracts-and-governance.md` · `docs/sdk-versioning.md` |
| Capabilities / SDK report | `GET /admin/platform/capabilities` · `/admin/platform/sdk` · MCP `cms_sdk_report` / `cms_capability_report` / `cms_module_compatibility` / `cms_module_certify` / `cms_sdk_api_diff` / `cms_public_services` / `cms_sdk_deprecations` / `cms_export_sdk` |
| Установка пакета модуля | `ModulePackageService` (upload→inspect→install) + CLI `backend/bin/modules.php` + MCP `cms_module_*` |
| FE runtime пакетных модулей | `packageModuleLoader.ts` + `GET /modules/runtime-assets` + `/modules/{slug}/` assets |
| Отложенная публикация страниц | `PageScheduleService` (lazy publish) + `scheduled_at` в билдере |
| Плагины вкл/выкл, гейты UI | `frontend/src/core/pluginGates.ts`, `components/RequirePlugin.tsx`, `admin/pages/PluginsPage.tsx` (about/settings: не `h-full`+`overflow-hidden` — клиппает панели); EN: `admin/i18n` + BE `PluginCatalogMeta`/`PluginCatalogMetaEn` + `Accept-Language` |
| Плагины: «О плагине»/настройки не видны | `PluginsPage` PluginCard: не ставить `h-full`+`overflow-hidden` — grid обрезает панели |
| Админ RU/EN (плагины/модули) | `admin/i18n/{ru,en}.ts` + `translateNavGroup`; каталог плагинов EN в `PluginCatalogMetaEn.php`; `api.ts` шлёт `Accept-Language` |
| Тесты / CI / cms_local_test | `backend/tests/run.php` (+ Permission/API/CleanInstall/…/PackageEnableSync/ProjectsSoftApi/MigrationSqliteCompat/ContractGovernance/…), `backend/bin/certify-lifecycle.php`, `mcp-cms/src/local.js`, `.github/workflows/platform-sdk.yml`, `frontend` vitest (`npm test`) |
| Локально как GitHub sdk перед push | `node scripts/ci-sdk-check.js` (или `--fast`); pre-push: `git config core.hooksPath scripts/githooks` |
| SQLite migrate: OLD.id / MODIFY / prefix(191) | `Core/Db/SqlTranspiler.php` (rowid triggers, skip MODIFY, strip index prefix lengths); smoke: `MigrationSmokeTest` / `MigrationSqliteCompatTest` |
| Новая SQL-миграция на хостинге «не применяется» (pending пуст) | файл есть в `backend/migrations/`, но **не в** `MigrationService::FILES` — без строки в константе файл игнорируется |
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
| Дашборд / настраиваемые виджеты | `admin/dashboard/` (`DashboardShell`, `widgetRegistry`, `useDashboardLayout`) + prefs `admin.dashboard.layout.v1`; страница `admin/pages/DashboardPage.tsx` |
| Админ chrome / hero вкладок | `admin/components/AdminPageHero.tsx` (+ `AdminSectionLabel`); через `AdminSplitLayout` / `UtilityPages` Header и standalone pages |
| IconPicker перекрыт SaveBar | `IconPicker` → portal на `document.body` (z выше sticky); SaveBar в `AdminPages`/`SitePages` |
| Оверлей «Сохранено» по всей админке | `admin/feedback/SaveFeedbackOverlay.tsx` + `saveFeedback.ts`; emit из `lib/api.ts` request на успешный PUT/POST `/admin/*` |
| Публичные роуты | `frontend/src/routes/AppRouter.tsx`, `pages/PublicPages.tsx` |
| API-клиент фронта | `frontend/src/lib/api.ts`, `hooks/useApi.ts` |
| Тема / site settings / nav | `modules/site/`, `context/SiteContext.tsx`, backend `Modules/System`, `Modules/Content` |
| Админ «Навигация» (билдер шапка/подвал) | `modules/site/NavigationBuilderPage.tsx` (+ `CrudEditPage` на `navigation/:id`); публичный рендер `SiteLayout` Header/Footer |
| Подвал слоган/копирайт HTML | `SiteLayout` Footer + `sanitizeHtml`; админ textarea в `SitePages` path=`footer` |
| Соцсети (ядро, не Portfolio) | FE `modules/site` + hub Оформление; BE `ContentModule` resources/blueprints; `PublicController.site.social` без portfolio-gate; таблица `social_links` |
| Проекты / блог / услуги | `modules/projects|blog|services/` ↔ `backend/src/Modules/{Projects,Blog,Content}/` |
| Редактор блога (writing studio) | `modules/blog/admin/BlogEditPage.tsx` + `BlogComposer.tsx` (TipTap HTML, bubble/slash, meta drawer) |
| Товары / оплата | `modules/products|payments/` ↔ `Modules/Products|Payments/` |
| Заказы / корзины / возвраты | `modules/orders/` ↔ `Modules/Orders/` + адаптер в `Payments/PaymentService.php` |
| Комментарии / отзывы / рейтинги | `modules/comments/` ↔ `Modules/Comments/` + `builder/widgets/comments.tsx` |
| Аналитика событий / целей | `modules/analytics/` (`AnalyticsAdminPage`, `AnalyticsCharts`, `DashboardAnalyticsWidget`) ↔ `Modules/Analytics/` + `beacon.ts` / `AnalyticsBeacon.tsx`; виджет дашборда `admin/dashboard/widgets/AnalyticsDashWidget.tsx` |
| Медиа / неиспользуемые / битые | `UtilityPages` `MediaLibraryPage` + справка; BE `MediaUsageService` (`/admin/media/unused`) + `MediaController` purge-missing |
| Перегрузки / load average / 503 | FE `modules/overload` + `OverloadPage` + dashboard `OverloadWidget`; BE `Modules/Overload/` (`OverloadGuardMiddleware`, `OverloadService`: per-CPU + sustained + quiet after `SiteUpdater`); HTML early shed в `scripts/build-hosting.js` `rootIndexPhp` |
| Auth / users / 2FA | `context/AuthContext.tsx`, `Modules/Users/`, `Controllers/AuthController.php` |
| Миграции SQL | `backend/migrations/*.sql` (+ plugin migrations в `Modules/*/migrations/`) |
| Module Package Manager (install/update ZIP) | `Modules/ModuleManager/ModuleManagerModule.php`, `Services/Modules/ModulePackageService.php`, `ModulePluginMirror.php`, `bin/modules.php` (`reconcile-mirror`), `Core/Modules/*`, `migrations/020_installed_modules.sql` |
| ZIP module quarantine (broken ≠ kill API) | `ModuleQuarantine` + `ModuleQuarantinePolicy` + `ModuleQuarantineReason`; критерии: exception / bootstrap_timeout / memory_limit / route_conflict / missing_dependency / sdk_incompatible / migration_failed; `Router` duplicate → `RouteConflictException`; admin `quarantine.reason`; tests `ModuleQuarantineIsolationTest` + `ModuleQuarantinePolicyTest`; emergency `public/emergency-module-quarantine.php` |
| ZIP enable SoT (installed_modules vs plugins) | Canonical: `installed_modules.status`; mirror: `modules.is_enabled` via `ModulePluginMirror`; Plugins toggle for packages → `ModulePackageService`; CLI `modules.php reconcile-mirror` |
| Demo package module source | локально `modules-src/demo-kit/`; CI/public: `backend/tests/fixtures/modules/demo-kit/` |
| Access ZIP scaffolds (group / subscription / wallet) | `modules-src/{user-groups,subscriptions,wallet}/` → register AccessProviders (local-only) |
| Forms SDK certification reference | локально `modules-src/forms-sdk-reference/`; CI/public: `backend/tests/fixtures/modules/forms-sdk-reference/` |
| modules-src нет в git / CI падает на certify | эталоны в `backend/tests/fixtures/modules/`; resolve: `SdkCliService` + `scripts/build-module.js` |
| AI Content Optimizer (ZIP, OpenRouter SEO-рерайт) | `modules-src/ai-content-optimizer/` → ZIP `release/modules/`; FE `frontend-dist/index.js` (профили/настройки OpenRouter/лог); job `ai-content-optimizer.tick` |
| IndexNow (ZIP, Bing/Яндекс/Seznam + rate-limit) | `modules-src/indexnow/` → ZIP `release/modules/`; админка `/admin/indexnow`; ключ `/{key}.txt`; cooldown 429 / URL / debounce; Google≠IndexNow |
| Карта / maps / leaflet / OSM | ZIP `modules-src/maps/` → виджет `maps.map`, демо `/maps-demo`, админка `/admin/maps`; default Яндекс; docs `docs/modules/maps.md` |
| CSP блокирует iframe Яндекс Карт | `frame-src` в `frontend/public/.htaccess` + `scripts/build-hosting.js` `rootHtaccess()` (yandex.ru / *.yandex.ru) |
| Контакты: lat/lng + embed | singleton `contact-info` (`map_lat`/`map_lng`/`map_embed`) в `SitePages.tsx`; интерактивная карта — виджет `maps.map` |
| Журнал MCP / activity время не МСК | `admin/lib/formatDateTime.ts` (naive DATETIME = Moscow); Dashboard/Enterprise; BE `APP_TIMEZONE` + MySQL `SET time_zone` |
| Контент на проде (текст/страницы) | MCP `cms_site_map` → `cms_get` / `cms_bulk` / `cms_put_singleton` |
| Публичная API-документация (люди + агенты) | страница CMS `/api-docs` + `GET /api/v1/docs` ([backend/docs/openapi.php](backend/docs/openapi.php)); локальный apply `content/jasefly-official/apply-api-docs.mjs` (gitignored) |
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
  mcp-cms/            ← MCP-сервер деплоя/контента (multi-site: src/sites.js)
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
| `architecture-stack` `code-snippet` `code-tabs` `status-roadmap` `dev-journey` `repo-tree` `status-timeline` `github-pulse` `explore-doors` | `widgets/framework.tsx` + `frameworkPulse.tsx`; метрики: `frontend/scripts/generate-site-pulse.mjs` → `src/generated/sitePulse.json` |
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
| `mail/` `webhooks/` `ddos/` `overload/` `system/` | одноимённые | интеграции / безопасность |

Новый модуль: `docs/module-system.md` + `docs/extension-points.md` + зеркало в `frontend/src/modules/{name}/`.

---

## Admin UI

| Что | Где |
| --- | --- |
| Shell админки | `admin/AdminApp.tsx` |
| Меню админки (сетка) | `AdminNavNerve.tsx` + `AdminApp.tsx`; `navIcons.ts` + `useAdminNavAttention`; fold в `getAdminNavGrouped` |
| Роутинг экранов | `admin/adminRoutes.tsx` |
| Хабы меню | `admin/adminHubs.ts` + вложенные пункты в `AdminApp` |
| Страницы CMS (list/builder entry) | `admin/pages/PagesAdmin.tsx` |
| Site / theme / nav singletons | `admin/pages/SitePages.tsx` |
| Редиректы 301/302 | `admin/pages/RedirectsPage.tsx` |
| Плагины | `admin/pages/PluginsPage.tsx` |
| CRUD generic | `admin/pages/AdminPages.tsx` |
| Rich text | `admin/components/RichTextEditor.tsx` (общий); блог — `modules/blog/admin/BlogComposer.tsx` |

---

## Backend ядро

| Что | Где |
| --- | --- |
| Роуты API (live) | `ModuleRegistry::registerRoutes` via `public/index.php` (`routes/api_v1.php` — tests/legacy) |
| Реестр модулей | `backend/src/Core/ModuleRegistry.php` + каждый `*Module.php` · docs: `docs/bootstrap-and-request.md` |
| Публичный bootstrap | `Controllers/PublicController.php` |
| Конфиг | `backend/config/app.php`, `config.local.php`, `.env` |
| Установка/миграции CLI | `backend/migrate.php`, `install.php` (`--password=` / `admin_password`, min 12; без дефолта) |
| Production hardening (debug/headers/secrets) | `ErrorReportService::shouldExposeDetails` (только `.show_errors` / APP_ENV local\|dev\|test); `SecurityHeadersMiddleware` (CSP/HSTS/COOP/CORP); `Bootstrap` empty JWT in production; uploads `MediaService` + `build-hosting` `.htaccess` |

---

## MCP (хостинг / контент)

Сервер: `user-jasefly-cms` (`mcp-cms/`). Секреты только в `mcp-cms/.env`. Мульти-сайт: `CMS_SITES` + `CMS_SITE_{ID}_*` → параметр **`site`** (id/alias/домен); список — **`cms_sites`** (`mcp-cms/src/sites.js`).

| Инструмент | Когда |
| --- | --- |
| **`cms_sites`** | Список хостов MCP (без токенов); при ≥2 сайтах спроси пользователя и передай `site` |
| **`cms_release`** | Любая заливка кода (build→test→changelog→deploy→verify); при multi — `site` обязателен |
| Dual-runtime PHP Shared ↔ Node VPS | Baseline `contracts/baseline/` · **behavior** `contracts/behavior/` + `scripts/behavior/{extract,generate,run-all,module-status}.mjs` · parity `tests/parity/{behavior-runner,generated}/` · прогресс AUTO `docs/dual-runtime-parity-progress.md` · gate `docs/dual-runtime-verification-report-final.md` · VPS `scripts/vps/package-and-smoke.mjs` · validate `scripts/contracts/validate-contracts.js` |
| CI parity «This operation was aborted» / зависание chunk | `run-all.mjs`: drain php/node stdout (php -S access log → pipe deadlock) + cleanup SIGKILL; `behavior-runner.mjs`: AbortController timeout → exit 2 INFRA (не parity fail), health every N |
| Runtime × target CLI (`JASEFLY_RUNTIME` / `JASEFLY_TARGET`) | `scripts/jasefly/{cli,config,matrix,doctor}.mjs` + `adapters/{php,node,dual}.mjs` · матрица `docs/runtime-target-matrix.md` · docker `deploy/docker/` · bin `jasefly` (root `package.json`) · MCP gate в `mcp-cms/src/local.js` |
| Release package identity | root `VERSION` / `LICENSE.md` / `NOTICE` → PHP ZIP (`build-hosting.js`, no `api/tests`) · Node VPS tgz (`mcp-cms/src/deploy/vps.js` + `release-meta.json`) |
| Core freeze 1.0 (что нельзя ломать) | `docs/core-freeze-1.0.md` |
| Не те модули / старая админка после «успешного» деплоя | Проверь `release/jasefly-cms-update-*.zip` (не legacy `portfolio-hosting-update-*`); `mcp-cms/src/local.js` → `findLatestUpdateZip`; явный `cms_deploy_update(zip_path=…)` |
| `cms_site_map` | Карта живого сайта перед правками контента |
| `cms_pages_digest` / `cms_page_digest` | Короткие выжимки страниц |
| `cms_list` / `cms_get` / `cms_update` / `cms_bulk` | CRUD ресурсов (bulk ≤25) |
| `cms_put_singleton` | theme, site settings, profile… |
| `cms_verify_alive` / `cms_site_diagnostics` | После проблем |
| `cms_hosting_guard` | Лимиты запросов к хостингу |
| `cms_plugins_list` / `cms_plugin_toggle` | Каталог и вкл/выкл плагинов (`confirm` на toggle) |
| `cms_admin_request` | Авторизованный `/admin/*` (модули IndexNow и т.п.; мутации + `confirm`) |
| `cms_module_release` (+ `install:true`) | Сборка ZIP; опционально upload+install/update+enable на хостинг |
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
