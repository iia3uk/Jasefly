# CMS Map — читать первым

**Бренд:** Jasefly (AI-first dual-runtime platform; CMS — часть админки) · **Стек:** React/Vite (`frontend/`) + PHP (`backend/`) + Node (`runtime-node/`) · **Контракты:** `contracts/` · **CLI:** `scripts/jasefly/cli.mjs` · **Деплой:** MCP `user-jasefly-cms` → `cms_release`

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
| Корзина empty-all 500 / нет deleted_at | `SoftDeleteService::trashableMap()` = HOST ∪ `PackageSurfaceRegistry`; UI `EnterprisePages` + `TrashController` |
| Package surfaces (trash/dashboard/sitemap/media/ACL) | `PlatformContext::surfaces()` → `PackageSurfaceRegistry` (PHP/Node); declarations in package `module.json` `surfaces` |
| Current package architecture / LLM handoff | `docs/architecture/CURRENT.md` · `docs/architecture/LLM_CONTEXT.md` · `AGENTS.md` · catalog `release/catalog/packages.json` |
| Extracted domain package list (15, external) | `release/catalog/packages.md` · identity `release/catalog/manifests/{slug}.json` · source repo `Jasefly-Modules/modules-src/` (nested git, ignored) · ZIP via Module Hub / local `release/modules/` |
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
| Переводчик / auto-warmup 429 | ZIP `modules-src/translate/` (`Platform HTTP` soft limit); FE `TranslateAutoWarmup.tsx` через host slot `site.runtime` |
| Прогрев «Нет прогресса» / en→en | `TranslateModule::allowedTargets` исключает `source_lang`; иначе chunk крутит same-lang и FE стопорится |
| Переводчик медленный при «всё в кэше» | FE `TranslateWidget`: session/memory map + paint до API; `fill_misses=false` если `cache_ready`; Google без Libre-fallback |
| Переводчик не весь DOM / attrs / chrome | `TranslateWidget.tsx`: корни `main/header/footer/[data-translate-root]`, attrs placeholder/aria-label/title/alt, `document.title`, MutationObserver; chrome: breadcrumbs/cookie/rail/custom_html |
| Переводчик кэш + soft miss-fill | `POST /translate/batch` `fill_misses` → `TranslateService::translateBatch(..., fillMissCap=12)`; warmup/corpus для полноты |
| Переводчик авто-язык по стране | `TranslateGeo.php` (CF/CDN/Accept-Language) → `publicConfig.suggested_lang`; FE `TranslateWidget` если нет localStorage; fallback `en` |
| Переводчик corpus ≠ DOM | `PlatformContentInterface::collectHumanReadableStrings` (host tables/columns) + package `TranslateSync` HTML-split; singleton JSON → walkJson; без slug |
| Переводчик фейки / синк контента | `TranslateCache::purgeInvalid` + `TranslateSync` (resource.afterSave) + админка «Очистить фейки» |
| Google / LibreTranslate / MyMemory / DeepL | `TranslateService` + настройки плагина `provider` (default google) |
| Тикеты / live chat / FAQ-бот | ZIP `modules-src/support/` (+ fixture); host pages + widget через `site.runtime` |
| Формы / заявки / виджет form | ZIP `modules-src/forms` (+ fixture); FE host pages via `hostPageKey`; widget `form` + `stableType`; cert example `forms-sdk-reference` (`fsr_*`) — не live engine |
| Планировщик / cron jobs | `modules/scheduler/` ↔ `Modules/Scheduler/` + Platform `scheduler()`/`jobs()` (namespaced package jobs) + `PackageJobLifecycle` + `admin/pages/SchedulerPage.tsx`; probe `tests/fixtures/modules/sdk-scheduler-probe` |
| Автоматизации / уведомления / рассылки | automation → ZIP `modules-src/automation` (+ EventCatalog); notifications → ZIP `modules-src/notifications` (`notifications.send` via `registerBackend`, host page/bell + slot `admin.header`); newsletter → ZIP `modules-src/newsletter` |
| Newsletter (ZIP) | `modules-src/newsletter/` (+ fixture); host pages via `hostPageKey`; widget `newsletter-signup` + `stableType`; Scheduler `campaign.send`; Mail `$ctx->mail()` |
| Jasefly Lab / эксперименты | `modules/lab/` ↔ `Modules/Lab/` + `/lab/:slug` (вне SiteLayout); entries: `starter`, `reference` |
| FAQ клик в чате | `POST /support/faq/{id}/ask` + чипы в `SupportWidget` |
| Support poll 429 | Platform `softRateLimitMiddleware` на GET messages + backoff в `SupportWidget`; DDoS skip `/support/` |
| История чата после reload | `GET /support/active` + cookie/localStorage `visitor_key` |
| Звук чата (виджет / inbox) | `lib/supportNotifySound.ts` + `SupportWidget` / `SupportInboxPage` |
| Стили/цвет/шрифт/градиент текста | `builder/edit/StyleFields.tsx`, `ColorControl.tsx`, `colorUtils.ts`, `lib/googleFonts.ts` |
| Seed-лейауты страниц (home/about/…) | `frontend/src/builder/migrateHome.ts` (`buildDefaultHomeLayout` = platform OOB; `buildDefaultContactLayout` — карта+контакты 2 кол.); fallback без Portfolio → `PublicPages.HomePage` + `LayoutRenderer` |
| Root dumps / фото не в git | `.gitignore`: `/dumps/` `/_scratch/` `/*.jpg` `/*.png` (кроме `logo.png`/`og.png`/svg) |
| Билдер: 2 колонки съезжают в столбец | `LayoutRenderer` секция = CSS grid `Nfr` (не flex %+gap) |
| Публичный рендер страницы из layout | `builder/public/CmsPages.tsx`, `builder/public/parseLayout.ts`, `builder/render/LayoutRenderer.tsx` |
| «Сайт не из pages / не из БД» | `isSeedLayout` (`CmsPages.tsx`): seed/пусто → classic `HomePage` из `hero_settings`+секций; `useOnSite:true` → `pages.layout_json`. Локальный apply-пак `content/jasefly-official/` (gitignored) — только apply в БД, не runtime |
| Админ «Главная» / Оформление | Редирект в билдер `pages` is_home (`SitePages.HomepagePage`). Не путать с пустой `homepage_sections` — контент в `pages.layout_json` |
| Черновик на живом URL (только админ) | `backend/.../PublicController.php` → `page()` + `CmsPages.tsx` баннер |
| SEO страницы (title/desc/OG/расписание) | `builder/editor/PageBuilderPage.tsx` → `PageSettings`; `SeoHead` в `SiteLayout.tsx` |
| SEO из коробки (Jasefly) | PHP `migrations/clean_base_seed.php`; Node `runtime-node/src/install/seedPlatformDefaults.ts` (из `ensureAdmin`); singleton `seo` / главная `seo_title` |
| SEO целевые рынки (CIS/EU/USA/ASIA, areaServed) | `/admin/seo` → `seo_settings.target_regions` + `PrerenderService` JSON-LD |
| SEO боты / пустой `#root` / Яндекс | корневой `index.php` + `spa.html` + `PrerenderService` / `.htaccess` (`?prerender=1`) |
| Beget analyzer / H1 в shell | `PrerenderService::enrichSpaHtml` (seo-fallback) + расширенные BOT_MARKERS / UA в `.htaccess` |
| Last-Modified / HTML cache | `scripts/build-hosting.js` → `rootIndexPhp()` + Cache-Control 60s; missing `/assets/*` → 404 (не SPA HTML) |
| После деплоя белый экран / MIME assets | Inline recovery в `frontend/index.html` + `main.tsx` `vite:preloadError`: один hard-reload с `?_=` |
| Breadcrumbs / контент под прозрачным header (не home) | `SiteLayout` + `.cms-nav-overlay-offset` (не padding на `#cms-snap-scroller` — у него `display:contents`); home: spacer скрыт при `.cms-hero-bleed` |
| Пустая шапка/футер OOB | `SiteLayout.tsx`: Header → null если `navigation=[]`; Footer → null если нет copyright/tagline/колонок/footer_nav/контактов/соцсетей |
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
| Telegram с контакт-формы | `Modules/Mail/ContactFormService.php` + `TelegramNotifier.php` + `/admin/mail` (coupling; not extracted) |
| SMTP / Platform mail | SoT `modules.settings` name=mail (Plugins UI `/admin/plugins` + Mail page); `$ctx->mail()` → `MailAdapter` → `Mailer`; `isAvailable` ≠ `has(mail.send)`; secrets via `getPublicSettings`; legacy `email_settings` read-only fallback (+ old SitePages `email-settings` write still present) |
| Сообщения / mark-read «зависло» | `UtilityPages.tsx` + `.htaccess`: `/api/*` не кэшировать (`IS_API` / `no-store`); не `max-age` с HTML `index.php` |
| Module Package Manager / ZIP модули | `Modules/ModuleManager/` + `Services/Modules/*` + `/admin/modules` + `scripts/build-module.js` + `modules-src/` + docs `MODULE-*.md`; FE reload: `packageModuleLoader` `?v=version` + unload on update; Node VPS: `runtime-node/src/modules/module-manager.ts` + `runtime-node/src/packages/*` (`PackageLoader`, `ModuleMigrations`, `ModuleAssets`) · docs `docs/node-package-host.md` |
| ZIP обновился, админка модуля «старая» | кэш ESM: `packageModuleLoader` должен unload+import `?v=`; Ctrl+F5; на хостинге файл `/modules/{slug}/index.js` уже новый |
| Плагин → пакетный модуль | `docs/glossary.md` + `docs/package-lifecycle.md` (эталон `modules-src/demo-kit/`) |
| Platform SDK / Content Resources (ZIP модули) | `backend/src/Platform/` (`PlatformContentResourcesInterface`, `ContentResourcesAdapter`, `PlatformContext::resources()`) + `frontend/src/platform/` + `docs/platform-sdk.md` |
| Live ZIP lifecycle verify (MySQL) | `JASEFLY_LIVE_VERIFY=1 php backend/bin/live-package-verify.php` (+ Docker MySQL / `config.local.php`); report `backend/storage/live-package-verify-report.json` |
| PHP architecture FREEZE | `docs/php-architecture-final.md` — Core/host/ZIP ownership; no new PHP extract without Node parity need |
| Node architecture audit (post-extract) | `docs/node-architecture-audit.md` — package host READY; native SDK; synthetic proof `package-host-zed.test.ts` |
| Node native SDK phase | `docs/node-domain-native-sdk.md` + assertions `runtime-node/tests/package-native-sdk-assertions.test.ts` |
| Cross-runtime package architecture | `docs/cross-runtime-architecture.md` — one ZIP identity; dual zed fixture; Node host consumers use `PackageSurfaceRegistry` ∪ `hostBaselines` (trash/dashboard/sitemap/ACL) |
| Node package host (generic ZIP runtime) | `runtime-node/src/packages/{PackageLoader,ModuleMigrations,ModuleAssets,ModulePackageService,PackageSourceSync,invokePackageEntry}.ts` + `platform/{sdk,PackageSurfaceRegistry,EventCatalog,CapabilityRuntime}.ts` + `system/hostBaselines.ts` + `/modules/{slug}/*` + docs `docs/node-package-host.md` |
| Node domain native SDK (pure PlatformContext) | `modules-src/{slug}/backend/node` `register(ctx)`; shared `package-sdk/node/`; no `registerLegacy` / `legacyModuleBind`; docs `docs/node-domain-extraction.md` |
| Node domain extraction (15 ZIP packages) | `modules-src/{slug}/backend/node/` + PackageLoader; host-only `registerAll.ts` |
| Extract / migrate Node domain package | `node scripts/extract-node-domain.mjs` · `node scripts/migrate-node-domain-to-platform.mjs` |
| SDK validate / certify CLI | `backend/bin/sdk.php` · `Platform/Analysis/*` · `build-module.js` · `backend/bin/certify-lifecycle.php` · `docs/sdk-certification.md` |
| SDK certification / governance | `docs/sdk-certification.md` · `docs/contracts-and-governance.md` · `docs/sdk-versioning.md` |
| Capabilities / SDK report | `GET /admin/platform/capabilities` · `/admin/platform/sdk` · MCP `cms_sdk_report` / `cms_capability_report` / `cms_module_compatibility` / `cms_module_certify` / `cms_sdk_api_diff` / `cms_public_services` / `cms_sdk_deprecations` / `cms_export_sdk` |
| Установка пакета модуля | `ModulePackageService` (upload→inspect→install) + CLI `backend/bin/modules.php` + MCP `cms_module_*` |
| FE runtime пакетных модулей | `packageModuleLoader.ts` + `GET /modules/runtime-assets` + `/modules/{slug}/` assets |
| Отложенная публикация страниц | `PageScheduleService` (lazy publish) + `scheduled_at` в билдере |
| Плагины вкл/выкл, гейты UI | `frontend/src/core/pluginGates.ts`, `components/RequirePlugin.tsx`, `admin/pages/PluginsPage.tsx` (about/settings: не `h-full`+`overflow-hidden` — клиппает панели); EN: `admin/i18n` + BE `PluginCatalogMeta`/`PluginCatalogMetaEn` + `Accept-Language` |
| Шаблоны/роли до активации плагина | `SystemTemplates::demoPagesForPlugin` (владелец) + `demoPagesForEnabled` / Node `buildPageTemplates` (fail-closed); FE `SLUG_PLUGIN_GATES` / `PERMISSION_PLUGIN_GATES`; `isPluginEnabled` fail-closed до гидрации |
| Плагины: «О плагине»/настройки не видны | `PluginsPage` PluginCard: не ставить `h-full`+`overflow-hidden` — grid обрезает панели |
| Админ RU/EN (плагины/модули) | `admin/i18n/{ru,en}.ts` + `translateNavGroup`; каталог плагинов EN в `PluginCatalogMetaEn.php`; `api.ts` шлёт `Accept-Language` |
| Тесты / CI / cms_local_test | `backend/tests/run.php` (+ Permission/API/CleanInstall/…/PackageEnableSync/ProjectsSoftApi/MigrationSqliteCompat/ContractGovernance/…), `backend/bin/certify-lifecycle.php`, `mcp-cms/src/local.js`, `.github/workflows/platform-sdk.yml`, `frontend` vitest (`npm test`) |
| Локально как GitHub sdk перед push | `node scripts/ci-sdk-check.js` (или `--fast`); pre-push: `git config core.hooksPath scripts/githooks` |
| SQLite migrate: OLD.id / MODIFY / prefix(191) | `Core/Db/SqlTranspiler.php` (rowid triggers, skip MODIFY, strip index prefix lengths); smoke: `MigrationSmokeTest` / `MigrationSqliteCompatTest` |
| Новая SQL-миграция на хостинге «не применяется» (pending пуст) | файл есть в `backend/migrations/`, но **не в** `MigrationService::FILES` — без строки в константе файл игнорируется |
| Contract governance (snapshots) | `Platform/Manifest/{api-snapshot,capabilities,permissions-core,events-core}.v1.json` · `mcp-cms/manifest/mcp-tools.v1.json` · `builder/manifest/widget-types.v1.json` · `ContractGovernanceTest.php` · vitest `widget-types.test.ts` · regen: `node backend/tests/gen-contract-snapshots.js` |
| Security verification (SSRF/2FA/upload) | `Support/SsrfGuard.php` · `SecurityVerificationTest.php` · `TotpService` · `BackupService` · `MediaService` · `AuthController::refresh` (rotation) · `WebhooksModule` (HMAC + SSRF) |
| Pentest hardening (activity/SVG/login/CSRF/MCP hint) | `ActivityController` + `PermissionService::capabilityForAdminPath` · `MediaService` SVG ban (`rejectSvgUpload`) · `RateLimitMiddleware` (login 5/900 fail-closed) · global `OriginCheckMiddleware` in `public/index.php` + `OriginGuard` · `SystemHealthService::mcpStatus` · `module-asset.php` + `ModuleAssetGate` · tests `PentestHardeningTest.php` · `docs/security.md` |
| MCP dual-secret (Bearer + HMAC) | `Support/McpRequestAuth.php` · `AuthMiddleware` · migration `030_mcp_nonces.sql` · config `MCP_SIGNING_SECRET` / `MCP_AUTH_MODE` · mcp-cms `sites.js` + `client.js` (`buildMcpSignature`) · tests `McpRequestAuthTest.php` · `docs/mcp-multi-site.md` |
| Telegram deploy Approve (opt-in) | PHP: `Support/DeployTelegramApprove.php` · `SiteUpdater::applyStagedZip` · ZIP stage. Node VPS: `runtime-node/src/support/DeployTelegramApprove.ts` · `POST /admin/deploy/telegram/request|redeem` · Approve≠SSH (MCP redeem→SSH). Shared: `POST /telegram/deploy-webhook` + `/admin/updates/pending/{id}/approve` · env `TELEGRAM_DEPLOY_*` on **host** · mcp-cms `telegramGate.js` / `pending_approval` · tests PHP + `runtime-node/tests/deployTelegramApprove.test.ts` · `docs/deployment.md` |
| MCP dual-secret Node | `runtime-node/src/support/mcpRequestAuth.ts` · `AuthService.meFromBearer` · CORS `X-Jasefly-*` · same headers as PHP · tests `mcpRequestAuth.test.ts` |
| Content/webhook ACL + Host URLs | `PermissionService::{canMutateContent,requireContentMutation}` · `PermissionMiddleware` · `AdminController` · `WebhooksModule` (`integrations.manage`) · revision restore in `SystemModule` · `Support/PublicOrigin.php` · FE `sanitizeHtml` on `access.tsx` deny_template · Node `ssrfGuard.ts`/`permissionMiddleware.ts` · `ContentAclSecurityTest.php` |
| Maintainability helpers | `Support/{SsrfGuard,OutboundHttp,SecretRedactor,PublicOrigin,CsvExport}.php` · `Response::error(..., $extra)` · `MaintainabilityTest.php` |
| Package host admin pages | FE `platform/hostAdminPages.ts` (`provideHostAdminPage` / `resolveHostPage`) + `PlatformAdminScreen.hostPageKey` |
| SDK unknown-slug probe | fixture `tests/fixtures/modules/sdk-boundary-probe` + `SdkBoundaryProbeTest` (second random slug clone) |
| Диагностика модулей (load fail / safe-mode) | `ModuleRegistry::loadFailures`, `ModuleSafeMode`, `SystemHealthService` → `/admin/system` (`EnterprisePages.tsx`) |
| Целостность ops (snapshot/migrate/schedule/content pack) | `ModulePackageService` + `ModuleSnapshotService` + `PageScheduleService` + `ContentPackImporter` / `import-content.php --confirm` |
| Router 404/405 / CORS OPTIONS / RateLimit | `backend/src/Router.php`, `Request.php`, `public/index.php`, `Middleware/RateLimitMiddleware.php` |
| `/api/v1/projects` 404 при выкл. Projects | public GET на ZIP `modules-src/projects` через `$ctx->resources()`; FE gate = `projects` (Portfolio = deprecated composition only) |
| `/api/v1/admin/projects` при выкл. Projects | Design B: package `registersRoutesWhenDisabled`; GET list `[]`, GET item 404; mutations fail when resource unregistered |
| `/admin/{resource}` 404 при выкл. плагине | `ADMIN_RESOURCE_PLUGINS` + `useAdminResourceEnabled`; `adminList`/`adminGet` silent 404→[]; Dashboard `contentHealth` gated; PluginsPage re-sync `setPluginStates` |
| Content Resources (generic package content) | `PlatformContentResourcesInterface` + `ContentResourcesAdapter` + `$ctx->resources()`; synthetic proof `zed-content-probe`; Blog/Projects ZIPs |
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
| Проекты / блог / услуги | ZIP `release/modules/jasefly-module-{projects,blog}-1.0.0.zip` ← `modules-src/{projects,blog}/` (+ fixtures); services host `ContentModule`; Portfolio deprecated composition (`Modules/Portfolio`) — не ZIP |
| Редактор блога (writing studio) | `modules/blog/admin/BlogEditPage.tsx` + `BlogComposer.tsx` (TipTap HTML, bubble/slash, meta drawer) |
| Webhooks (ZIP, extracted) | `modules-src/webhooks/` (+ CI fixture `backend/tests/fixtures/modules/webhooks/`); FE via `packageModuleLoader`|
| Comments (ZIP, extracted) | `modules-src/comments/` (+ fixture `backend/tests/fixtures/modules/comments/`); frozen widgets `comments`/`reviews`/`rating-summary`/`review-form` via Platform `stableType`|
| Builder package widgets (stable IDs) | `frontend/src/platform/resolvePackageWidgetType.ts` + `stableType` on `PlatformWidgetDefinition`; freeze cover: `builder/manifest/package-stable-widget-types.v1.json` |
| Товары / оплата | Products ZIP `modules-src/products/`; Payments ZIP `modules-src/payments/` (+ fixture), host page via `hostPageKey: payments.admin`|
| Заказы / корзины / возвраты | ZIP `modules-src/orders/` (+ fixture); host page via `hostPageKey: orders.admin` |
| Комментарии / отзывы / рейтинги | `modules/comments/` ↔ `Modules/Comments/` + `builder/widgets/comments.tsx` |
| Аналитика событий / целей | ZIP `modules-src/analytics/` (+ fixture `tests/fixtures/modules/analytics`); FE via `packageModuleLoader`; host page `AnalyticsAdminPage` via `hostPageKey: analytics.admin`; beacon → host slot `site.body.end` + consentBridge; jobs `$ctx->scheduler()` local `retention`/`aggregate`|
| Host slots / package mount | FE `platform/hostSlots.ts` (`site.body.end` / `site.runtime` / `admin.dashboard`) + `consentBridge.ts`; `SiteLayout` / `DashboardShell` mount `<HostSlot />` — без slug-hardcode |
| Медиа / неиспользуемые / битые | `UtilityPages` `MediaLibraryPage` + справка; BE `MediaUsageService` (`/admin/media/unused`) + `MediaController` purge-missing |
| Перегрузки / load average / 503 | FE `modules/overload` + `OverloadPage` + dashboard `OverloadWidget`; BE `Modules/Overload/` (`OverloadGuardMiddleware`, `OverloadService`: per-CPU + sustained + quiet after `SiteUpdater`); HTML early shed в `scripts/build-hosting.js` `rootIndexPhp` |
| Auth / users / 2FA | `context/AuthContext.tsx`, `Modules/Users/`, `Controllers/AuthController.php` |
| AdminBar после оффлайна / `/auth/me` 401 | `lib/api.ts` session recovery для `/auth/me` + `AuthContext.refreshCapabilities` clear (не stale role); `AdminBar` по `token` |
| Миграции SQL | `backend/migrations/*.sql` (+ plugin migrations в `Modules/*/migrations/`) |
| Module Package Manager (install/update ZIP) | `Modules/ModuleManager/ModuleManagerModule.php`, `Services/Modules/ModulePackageService.php`, `ModulePluginMirror.php`, `bin/modules.php` (`reconcile-mirror`), `Core/Modules/*`, `migrations/020_installed_modules.sql` |
| ZIP module quarantine (broken ≠ kill API) | `ModuleQuarantine` + `ModuleQuarantinePolicy` + `ModuleQuarantineReason`; критерии: exception / bootstrap_timeout / memory_limit / route_conflict / missing_dependency / sdk_incompatible / migration_failed; `Router` duplicate → `RouteConflictException`; admin `quarantine.reason`; tests `ModuleQuarantineIsolationTest` + `ModuleQuarantinePolicyTest`; emergency `public/emergency-module-quarantine.php` |
| ZIP enable SoT (installed_modules vs plugins) | Canonical: `installed_modules.status`; mirror: `modules.is_enabled` via `ModulePluginMirror`; Plugins toggle for packages → `ModulePackageService`; CLI `modules.php reconcile-mirror` |
| Demo package module source | локально `modules-src/demo-kit/`; CI/public: `backend/tests/fixtures/modules/demo-kit/` |
| Access ZIP scaffolds (group / subscription / wallet) | `modules-src/{user-groups,subscriptions,wallet}/` → register AccessProviders (local-only) |
| Forms SDK certification reference | локально `modules-src/forms-sdk-reference/`; CI/public: `backend/tests/fixtures/modules/forms-sdk-reference/` |
| certify без локального modules-src | CI fixtures `backend/tests/fixtures/modules/`; resolve: `SdkCliService` + `scripts/build-module.js`; authoring SoT = `modules-src/` |
| AI Content Optimizer (ZIP, OpenRouter SEO-рерайт) | `modules-src/ai-content-optimizer/` → ZIP `release/modules/`; FE `frontend-dist/index.js` (профили/настройки OpenRouter/лог); job `ai-content-optimizer.tick` |
| IndexNow (ZIP, Bing/Яндекс/Seznam + rate-limit) | `modules-src/indexnow/` → ZIP `release/modules/`; админка `/admin/indexnow`; ключ `/{key}.txt`; cooldown 429 / URL / debounce; Google≠IndexNow |
| Карта / maps / leaflet / OSM | ZIP `modules-src/maps/` → виджет `maps.map`, демо `/maps-demo`, админка `/admin/maps`; default Яндекс; docs `docs/modules/maps.md` |
| CSP блокирует iframe Яндекс Карт | `frame-src` в `frontend/public/.htaccess` + `scripts/build-hosting.js` `rootHtaccess()` (yandex.ru / *.yandex.ru) |
| Контакты: lat/lng + embed | singleton `contact-info` (`map_lat`/`map_lng`/`map_embed`) в `SitePages.tsx`; интерактивная карта — виджет `maps.map` |
| Журнал MCP / activity время не МСК | `admin/lib/formatDateTime.ts` (naive DATETIME = Moscow); Dashboard/Enterprise; BE `APP_TIMEZONE` + MySQL `SET time_zone` |
| MCP / агент UI (multi-site, где токен) | Админка `/admin/system?tab=mcp` → `EnterprisePages.tsx`; статус `SystemHealthService::mcpStatus` (`configured`/`signing_configured`/`auth_mode`) / Node `systemParity.ts`; SoT хостов `mcp-cms/.env` (`CMS_SITES`+`CMS_SITE_*`+`_SIGNING_SECRET`); гайд `docs/mcp-multi-site.md`; локальный Docker → `site=local` + `deploy/docker/.env`→`MCP_API_TOKEN` |
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
  mcp-cms/            ← MCP-сервер (multi-site: конфиг в .env; sites.js = парсер)
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
| `newsletter-signup` | ZIP package `modules-src/newsletter` (stableType); host stub `widgets/newsletter.tsx` |
| `comments` `reviews` `rating-summary` `review-form` | `widgets/comments.tsx` (plugin comments) |

Видео-URL логика: `builder/lib/videoEmbed.ts`.

---

## Ownership (кратко)

| Kind | Where |
| --- | --- |
| **HOST/CORE** | `backend/src/Modules/{Access,Content,Ddos,Demo,Lab,Mail,Media,ModuleManager,Overload,Portfolio,Scheduler,Seo,System,Template,Users}` + `Core/` + `Platform/` |
| **PACKAGE** (15 extracted) | `modules-src/{slug}/` → ZIP; see `release/catalog/packages.json` |
| **Portfolio** | Deprecated composition shell in host — **not** an extracted product package |

## Frontend modules ↔ backend

| FE `modules/` | BE `Modules/` | Суть |
| --- | --- | --- |
| `portfolio/` | `Portfolio/` | deprecated composition metadata (не ZIP) |
| `projects/` | ZIP `modules-src/projects` | кейсы / Content Resources |
| `blog/` | ZIP `modules-src/blog` | посты / Content Resources |
| `services/` | Content/услуги | услуги |
| _(ZIP)_ products | `PackageModules\Products` | каталог; host product admin pages via `hostPageKey`|
| _(ZIP)_ payments | `PackageModules\Payments` | checkout, provider webhooks and commerce catalog |
| `media/` | `Media/` | файлы |
| `users/` | `Users/` | админы/роли |
| `site/` | `System` + Content | тема, SEO, settings |
| `site/productLanding/` | — | витринный лендинг продукта Jasefly (`ProductLanding`) |
| _(ZIP)_ registration | `PackageModules\Registration` | публичная регистрация; Platform `auth()` lifecycle gate, users остаются host-owned |
| _(ZIP)_ translate | `PackageModules\Translate` | оверлей-переводчик сайта; host admin/widget via `hostPageKey` + `site.runtime`|
| _(ZIP)_ support | `PackageModules\Support` | тикеты / live chat / FAQ-бот; host slot `site.runtime`|
| _(ZIP)_ automation | `PackageModules\Automation` | сценарии + EventCatalog triggers; Scheduler `resume`|
| _(ZIP)_ notifications | `PackageModules\Notifications` | inbox + `notifications.send` provider; host `admin.header` bell|
| _(ZIP)_ newsletter | `PackageModules\Newsletter` | подписчики/кампании + `newsletter-signup`|
| _(ZIP)_ orders | `PackageModules\Orders` | корзины, заказы, статусы и возвраты; host page `orders.admin`|
| `comments/` (FE shell) | ZIP `modules-src/comments` | UI mirror; domain owned by package, not `Modules/Comments` |
| `mail/` `ddos/` `overload/` `system/` | одноимённые | host infra |
| _(ZIP)_ webhooks | `PackageModules\Webhooks` | исходящие webhooks — не bundled FE `modules/webhooks` |
| _(ZIP)_ comments | `PackageModules\Comments` | комментарии/отзывы + frozen builder widgets |
| _(ZIP)_ analytics | `PackageModules\Analytics` | beacon (host slot) + admin overview/goals + scheduler retention/aggregate|

Новый **host** модуль: `docs/module-system.md`. Новый **domain** feature: package (`docs/package-lifecycle.md` · `modules-src/`). See `docs/architecture/CURRENT.md`.

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

Сервер: `user-jasefly-cms` (`mcp-cms/`). Секреты только в `mcp-cms/.env`. Мульти-сайт: **SoT = `.env`** (`CMS_SITES` + `CMS_SITE_{ID}_*`); параметр tool **`site`**; список — **`cms_sites`**. `mcp-cms/src/sites.js` — только парсер env, **не** править чтобы добавить хост. Гайд: [`docs/mcp-multi-site.md`](docs/mcp-multi-site.md).

| Инструмент | Когда |
| --- | --- |
| **`cms_sites`** | Список хостов MCP (без токенов); при ≥2 сайтах спроси пользователя и передай `site` |
| **`cms_release`** | Любая заливка кода (build→test→changelog→deploy→verify); при multi — `site` обязателен |
| Dual-runtime PHP Shared ↔ Node VPS | Baseline `contracts/baseline/` · **behavior** `contracts/behavior/` + `scripts/behavior/{extract,generate,run-all,module-status}.mjs` · parity `tests/parity/{behavior-runner,generated}/` · прогресс AUTO `docs/dual-runtime-parity-progress.md` · gate `docs/dual-runtime-verification-report-final.md` · VPS `scripts/vps/package-and-smoke.mjs` · validate `scripts/contracts/validate-contracts.js` |
| CI parity php -S wedge ~132 req / abort | `behavior-runner`: `Connection: close` (undici keep-alive); chunk≤100; PHP_STALL exit 3 → restart+resume; drain stdout |
| CI parity deep JSON (overload/status, updates, prerender, translate warmup) | `scrub.mjs` env-volatile keys; Node `overload.ts` PHP_OS_FAMILY shape; PHP `BEHAVIOR_PARITY=1` skips live MT |
| Runtime × target CLI (`JASEFLY_RUNTIME` / `JASEFLY_TARGET`) | `scripts/jasefly/{cli,config,matrix,doctor}.mjs` + `adapters/{php,node,dual}.mjs` · матрица `docs/runtime-target-matrix.md` · dual docker `deploy/docker/{compose.dual.yml,Dockerfile.php,Dockerfile.node}` · bin `jasefly` (root `package.json`) · MCP gate в `mcp-cms/src/local.js` |
| Первый админ Node (нет install.php) | `runtime-node/src/install/ensureAdmin.ts` + boot в `index.ts` · env `ADMIN_EMAIL`/`ADMIN_PASSWORD` · CLI `npm run ensure-admin` · PHP-аналог: `backend/install.php` |
| Плагины default-off (нет 409 spam) | `PluginStateService` null→off · seed `028_plugin_default_off_seed.sql` · CORE always-on: `system`/`users`/`module-manager` · `029_core_module_manager_on.sql` · Node `plugins/pluginState.ts` + `publicSite` читает DB · FE `siteHasPlugin` fail-closed · Support soft empty |
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
