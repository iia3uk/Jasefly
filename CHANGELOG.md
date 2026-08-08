# Changelog

## 2026-08-08 — Admin package runtime fixes + CI catalog identity

- FE: `setPluginEnabled` no longer marks plugin map hydrated (stops fail-open 404s for comments/notifications/overload)
- FE: HostSlot + DashboardShell stable `useSyncExternalStore` snapshots (React #185)
- FE: Platform `ui` exposes `useRef`/`useMemo` for ZIP frontends
- BE: `Response::json` never empty body on encode failure; catalog rows sanitized
- Tests: package boundary asserts catalog identity (ZIPs not in Core git)
- MCP: exact `jasefly-module-{slug}-{semver}.zip` match for `cms_module_release`

## 2026-08-08 — Fix admin dashboard React #185 (unstable package cards snapshot)

- DashboardShell: cache getPackageDashboardCards snapshot for useSyncExternalStore
- Stops maximum update depth loop when opening admin home with ZIP dashboard cards

## 2026-08-08 — Fix HostSlot infinite re-render (React #185)

- Cache HostSlot useSyncExternalStore snapshots until registry mutates
- Prevents maximum update depth when analytics/support register site.body.end slots
- Add unit test for stable snapshot identity

## 2026-08-08 — Fix package UI hooks: expose useRef and useMemo to ZIP frontends

- PlatformFrontendContext.ui now includes useRef and useMemo
- Fixes analytics Beacon crash (useRef is not a function) and React #185 loop on public site
- CMS_MAP symptom for ZIP FE hooks

## 2026-08-08 — Deploy new package architecture core to jasefly.com

- Core: domain modules extracted to installable packages (Platform SDK + Package Host)
- Remove bundled blog/forms/support/analytics/etc. implementations from Core
- LLM handoff + catalog point to Jasefly-Modules
- Frontend hostSlots consent gate fix for SiteLayout
- Site content/settings preserved; domain features restored via ZIP install after deploy


## 2026-08-08 — Fix behavior parity after plugins default-off

- Parity seed UPSERTs full baseline plugin set ON + platform singletons before PHP DB copy
- Automation/Newsletter/Notifications honour DB enablement (drop hard enabled=false)
- Sync migrations 029/030 into contracts; Node activity/plugins/MCP status parity
- Skip login rate-limit under BEHAVIOR_PARITY/test; scrub translate corpus size drift

## 2026-08-08 — VPS contour: Telegram approve + MCP dual-secret (Node)

- Node `DeployTelegramApprove`: request → Telegram Approve → redeem → MCP SSH (Approve ≠ apply)
- Routes: `/telegram/deploy-webhook`, `/admin/deploy/telegram/request|redeem`, pending approve/reject
- Node MCP dual-secret (`mcpRequestAuth`) + CORS `X-Jasefly-*`
- mcp-cms: `telegramGate.js`; `cms_deploy_update` / `cms_release` branch for `node-vps` (vps build + gate)
- Tests: `deployTelegramApprove.test.ts`, `mcpRequestAuth.test.ts`

## 2026-08-07 — Smoke: Telegram deploy approve gate

- Docblock note on DeployTelegramApprove for pending→Approve smoke test

## 2026-08-07 — Smoke: Telegram deploy approve gate

- Docblock note on DeployTelegramApprove for pending→Approve smoke test

## 2026-08-07 — Telegram deploy approve (opt-in human gate)

- TELEGRAM_DEPLOY_APPROVE: pending ZIP + Telegram Approve/Reject before apply
- Webhook secret_token + chat allowlist; secrets only in host .env
- Admin escape hatch on Updates; mcp-cms pending_approval handling
- SiteUpdater.applyStagedZip; tests DeployTelegramApproveTest

## 2026-08-07 — MCP dual-secret defense (Bearer + HMAC)

- McpRequestAuth: Bearer + HMAC proof-of-possession, skew, anti-replay nonces, optional IP allowlist
- Auth modes legacy/prefer/require; empty signing secret stays legacy (safe deploy)
- Migration 030_mcp_nonces + mcp-cms client signing headers
- Admin MCP status: signing_configured/auth_mode without secret fragments
- Tests: require/replay/skew/JWT unaffected

## 2026-08-07 — Residual pentest: ban SVG uploads + global Origin CSRF for all admin modules

- SVG uploads hard-rejected (422 Unsupported) for editor and admin; legacy SVG stream = attachment+CSP
- OriginCheckMiddleware mounted globally in public/index.php so Content/Media/pages are covered
- MCP Bearer (mcp_api_token) exempt from Origin check even before Auth sets user
- Strip X-Powered-By in API SecurityHeaders + root .htaccess
- Tests: PentestHardeningTest + SecurityVerificationTest updated

## 2026-08-07 — Fix: module-manager always-on (runtime-assets 404 after default-off)

- PluginStateService CORE includes module-manager (cannot disable)
- Migration 029 forces module-manager is_enabled=1
- Prevent toggle-off for module-manager in SystemModule
- Hot-fix already re-enabled module-manager + blog on prod

## 2026-08-07 — Pentest hardening: activity ACL, SVG, login throttle, CSRF Origin, MCP token_hint

- Activity ACL: require activity.view; MCP feed only for mcp.manage/system.manage
- SVG upload: stronger sanitize/reject + CSP on stream
- Login/demo rate limit: 5/900s fail-closed with file fallback
- Remove MCP token_hint from system status (PHP + Node + UI)
- CSRF defense: Origin/Referer allowlist on mutating admin API
- Gate admin-only module assets (ai-content-optimizer, indexnow) via module-asset.php
- Staff 2FA recommend: totp_recommended + admin banner
- Tests: PentestHardeningTest + docs/security.md residual notes


## 2026-08-06 — Platform OOB home + plugins default-off

- Default home is Jasefly platform landing without Portfolio stub
- Optional plugins seed/runtime default off (no 409 spam); FE/Node/PHP gate parity
- Node ensure-admin + platform seed defaults; Support soft-empty when disabled


## 2026-08-05 — Security ACL/XSS/SSRF/Host/MCP + auth AdminBar session fix

- Content/webhook/revision capability gates
- deny_template_html sanitizeHtml
- Node webhook SSRF + PublicOrigin URLs
- cms_rollback stamp validation
- Clear AdminBar on dead /auth/me session (silent refresh then logout)

## 2026-08-05 — Fix stale AdminBar after expired /auth/me session

- On /auth/me 401 try silent refresh then clear tokens
- Do not keep AdminBar via stale localStorage role
- On public site clear chrome without forced login redirect; admin routes still redirect to login

## 2026-08-05 — Security fixes: ACL, XSS, SSRF, Host URLs, MCP rollback

- Content CRUD and revision restore require content capabilities
- Webhook mutations require integrations.manage
- Sanitize deny_template_html via sanitizeHtml
- Node webhook SSRF guard with DNS pin and redirect revalidation
- Payment/verification URLs prefer configured app_url (PublicOrigin)
- cms_rollback release stamp strict validation
- Parity scrub db_version for dual 879/879

## 2026-08-05 — Не дергать /translate/* когда плагин выключен

- TranslateWidget fail-closed до гидрации enabled_plugins и без site.translate
- TranslateAutoWarmup не стартует auto-warmup без включённого translate
- Убраны ложные POST /translate/batch → 404 при disabled plugin

## 2026-08-05 — Jasefly 1.0 core freeze + runtime-node typecheck fix

- Freeze core 1.0 package on official site
- runtime-node type contracts aligned for CI
- TranslateSettings.auto_warmup + capabilities parity gate
- Production hardening from 1.0 freeze

## 2026-08-05 — Jasefly 1.0 core freeze + runtime-node typecheck fix

- Freeze core 1.0 (release commit on main)
- runtime-node: MePayload capabilities/is_super, cart totals/currency typing
- TranslateSettings.auto_warmup + capabilities parity gate for CI
- Production hardening from 1.0 freeze package


## 2026-08-04 — process-diagram: убраны лишняя петля и шарик

- Удалена пунктирная feedback-полоска под схемой «Как я работаю»
- Убран бегущий accent-шарик (animateMotion)
- Оставлены только прямые связи вход → ядро → контур; цикл по-прежнему обозначен бейджем ↺ у «Развитие»

## 2026-08-04 — About hero: текст и фото по верхнему краю

- ProfileHeroView: items-end → items-start
- текстовая колонка lg:pt-6 (~24px)
- блок «Обо мне» отделён отрядкой ниже hero

## 2026-08-04 — Showcase cover: absolute fill без letterbox CSS

- ResponsiveProjectCover: img absolute inset-0 object-cover — контейнер заполняется bitmap'ом

## 2026-08-04 — Фиксация геометрии showcase lead-with-stack

- Lead media desktop aspect 2/3 задаёт высоту колонок
- Secondary: grid rows 1fr/1fr, фиксированный текстовый блок 6.75rem
- secondary media slot ≈1:1; константы в showcaseGeometry.ts

## 2026-08-04 — Адаптивные обложки проектов portrait/landscape

- Миграция 027: cover_portrait_media_id, cover_landscape_media_id
- ResponsiveProjectCover + <picture> для lead-with-stack
- Админка: выбор portrait/landscape обложек
- Jasefly: portrait asset jase-vert.jpg

## 2026-08-04 — Что я создаю: статичный позиционирующий блок

- features-grid: карточки без ссылок по умолчанию, поле markers
- усилены отступы/заголовки; hover без сдвига и без cursor:pointer
- главная: новый подзаголовок и тексты направлений

## 2026-08-04 — Реестр миграции 026 featured_priority

- 026_project_featured_priority.sql добавлена в MigrationService::FILES
- Showcase: object-top + prefers-reduced-motion на изображениях

## 2026-08-04 — Миграция featured_priority + layout lead-with-stack

- Упрощена 026_project_featured_priority.sql (только ADD COLUMN)
- Главная: projects-grid layout lead-with-stack, primary_slug jasefly

## 2026-08-04 — Избранные проекты: lead-with-stack showcase

- projects-grid.layout lead-with-stack (lead + 2 secondary)
- поле featured_priority у проектов
- данные showcase только из каталога
- mobile: вертикальный стек основной → вторичные


## 2026-08-04 — Главная: process-diagram и выравнивание сетки

- Убрана секция Экосистема
- features-grid.last_row_alignment center
- Новый универсальный process-diagram
- Контраст: spectrum services, quote отзывы, large KPI, CTA panel
- Избранные проекты — крупные карточки


## 2026-08-04 — Hero на весь экран как раньше

- portfolio hero: cms-hero-bleed + 100dvh
- секция с hero без padding и Container
- контент под overlay header через cms-hero-inner


## 2026-08-04 — Избранные проекты: lead-with-stack showcase

- `projects-grid.layout`: `grid` | `lead-with-stack` (60/40 lead + stack).
- Поле `featured_priority` у проектов; lead = max priority (или `primary_slug`).
- Данные только из каталога; короткая мысль через `projectOneLine`.

## 2026-08-04 — Главная: process-diagram + last_row_alignment

- Убрана секция «Экосистема»; порядок: направления → featured → process → KPI → spectrum.
- `features-grid.last_row_alignment` (start|center|end).
- Новый универсальный `process-diagram` (system flow, не timeline).
- Контраст секций: spectrum services, quote testimonials, large stats, CTA panel.

## 2026-08-04 — Hero на весь экран (portfolio hero)

- Виджет `hero`: `cms-hero-bleed` + viewport min-height, как `hero-block`.
- LayoutRenderer: секция с `hero` без padding/Container — edge-to-edge.

## 2026-08-04 — Главная iia3uk: продуктовый лендинг без дублей

- Новые универсальные виджеты stats-strip и relation-flow
- hero.show_stats и projects-grid.compact из данных проектов
- Layout главной: направления / экосистема / featured / процесс / KPI / спектр задач
- Убраны profile-card, skills, experience с главной
- Seed buildDefaultHomeLayout под лендинг

## 2026-08-04 — Главная iia3uk: продуктовый лендинг

- Home layout: направления / экосистема / compact featured / процесс / KPI / спектр задач — без дубля About/Skills/Experience.
- Универсальные виджеты: `stats-strip`, `relation-flow`; `hero.show_stats`, `projects-grid.compact`.

## 2026-08-04 — Живые KPI статистики из проектов

- StatsStrip считает total / completed / in_progress из /projects
- Игровые движки — уникальные Unity/Unreal/Godot/Source 2
- Исключён cancelled; fallback на CMS statistics если проектов нет
- Подключено на /about и profile-card на главной

## 2026-08-04 — About R&D: авто-сетка и стек из проектов

- journey-timeline: autofill_from_projects — карточки и теги из /projects
- Исключается project_status=cancelled (Джарвис и т.п.)
- Стек агрегируется из project_technologies без дублей
- Ссылки на /projects/{slug}

## 2026-08-04 — About: опыт = journey-timeline, образование компактно

- Опыт на /about через JourneyTimelineView (4 направления, featured, milestones, grid)
- Образование — компактный timeline из 3 пунктов
- Убрана CMS-разметка опыта и блок «Самостоятельное развитие»
- journey-timeline: milestones + details_layout=grid

## 2026-08-04 — About: journey-timeline + правки опыта

- Виджет journey-timeline и profile-hero в билдере
- Секция «Образование и путь» — полноценный таймлайн на /about
- Опыт: роль без «ведущий разработчик», ~15 ОВЕН СПК110, без проектирования схем
- Скрыт устаревший Continuous learning в education


## 2026-08-03 — Fix two-column layout: map beside contacts

- Section columns use CSS grid so gap no longer stacks 50/50 rows
- Contact template: map left, details right, green accent bar
- Spacer widget respects styles (accent bar)

## 2026-08-03 — Contact template: ASCII-safe copy for MySQL collation

- Remove 4-byte emoji from default contact layout HTML
- Keep map + details two-column template for builder seed

## 2026-08-03 — Contact builder template: map + details columns

- Default contact layout: Yandex map left, company/phone/address/hours/email right
- Builder «Загрузить шаблон по умолчанию» for /contact
- Live /contact and content pack updated


## 2026-08-03 — Contact builder template: map + details

- Default contact layout: Yandex map left, company/phone/address/hours/email right
- Builder «Загрузить шаблон по умолчанию» on /contact; content pack + live page

## 2026-08-03 — Allow Yandex Maps iframes in Content-Security-Policy

- Add frame-src for yandex.ru (and related map hosts) in public .htaccess / hosting CSP
- Unblocks maps.map Yandex widget on /contact

## 2026-08-03 — Maps module support: contact map_lat/map_lng + CMS_MAP docs

- Admin contact-info exposes map_lat/map_lng for interactive maps
- CMS_MAP and docs/modules/maps.md for Maps ZIP package
- Contact layout pack includes maps.map widget placeholder


## 2026-08-02 — Demo: Builder и Admin — разные входы

- /demo?to=builder → page builder; /demo?to=admin → dashboard
- explore-doors: разные CTA/href; legacy /demo разводится по title карточки
- DEFAULT_EXPLORE обновлён

## 2026-08-02 — Переводчик: мгновенный кэш + без Libre-мусора

- FE session/memory cache — paint до API, без flash оригинала
- При cache_ready не делаем live fill_misses (не тормозит и не портит)
- Google больше не падает в публичный LibreTranslate (засорял кэш)
- Повторный выбор языка на вкладке — без ожидания сети, если map уже есть

## 2026-08-02 — Фикс прогрева переводчика: не крутить source→source

- allowedTargets исключает source_lang — иначе en→en давал translated=0 и FE писал «Нет прогресса»
- runWarmupChunk пропускает same-lang цели
- Лог прогрева понятнее при простое

## 2026-08-02 — Логотип сайдбара реально на всю ширину

- Убран max-h у BrandLogo в меню — логотип тянется на 100% ширины колонки

## 2026-08-02 — Фикс: оставлена сетка меню, убран классический список

- Единственное меню — AdminNavNerve (сетка разделов)
- Убрана кнопка и классический список-вариант
- Логотип на всю ширину сайдбара → панель управления

## 2026-08-02 — Одно меню админки: полный логотип, без сетки

- Убрана кнопка и хоткей переключения в «вариант 2» (AdminNavNerve/сетка)
- Оставлен только классический список в сайдбаре
- Логотип на всю ширину сайдбара со ссылкой на панель управления

## 2026-08-02 — Единая админка: логотип на дашборд, без RU/EN

- В сайдбаре один BrandLogo со ссылкой на панель управления (без Demo Explorer / роли)
- Убран переключатель RU/EN из футера сайдбара
- Убрана вторая полоска DEMO_NOTICE — остаётся только sandbox-баннер

## 2026-08-02 — Demo: systemic fix for admin page crashes (wrong API shapes)

- Smart preview payloads: lists=[], status/stats objects, detail shells not []
- Dedicated translate/scheduler/notifications/support/contact-messages stubs
- FE list() + CrudList coerce arrays; PackageErrorBoundary on blueprint CRUD
- TranslatePage guards cache/targets; dashboard/analytics shapes aligned

## 2026-08-02 — Demo: fix Trash page .map crash

- admin/trash returns empty object Record not settings blob
- TrashPage only maps array resource buckets

## 2026-08-02 — Demo: align DDoS status stub with FE type

- syntheticDdosStatus matches protection_enabled / providers / active_count

## 2026-08-02 — Demo: fix Overload page crash on stats.total

- Gateway returns full /admin/overload/status shape with stats/events
- OverloadPage guards missing stats; ddos status stub too

## 2026-08-02 — Demo: fix activity .map crash and updates 403

- admin/activity returns synthetic list (not dashboard object)
- admin/updates GET returns status stub; POST/ZIP still denied
- ActivityPage guards Array.isArray

## 2026-08-02 — Demo: remove ZIP/file pickers on updates/modules/media

- Updates page in demo has no file input at all
- Modules ZIP upload tab locked; media upload button removed in demo
- Hard-deny admin/updates and modules/upload in DemoRoutePolicy

## 2026-08-02 — Demo admin: real plugin descriptions + empty read-only settings

- Demo plugins catalog from ModuleRegistry (labels, descriptions, categories, settings_schema)
- Settings values empty/defaults; toggles and saves disabled in demo UI
- Singleton/theme settings show empty shells with DEMO notice, no save

## 2026-08-02 — Demo sandbox: fix 404/403 noise and analytics crash

- Router runs DemoGuard on unmatched admin routes (disabled plugins)
- migrations GET → healthy preview; write still denied
- Synthetic analytics overview with page_views; comments/support empty lists
- FE: skip nav-attention + MigrationBanner in demo; harden DashboardAnalyticsWidget
- Fix support attention URL to /admin/support/tickets

## 2026-08-02 — Full Demo Sandbox admin UI (isolated API)

- Demo FE: can() opens full nav; hydrateDemoPlugins; SiteContext does not shrink to prod plugins
- demoNav default preview (not hidden) for all sections
- DemoRoutePolicy: GET preview for almost all admin; hard deny MCP/migrations/content-pack; writes still fail-closed
- DemoSandboxGateway: plugins, module-operations, catch-all synthetic GET payloads

## 2026-08-02 — Fix Demo Sandbox empty sidebar (path segment bug)

- demoModeForPath strips /admin base so pages/media/blog stay interactive
- Sidebar full-bleed under demo banner; shell max-w-none

## 2026-08-02 — Demo UX: allow page-templates, silence expected 403 debugger

- GET /admin/page-templates returns empty demo list instead of 403
- page-templates/ensure is a sandbox no-op
- ApiErrorDebugger ignores expected demo_restricted in demo mode
- Hide «Создать шаблоны» in demo; support POST new demo pages

## 2026-08-02 — Fix Demo start: do not redact access_token JWT

- DemoResponseSanitizer no longer masks access_token on /auth/demo/start
- Restore usable demo JWT for Admin/Builder sandbox

## 2026-08-02 — Apply 025_demo_sandbox migration for Demo Sandbox tables

- Register 025_demo_sandbox.sql in MigrationService::FILES
- Create demo_sessions, demo_overlays, demo_audit_log on hosting
- Unblock Open Admin Demo (/demo) against live sandbox

## 2026-08-02 — Demo Sandbox: isolated Admin/Builder with fail-closed API

- Demo module: DemoContext, session overlay, DemoGuardMiddleware fail-closed
- POST /auth/demo/start|reset|end — short-lived demo JWT, no production refresh
- Sandbox gateway for pages/builder/media/blog; production CRUD unreachable
- SecretRedactor DEMO_KEYS + DemoResponseSanitizer
- FE /demo entry, DEMO SANDBOX banner, nav modes, DemoRestrictedPage
- Security tests in DemoSandboxTest; home Open Admin Demo → /demo

## 2026-08-02 — Home: open live surfaces instead of UI screenshots

- New explore-doors widget: live links to Admin, Docs, SDK, Architecture, GitHub, Production; Builder marked coming soon
- Removed decorative Builder/admin PNG gallery from home
- features-grid supports href + Open live → CTAs
- Philosophy copy: where a surface exists, open it

## 2026-08-02 — Mature framework site: living hero, pulse, journey, GitHub-first

- Living hero atmosphere (grid/glow/chip breathe) + scroll fade-up sections
- New widgets: dev-journey, repo-tree, status-timeline, github-pulse
- Build-time sitePulse metrics/commits via generate-site-pulse.mjs
- Home: philosophy, designed-for / not-for, production gallery, everything-together
- Footer: repository/docs columns + framework version badge; Open GitHub primary CTA

## 2026-08-02 — Home landing: product story, DX tabs, arch hover

- Emotional origin block + Independent by design personality section
- WordPress vs Jasefly compare; shorter mature copy throughout home
- architecture-stack hover lights next hop; features-grid accent tones
- code-tabs widget (PHP / TypeScript / HTTP / CLI) with real SDK APIs
- Status metrics from repo: 22 services, 56 widgets, 29 modules, 9 packages

## 2026-08-02 — Home landing as platform story, not feature docs

- Restructure __home: philosophy hero, Why story, How different, Built in production, request-path architecture, outcome capabilities, expanded DX, Exploring roadmap, Open Source CTA
- cta-block supports up to 5 action buttons
- architecture-stack default layers include Browser → Shared Hosting

## 2026-08-02 — Framework-first public site: architecture widgets + EN positioning

- Add architecture-stack, code-snippet, status-roadmap builder widgets
- Extend hero-block with optional cta3/cta4 for GitHub and Live Demo
- Rebuild home and marketing pages as AI-first Modular PHP Framework (EN)
- Nav/footer/singletons: Framework labels; Live Demo and Portfolio → iia3uk.ru
- Built with Jasefly showcase uses iia3uk.ru screenshot (media #14)


## 2026-08-02 — Обновление логотипов, favicon и OG-изображения

- Синхронизированы SVG/PNG логотипы и favicon в frontend/public/brand
- На сайте: новый OG (media #12) и logo (media #13)

## 2026-08-02 — Admin nav: module icons + attention loot badges

- Expanded navIconRegistry (sparkles/cookie/radar/forms/AI/etc.) so ZIP modules get real icons
- Forms/Blog/Plugins/Modules get distinct icons
- Gold circular badges on menu tiles/hubs for unread messages, new form submissions, pending comments, support waiting, notifications, trash

## 2026-08-02 — Blog posts emit og:image from OG cover (fallback to post cover)

- Public BlogPostPage SeoHead now sets og:image from og_image_id, else cover

## 2026-08-02 — Blog studio: Meta cover is OG image, not post cover

- Meta panel cover now edits og_image_id (Open Graph / social share)
- Canvas cover stays cover_media_id (on-page hero)
- Clarify labels/hints so the two are not confused

## 2026-08-02 — Blog studio: wider writing canvas

- Raise post editor max-width (~48rem → ~84rem) so side gutters are smaller

## 2026-08-02 — Blog writing studio: modern TipTap post editor

- New Ghost/Medium-style BlogEditPage with title/cover canvas and meta drawer
- BlogComposer: sticky toolbar, selection bubble, slash menu, media library images, focus-safe TipTap
- Write/Preview toggle keeps editor mounted so caret is not lost
- HTML content model unchanged; CMS_MAP + i18n updated

## 2026-08-02 — Admin nav variant: lattice tiles (same hubs)

- Same consolidations (Система/Сайт/Контент/…)
- Icon-only hub dock on top; items as 2-column tiles to cut vertical scroll
- Aside: only the deck scrolls, footer stays pinned

## 2026-08-02 — Admin nav variant: horizon hubs (same consolidations)

- Keep folded hubs (Система/Сайт/Контент/…)
- Replace left icon rail with horizontal hub strip + full-width item deck
- Long hubs get soft clusters (Управление/Состояние/…) — presentation only

## 2026-08-02 — Admin nav: fold items into hub tabs (not per-module)

- Group sidebar by item.group instead of module label — ZIP modules no longer each get a rail icon
- Fold DDoS/Mail/Blog/Projects/etc. into Система/Сайт/Контент/… hubs
- Slug leftovers go under Модули; stable group order + icons

## 2026-08-02 — Admin nav: station rail (icons) + open deck

- Replaced wrapping group chips with thin vertical icon rail
- Open group shows as a colored deck with readable labels
- Items get the width; groups no longer eat the sidebar height

## 2026-08-02 — Admin: no scroll jump on hub tabs + compact group chips

- Sidebar: tall spines replaced with wrapping group chips + short shelf (less scroll)
- ScrollToTop skips jump when switching tabs inside the same admin hub
- Hub tabs sticky under header and wrap instead of endless horizontal scroll
- Active hub tab scrolls into view with nearest block

## 2026-08-02 — Admin nav: bookshelf spines (not grid/fan)

- Новая модель: корешки групп слева (вертикальный текст) + одна открытая полка справа
- В полке — обычный читаемый список иконка+название, без веера и сетки
- Активная группа открывается сама; ПКМ — закрепить
- Классический список по `[`

## 2026-08-02 — Admin nav: readable tile launcher (kill nerve fan)

- Убран нерв/монограммы/веер — было неюзабельно
- Компакт: сетка плиток иконка + читаемая подпись
- Группы с нормальными названиями; pin по hover/ПКМ
- Список по `[` как запасной режим

## 2026-08-02 — Admin nav: nerve rail + bloom fan

- Вместо сетки/списка — тонкий «нерв»: группы как позвонки с монограммой и цветом
- Hover/клик → bloom-веер разделов справа (дуга, не менюшка)
- Активная группа светится; ПКМ в веере — закрепить
- Список с названиями остаётся по `[` / кнопке

## 2026-08-02 — Admin nav: icon mosaic sidebar

- Компактное меню админки — сетка квадратных иконок 2×N вместо длинного списка
- Flyout при наведении: название + группа; ПКМ — закрепить
- Переключение мозаика ↔ список (кнопка / клавиша [); default = мозаика
- AdminNavMosaic + CSS accent для aside

## 2026-08-01 — Fix migration 024: role_rank + retry on deploy

- 024: колонка rank→role_rank (MySQL reserved word ломал ALTER)
- SiteUpdater: retry() при деплое — снимает blocked после failed migration
- AclEffectiveResolver/PermissionService: ORDER BY role_rank

## 2026-08-01 — Fix: register migration 024 Admin Access Layer

- MigrationService FILES: добавить 024_admin_access_layer.sql (иначе ZIP есть, а на проде не применяется)
- Повторный деплой ACL: user_roles, overrides, WP-роли, capabilities seed

## 2026-08-01 — Admin Access Layer: capability-based ACL

- Миграция 024: user_roles, overrides, risk/scope meta, WP-роли, aliases, audit, backfill
- Platform ACL: AclCapabilityCatalog, EffectiveResolver, cache, CapabilityAccessProvider, AdminNavRegistry
- AccessService API: canCapability, batchCan, explain, registerCapability/AdminNavItem
- PermissionService + Middleware → path→capability; Auth /me отдаёт capabilities/roles/is_super
- API /admin/access/bootstrap|roles|overrides|effective с anti-escalation и last-super-admin
- FE: AuthContext.can из live caps, guards/nav без role===admin, Users & Access UI
- demo-kit: registerCapability + registerAdminNavItem; docs platform-sdk + CMS_MAP; AclAccessTest
- Fix: unused STAFF_ROLES import in AppRouter (tsc)

## 2026-08-01 — Fix: виджет «Доступ» снова в палитре билдера

- access-container category structure→basic (structure не показывался в PALETTE_ORDER)
- access в KNOWN_PLUGINS; keywords для поиска дос/acc
- Плагин Access не требует других плагинов — только system

## 2026-08-01 — Access Control: описания, справка в плагине, виджет «Доступ» в палитре

- Описание и long_description плагина Access (RU/EN) + категория Безопасность
- Настройки-справка: как пользоваться, провайдеры, fail-closed
- Виджет в палитре: «Доступ», keywords (access/paywall/подписка), plugin=access
- Поиск палитры учитывает keywords

## 2026-08-01 — Universal Access Control: Platform AccessService + Access Container

- Platform AccessService / providers / rule DSL (all|any|not), fail-closed
- HTTP GET /access/providers + POST /access/can; server-side filterLayout on public pages
- Core providers auth + role; purchase registered on boot
- Builder widget access-container + AccessRuleEditor + deny modes
- ZIP scaffolds: user-groups, subscriptions, wallet as Access Providers
- CMS_MAP + platform-sdk Access Providers section + contract snapshots + AccessServiceTest


## 2026-07-31 — ZIP FE reload: cache-bust + unload on module update

- packageModuleLoader: re-import when version changes, ?v= on entry URL
- ModulesPage: unloadPackageModule before reload after install/update
- Fixes Character 1.2 admin UI stuck on old 1.0 screen

## 2026-07-31 — Jasefly Spirit Event API — дух CMS как индикатор платформы

- Core emitSpirit / window.jaseflySpirit (jasefly-spirit)
- JaseflySpiritBridge: publish/save + API 5xx → spirit events
- ModulesPage: install/update/error → MODULE_* events
- Character ZIP 1.1.0 уже на хостинге: маппинг событий, cooldown, idle Sleep
- CMS_MAP: контур духа CMS

## 2026-07-31 — Карантин ZIP: универсальные критерии защиты (SDK, deps, timeout, memory, routes, migrations)

- ModuleQuarantinePolicy + ModuleQuarantineReason (exception/timeout/memory/route/deps/sdk/migration)
- Preload: SDK/api_version/deps; budget: 5s + memory delta/headroom
- Router: duplicate METHOD+path → RouteConflictException → quarantine
- Install/update: migration fail → quarantine migration_failed
- Admin: quarantine.reason; config module_quarantine; tests Policy + Router conflict

## 2026-07-31 — Изоляция сломанных ZIP-модулей: quarantine без падения API

- ModuleQuarantine + расширенный ModuleSafeMode (class/file/stage/at)
- InstalledModuleLoader: preflight settings() + quarantine при load
- ModuleRegistry: изоляция boot/registerRoutes/globalMiddleware/settings/adminNav
- Bootstrap autoload PackageModules в try/catch
- index.php: error handler бросает ErrorException (не exit)
- disable/update/uninstall работают для quarantined; update сбрасывает failed→enabled
- Админка Modules: is_quarantined + recovery_actions
- Регрессия ModuleQuarantineIsolationTest.php
- CMS_MAP: строка quarantine

## 2026-07-31 — Jasefly Character: события установки ZIP для маскота

- ModulesPage: CustomEvent jasefly-character на install/update (progress/success/error)
- CMS_MAP: строка про ZIP jasefly-character

## 2026-07-31 — Cookie Consent ZIP + core gate for GDPR/152-FZ categories

- ZIP modules-src/cookie-consent: categories modal, presets, consent log, CSV/Excel export, floating widget, jaseflyCookieGate
- Core cookieConsent helpers allowsAnalytics + hide CookieBanner when ZIP enabled
- Platform ui.createRoot for package public portals

## 2026-07-31 — Fix overlay nav: content no longer under transparent header on inner pages

- #cms-snap-scroller display:contents ignored padding-top — breadcrumbs/content sat under fixed overlay nav
- Add .cms-nav-overlay-offset spacer in SiteLayout; hide when .cms-hero-bleed (home)
- CMS_MAP symptom row for overlay/breadcrumbs overlap


## 2026-07-30 — Admin EN for plugins/modules + English plugin catalog

- FE i18n keys + Plugins/Modules/Overload pages wired to t()
- Sidebar nav groups translated via translateNavGroup
- BE PluginCatalogMetaEn + Accept-Language on /admin/plugins
- api.ts sends Accept-Language from admin.locale

## 2026-07-30 — Overload: per-CPU thresholds, sustained check, quiet after MCP update

- OverloadService: normalize_by_cpu (default), require_sustained 1m+5m, quiet_until after SiteUpdater
- Skip evaluate on /system/update; mark quiet on ZIP apply start/end
- OverloadPage/Widget: show CPUs, load/core, absolute threshold, shared-host hint
- Defaults threshold 2.5/core; stop false trips from host-wide load ~20 during MCP patches

## 2026-07-30 — Plugins about/settings expand + notifications 401 gate

- PluginsPage: fix about/settings panels clipped by overflow-hidden + h-full; tighter cards; items-start grid
- AdminPageHero: hint on full width so text is not cut by stats
- NotificationsBell/Widget: wait for token + plugins hydrate; silent unread-count; quiet 404/403

## 2026-07-30 — Media unused cleanup + overload protection plugin

- Медиатека: справка, режим «Неиспользуемые», сканер HTML/комментариев и битых файлов
- Встроенный плагин overload: load average, режимы log/notify/503, email, журнал, виджет дашборда
- Ранний 503 на публичном HTML (rootIndexPhp) при перегрузке
- CMS_MAP: медиа unused + overload


## 2026-07-30 — Авто-перезагрузка при битых assets после деплоя

- Inline-скрипт в shell: ошибка загрузки /assets/* → один hard-reload с обходом кэша HTML
- То же для failed dynamic import / vite:preloadError
- После успешного старта флаг сбрасывается, ?_= убирается из URL — посетителю не нужен Ctrl+F5

## 2026-07-30 — Фикс stale assets: 404 вместо SPA HTML

- Отсутствующие /assets/* и *.js/*.css больше не отдают index.php (MIME text/html)
- Кэш HTML shell сокращён до 60s — меньше залипания старых хешей после деплоя
- После деплоя: жёсткое обновление Ctrl+Shift+R / Ctrl+F5

## 2026-07-30 — Фикс: сетка иконок больше не под SaveBar

- IconPicker открывается через portal над sticky-баром сохранения
- Панель иконок позиционируется fixed и не клипается GlassPanel
- SaveBar — отдельная полоса у низа без наезда на дропдаун

## 2026-07-30 — Соцсети вынесены из Portfolio в ядро CMS

- Админ «Соцсети» — модуль site / hub Оформление (рядом с Подвалом)
- BE: resource/blueprint из PortfolioModule → ContentModule
- Публичный /site.social больше не зависит от плагина Portfolio
- В настройках Подвала — ссылка на управление соцсетями

## 2026-07-30 — Оверлей «Сохранено» по всей админке

- После успешного сохранения (PUT/POST /admin) — центрированный оверлей с галочкой
- Отдельные тексты для порядка и публикации
- Работает в обычных экранах и в Page Builder
- Без шума на destructive/silent запросы

## 2026-07-30 — Навигация: редактор выезжает снизу

- Панель правки пункта — bottom sheet вместо третьей колонки
- Шапка и подвал остаются на всю ширину
- Закрытие по Escape / клику по фону / Отмена

## 2026-07-30 — Билдер навигации: шапка/подвал с превью и DnD

- Админ «Навигация» — полноценный билдер вместо плоского CRUD-списка
- Две зоны (шапка / подвал), живое превью chrome сайта
- Drag-and-drop порядок без отдельного режима, панель правки пункта
- location header/footer/both, видимость, дублирование и удаление на месте

## 2026-07-30 — Appearance Homepage tab redirects to Page Builder

- /admin/homepage opens home page builder (pages.layout_json)
- No more empty homepage_sections list — that table is not where live home lives

## 2026-07-30 — Homepage sections empty-state: point to Page Builder

- Explain empty homepage_sections vs builder home layout
- CTA link to home page builder from /admin/homepage

## 2026-07-30 — Footer tagline/copyright allow safe HTML links

- Public footer renders tagline/copyright via sanitizeHtml
- Admin footer fields: textarea + HTML hint for links
- Updated live tagline with IIA3UK → iia3uk.ru link

## 2026-07-30 — Admin UI refresh: shared AdminPageHero

- AdminPageHero + AdminSectionLabel shared chrome kit
- AdminSplitLayout / UtilityPages Header use hero (CRUD, media, singletons)
- Standalone admin + module pages headers aligned; Plugins/Analytics/Dashboard too

## 2026-07-30 — Plugins cards: soft glow + spacing

- Remove muddy header band; soft corner glow by category
- More padding so glow/header does not crowd description text

## 2026-07-30 — Plugins page visual redesign

- Plugins: hero stats, search + category/status filters, 2-col card grid
- Compact dependency chips (+N), category accent gradients, cleaner toggle

## 2026-07-30 — Customizable admin dashboard widgets

- Dashboard: reorder/hide widgets (localStorage), customize drawer + drag handles
- Extracted existing sections into admin/dashboard/widgets registry
- New module widgets: support, forms, orders, scheduler, notifications, newsletter, blog-pulse (analytics-style)

## 2026-07-30 — Analytics redesign + dashboard pulse widget

- Analytics admin: area chart, sparklines, presets 7/30/90d, bar rows for events/pages
- Dashboard: «Пульс сайта» widget (14d chart, KPIs, top pages)
- Shared SVG charts in AnalyticsCharts (no chart lib)

## 2026-07-30 — Admin help panels collapsed by default

- Планировщик / Автоматизация / Уведомления: справка свёрнута по умолчанию

## 2026-07-30 — Notifications admin: help + test send

- Справка почему пусто и откуда приходят уведомления
- Кнопка «Отправить тест» (POST /admin/notifications/test)
- Пустое состояние со ссылками на Автоматизации/Формы/Плагины

## 2026-07-30 — Automation admin: help, event select, action presets

- Справка «Как это работает» на странице Автоматизация
- Выбор триггера из списка + статусы по-русски
- Пресеты действий: уведомление / форма→email / пауза
- Таблица actions и примеры условий

## 2026-07-30 — Scheduler admin: help how to use and enqueue jobs

- На странице Планировщик — блок «Как пользоваться»
- Откуда задачи, таблица handlers, пример JobQueue/SDK
- Уточнены подписи Handlers и заголовок страницы

## 2026-07-30 — Translate: auto language by visitor country

- TranslateGeo: CF/CDN/Accept-Language → suggested_lang, fallback en
- Настройка geo_auto_lang в плагине (вкл по умолчанию)
- TranslateWidget применяет suggested_lang если нет выбора в localStorage
- Batch разрешает нейтральный en

## 2026-07-30 — Translate: stop language flicker on switch

- Один full apply без серии restore RU↔EN
- Patch/MO без полного сброса в оригинал
- Cooldown + settledNorm против циклов retry
- Partial miss-fill только patch, max 3

## 2026-07-30 — Translate: full DOM capture + soft miss-fill

- TranslateWidget: data-translate-root, attrs, title, MutationObserver, normalize, fill_misses
- Chrome: breadcrumbs/cookie/rail/custom_html marked for translate
- POST /translate/batch fill_misses capped live MT (12)
- Corpus/Sync HTML-split aligned; singleton JSON walk; no slug in corpus

## 2026-07-30 — Mobile adaptive: hero overlay/safe-area, menu lock, FAB offsets

- Hero: без 100vw overflow, padding под overlay header, snap-секция без лишнего padding
- Мобильное меню: lock #cms-snap-scroller + safe-area
- Cookie/Translate/Support: safe-area + подъём над cookie-баннером
- CTA full-width на телефонах, Grid 1-col mobile, snap-rail выше FAB

## 2026-07-30 — Очистка накопившихся Vite assets на хостинге

- Повторный деплой: применить pruneStaleFrontendAssets на хостинге (прошлый прогон ещё был на старом SiteUpdater в opcache/памяти)

## 2026-07-30 — Деплой: автоочистка старых Vite assets на хостинге

- SiteUpdater после деплоя чистит assets/: оставляет только файлы из текущего ZIP
- Старые Vite-хеши (PublicPages-*.js и т.п.) удаляются автоматически
- В ответе деплоя: assets_pruned / assets_pruned_bytes
- Тест SiteUpdaterAssetsPruneTest

## 2026-07-30 — Миграция header_style navbar

- MigrationService: зарегистрирован 023_theme_header_style.sql
- theme_settings.header_style для сохранения шаблона navbar

## 2026-07-30 — Navbar: прозрачный до скролла — основной шаблон

- theme_settings.header_style: overlay (основной) | solid
- Navbar прозрачный до первого скролла, поверх full-screen hero; после скролла — плотный
- Админка «Шаблон сайта»: выбор стиля шапки
- Hero viewport учитывает overlay (--cms-hero-vh)

## 2026-07-30 — Hero-блок: основной шаблон — на весь экран

- hero-block: шаблон высоты «На весь экран» — основной дефолт (доступный viewport под шапкой)
- Пресеты: viewport / tall / compact / custom в инспекторе
- Header замеряет --cms-header-h / --cms-snap-vh для точной высоты
- Главная: height_preset=viewport

## 2026-07-30 — Синк фона Hero: админка ↔ билдер hero-block

- cmsSync: hero-block.media_id ↔ hero_settings.background_media_id (pull/push/heal)
- Admin Hero: при пустом фоне подтягивает media_id с главной; сохранение пишет обратно в layout
- resolveEditorSettings: seed media_id для hero-block из CMS
- На проде сразу выставлен background_media_id=10 из layout

## 2026-07-30 — Админка: хаб «Оформление» с вложенным меню

- Пункт меню переименован с «Hero-блок» на «Оформление» (hub.navLabel)
- В сайдбаре — шеврон и вложенные ссылки: Hero, Главная, Навигация, Подвал, Контакты
- Автораскрытие при активном хабе; resourceTitle больше не подменяет подпись хаба

## 2026-07-30 — Hero media cover-zoom fills entire content height

- Hero background always object-fit:cover — zooms any image/video to fill full content box
- Dedicated HeroBackgroundFill layer; media_object_position control

## 2026-07-30 — Fix hero preview: follow desktop/tablet/mobile frame

- Hero bleed uses container query (cqi) inside builder preview — respects tablet/mobile frame
- No more 100vw locking desktop width in device preview
- Section with background hero auto full-bleed (no Container) + zero pad

## 2026-07-30 — Hero-block background fills full section space

- hero-block background: full-bleed 100vw, no inset card chrome
- eats section paddingY via media_bleed_y; taller default min-height

## 2026-07-30 — Hero-block as background media card with nestable widgets

- hero-block: media_mode background as card with photo/video fill
- acceptsChildren — nest heading/text/button/etc inside hero card
- MediaBox plays mp4/webm as background video
- Tree/canvas drop into container widget; default media_mode=background

## 2026-07-30 — Builder reliability: save steps/items, hero media clear, dirty/hotkeys, CTA, CMS mirror banner

- flushInlineEdits merges step_* into items[]; step inspector
- Hero background clear without legacy fallback; media_id clear also clears media_url
- Bake-on-open without false dirty; undo vs save baseline
- Hotkeys: text selection native copy; Delete-only widget remove; notice on id=new
- Empty EditableButton in edit mode; cta1/cta2 PART_FIELD_GROUPS
- Banner when pushLayoutToCms fails after home save
- AdminController revision snapshot try/catch; steps-row body alias; local ci-sdk-check script

## 2026-07-28 — Fix public redirects and SEO rendering for visitor blockers

- /modules exact redirect to /cms-modules before DirectorySlash
- Home builder SEO title/description in SeoHead
- SeoHead site-name suffix deduplication
- Cookie banner analytics wording only when GA/GTM configured
- /api-docs prerender no longer blocked as /api path
- CMS map note for cms-modules public route

## 2026-07-28 — Документация CMS переписана по коду

- Каноническое дерево docs/ по реализации (bootstrap, modules, packages, FE, deploy)
- Старые MODULE-/platform-доки свёрнуты в stubs
- Корневые README/ARCHITECTURE/DEVELOPMENT указывают на docs/README

## 2026-07-28 — Лог активности и MCP-журнала по московскому времени

- Админка показывает DATETIME без Z как московское wall-time, а не UTC+локаль
- formatMoscowDateTime для Dashboard и Enterprise activity/MCP strip
- APP_TIMEZONE по умолчанию Europe/Moscow + SET time_zone для MySQL
- Тесты formatDateTime

## 2026-07-28 — Lab reference experiment + package SoT / soft API / SQLite migrate

- Restore Lab experiments/reference (gitignore /reference/ fix) for frontend CI build
- Package enable SoT: installed_modules mirrored to modules.is_enabled
- Soft plugin Projects API (409 plugin_disabled) + silent FE refresh
- SQLite migration transpile: rowid triggers, MODIFY skip, index prefix strip

## 2026-07-28 — Admin /projects always on ContentModule — no 404 when plugin off

- Move admin projects CRUD (+ publish/reorder) to ContentModule so GET /api/v1/admin/projects never 404s
- ProjectsModule keeps nav/blueprints/resources only
- CMS_MAP: symptom row for admin/projects 404

## 2026-07-28 — Stop admin/projects 404 debugger spam

- Silence adminList/adminGet 404 (no API debugger for disabled plugins)
- Alias portfolio↔projects so dashboard content-health does not hit /admin/projects when Portfolio/Projects is off
- Re-sync plugin states after toggle; invalidate content-health

## 2026-07-28 — Fix admin-login page 404 noise

- Create published admin-login system page (stops /pages/admin-login 404)
- PreferCmsLayout: silent 404 for missing pages
- admin-login/register seeds useOnSite so builder auth UI shows

## 2026-07-28 — Priority 1–7 harden + fix vitest tsc build

- Priority 1–7 platform hardening (tests, contracts, SSRF, integrity)
- Exclude *.test.ts from tsconfig.app so release build passes

Follow-up after fixing frontend tsc exclude for vitest files.

## 2026-07-26 — Fix admin API 404 spam when optional plugins are off

- Gate CrudList/Edit and dedicated admin screens with plugin enable checks
- Extend ADMIN_RESOURCE_PLUGINS (projects, blog, products, payments, orders, webhooks)
- Hide Dashboard/AdminBar/HubTabs/Ctrl+K entry points for disabled plugins
- SearchService skips projects/blog when plugins disabled
- Fix PackageErrorBoundary children + hooks order for release build


## 2026-07-25 — Platform SDK v1 stable + Forms certification

- Freeze SDK v1 as stable (`SdkVersion::STABILITY`); Compatibility Layer soft recommendation for v1
- `forms-sdk-reference` certification reference module + `PlatformPackageLifecycleTest`
- CLI `certify-lifecycle.php`; GitHub Actions `platform-sdk.yml`
- MCP: `cms_module_certify`, `cms_sdk_api_diff`, `cms_public_services`, `cms_sdk_deprecations`
- Docs: SDK-CERTIFICATION, PUBLIC-API-GOVERNANCE, API-SNAPSHOT, FORMS-REFERENCE-MODULE, MIGRATION-BUNDLED-FORMS
- `create-module.js` scaffold: PlatformRequestInterface, hooks, unregister, certify hints

## 2026-07-25 — Fix package admin screens without Component

- Platform FE registerPage/registerSettingsSection attach PlaceholderPage when Component/lazy/element missing
- registerModule upserts so package nav/screens stay in sync

## 2026-07-25 — Fix RR6: package public routes must be Route elements

- Replace PackagePublicRoutes wrapper with usePackagePublicRouteElements() so children of Routes are only <Route>

## 2026-07-25 — Register migration 021_platform_sdk in MigrationService

- Add 021_platform_sdk.sql to MigrationService::FILES so platform_capabilities tables apply on hosting

## 2026-07-25 — Platform SDK + Compatibility Layer

- App\Platform SDK: PlatformContext, adapters, capabilities, Compatibility Layer v1/v2
- Static analyzer + CompatibilityChecker + bin/sdk.php + build-module gate
- FE platform SDK, PackagePublicRoutes, unregister on module disable
- MCP cms_sdk_report / cms_capability_report / cms_module_compatibility / cms_export_sdk
- demo-kit on SDK v1; docs/platform/*; migration 021_platform_sdk.sql


## 2026-07-25 — feat(platform): Platform SDK + Compatibility Layer

- Public `App\Platform\*` SDK (PlatformContext, adapters, capabilities, SDK v1/v2)
- Static analyzer + CompatibilityChecker + CLI `backend/bin/sdk.php`
- FE `frontend/src/platform` + public route mounting; build-module SDK gate
- MCP: `cms_sdk_report`, `cms_capability_report`, `cms_module_compatibility`, `cms_export_sdk`
- Docs under `docs/platform/*`; demo-kit on SDK v1; migration `021_platform_sdk.sql`

## 2026-07-25 — feat(demo-kit): admin page shows live ping response

- Package module placeholder page calls GET /admin/{slug}/ping and renders JSON

## 2026-07-25 — fix(modules): load legacy demo-kit FE export via packageModuleLoader

- Accept static adminNav/adminScreens or register()
- Placeholder admin page when screen has no Component
- Map demo-kit.view in rolePermissions

## 2026-07-25 — fix(modules): health false positive when entrypoint class already loaded

- Health accepts App\PackageModules\{Slug}\* if class was loaded earlier via require_once

## 2026-07-25 — fix(modules): stop wiping package files after false health failure

- Do not delete/restore module files after successful copy
- Failed modules reinstall via install (not empty update snapshot)
- Entrypoint resolution tries backend/Foo.php and Foo.php
- Clearer missing-entrypoint health message

## 2026-07-25 — fix(modules): Health/Rollback UI feedback on Modules page

- Health shows status/issues/warnings panel after check
- Rollback disabled without snapshot; clear RU error after fresh install
- List API exposes rollback_available

## 2026-07-25 — fix(modules): Backend entrypoint missing after demo-kit install

- Health check and loader keep backend/ relative path
- Matches copyPackageFiles layout under api/modules/{slug}/backend/

## 2026-07-25 — fix(modules): Demo Kit install blocked by staging .htaccess checksum

- Do not write deny .htaccess into package extract root
- Ignore .htaccess in checksum unlisted-file scan
- Unit test for installer .htaccess ignore

## 2026-07-25 — feat: Module Package Manager — installable ZIP modules

- Package format + validator + signatures foundation
- installed_modules registry and install/update/rollback pipeline
- Admin /admin/modules + CLI modules.php + FE runtime loader
- MCP cms_module_* tools + demo-kit package builder
- SiteUpdater preserves api/modules and public modules assets

## 2026-07-25 — feat: Module Package Manager (installable ZIP modules)

- Package format module.json + checksums, validator, optional ed25519 signatures
- Tables installed_modules / module_operations / module_migrations / module_files
- ModulePackageService pipeline: upload → inspect → install/update/rollback/uninstall
- Runtime loader for prebuilt frontend assets (no Node on hosting)
- Admin `/admin/modules`, CLI `backend/bin/modules.php`, MCP `cms_module_*`
- Demo package source `modules-src/demo-kit/` + `scripts/build-module.js`

## 2026-07-24 — Fix: admin API was cached — contact messages mark-read looked frozen

- Exclude /api/* from HTML Cache-Control max-age=300 on index.php
- API responses: private no-store (htaccess + Response::json)
- ContactMessagesPage: optimistic mark-read + refetchQueries

## 2026-07-24 — SEO: Beget checklist — Last-Modified, cache, terms, breadcrumbs, analyzer prerender

- Last-Modified + Cache-Control max-age=300 for HTML
- Expand bot/analyzer UA (Beget) + SEO H1 fallback in SPA shell
- HandheldFriendly / MobileOptimized meta
- WebPage/Person/BreadcrumbList/ContactPoint JSON-LD
- Site breadcrumbs UI + footer contacts when set
- /terms page + footer/nav links

## 2026-07-24 — fix: platform modules holes — automation, forms, payments, analytics

- EventDispatcher/Automation: subscribers no longer break form submit
- Scheduler lazy tick only when plugin enabled
- PermissionMiddleware: module DELETE exempt from content.delete
- Forms: submission_id in form.submitted; update_submission by public_id
- Payments: dispatch payment.completed; hide duplicate Orders nav
- Contact widget routes to /forms/contact when Forms on
- Newsletter fresh status; notifications opt-out defaults
- FE: plugin gates, CSV Bearer download, NotificationsBell perm, AnalyticsBeacon
- MCP zip marker check via Node EOCD (no spa.html false negative)

## 2026-07-24 — Platform modules: Forms, Scheduler, Automation, Notifications, Newsletter, Orders, Comments, Analytics

- Scheduler job queue + CLI/HTTP/lazy tick
- Forms engine + builder form widget + submissions
- Automation workflows on events
- Notifications bell + deliveries
- Newsletter DOI/campaigns + signup widget
- Orders extending Payments commerce
- Comments/reviews moderation widgets
- Analytics privacy-aware ingest + overview
- MCP zip marker check fix (spa.html false negative)

Cron: php api/bin/scheduler.php run --limit=20. Default: Scheduler+Forms on; other platform modules seed disabled. No breaking changes.

## 2026-07-24 — Stop admin /projects 404 when Projects plugin is off

- Gate content-health and admin project fetches until plugins hydrate
- usePluginEnabled / isPluginEnabledReady — no fail-open API spam
- Dashboard and BlogEdit skip projects when plugin disabled

## 2026-07-24 — Contact messages: mark as read + admin UI polish

- ContactMessagesPage: mark read / mark all / delete actions
- Unread styling and correct page subtitle
- Dashboard unread badge and count cards polish

## 2026-07-24 — Footer tip link (CloudTips) + external footer links

- Footer supports external https links (CloudTips, GitHub)
- Footer columns: Поддержать проект → pay.cloudtips.ru
- README: support section with tip URL

## 2026-07-24 — Technical SEO audit: redirects, headers, H1 prerender, OG

- Canonical HTTPS + www→apex 301 redirects in root .htaccess
- Security headers: HSTS, CSP, X-Frame-Options, Permissions-Policy
- Asset caching immutable + HTML must-revalidate; gzip/deflate
- Prerender H1 for hero-block + landing widgets; OG site_name/url/twitter:image
- JSON-LD WebSite name fixed; nav aria-labels; SEO copy aligned

## 2026-07-24 — Mobile adaptive: steps-row, pipeline, features

- steps-row stacks on phone / 2-col tablet / full row on lg (was always 6 squeezed columns)
- pipeline-panel horizontal scroll + smaller icons on mobile
- features-grid single column on phones
- hero/compare title clamp + snap section min-w-0 overflow guard

## 2026-07-23 — Fix /api/v1/projects 404 when Portfolio is off

- Public GET /projects moved to ContentModule so disabled Projects module no longer 404s
- useProjects/useProfile/… gated on enabled_plugins portfolio
- HomePage skips classic portfolio fetches when builder home is active

## 2026-07-22 — Fix full-height black rail strip

- Snap rail is a compact centered pill again — remove full-height black strip

## 2026-07-22 — Crisp snap rail bars without visual mush

- Rail marks: no scaleX/translateY/backdrop-filter (were causing muddy aliased bars)
- Fixed pixel widths + flex centering of rail

## 2026-07-22 — Stop snap rail jerking on home scroll

- Rail: fixed-width column + scaleX mark (no width jump/jerk)
- Active section with hysteresis; update only active index on scroll

## 2026-07-22 — Fix scroll on other pages + hide scrollbars

- Non-snap pages: #cms-snap-scroller is display:contents so document scroll works again
- Clear leftover inline overflow styles on leave from home
- Hide scrollbar globally (html/body + snap scroller)

## 2026-07-22 — Remove sticky CSS snap that blocked wheel

- Disable CSS scroll-snap on public scroller — it was eating wheel ticks on full-height sections
- Keep free native scroll + rail jumps; sections stay full-viewport visually

## 2026-07-22 — Fix: restore working native snap scroll

- Remove JS settle that yanked scroll back every 120ms (felt like scroll broken)
- Native wheel scroll on #cms-snap-scroller only; soft CSS proximity snap
- JS only for rail/keyboard jumps

## 2026-07-22 — Smooth snap: no jerky page teleports

- Native free scroll again — no teleport jumps
- Soft proximity CSS snap + gentle settle on idle
- Lighter enter animation; disable Framer section reveals on snap pages

## 2026-07-22 — Fix broken snap controller (positions + wheel)

- Fix snap positions: use getBoundingClientRect instead of broken offsetTop
- Wheel capture on window; never preventDefault when no snap sections
- Animate inner [data-cms-snap-body] so geometry stays stable
- Retry attach until sections exist in DOM

## 2026-07-22 — Snap: fast scroll, animate only on stop

- Fast multi-section scroll without waiting on each page
- Enter animation only after wheel/touch idle settle
- Removed busy lock that ignored scroll during animation

## 2026-07-22 — Better snap controller + directional scroll animations

- Reliable snapPageController: wheel accumulation, pending queue, eased scroll
- Directional enter animations (from below / from above)
- Rail uses same controller; CSS snap disabled to stop lag fights

## 2026-07-22 — Snap rail like ChatGPT + fix scroll lag

- Hide native snap scrollbar
- ChatGPT-style section rail (bars + hover labels + click jump)
- JS wheel/touch/keyboard paging to stop snap lag / stuck scroll

## 2026-07-22 — Full-screen snap pages with own background

- Snap sections force full scroller height via --cms-snap-vh (not broken % through main)
- Opaque section background + overflow clip so neighbour glow does not peek
- Content flex-centered inside each full-screen snap page

## 2026-07-22 — Center snap content + a bit more padding

- Snap sections: slightly larger vertical padding (~18vh)
- Content vertically centered in each snap viewport (v_align center)

## 2026-07-22 — More vertical spacing for snap sections

- Snap sections: padding ~16vh (6.5–11rem) so pages do not stack
- Widget stack gap ~2.75rem inside snap sections

## 2026-07-22 — Snap spacing + footer as last snap page

- Footer is last snap page (min-height 100%, content at bottom)
- Snap sections use roomier vertical padding (clamp 5–8rem / 12vh)
- Blog section included in snap chain so footer is reachable

## 2026-07-22 — Sharp section snap + module rack UI

- Public mandatory snap on #cms-snap-scroller (header outside, sticky-safe)
- scroll-snap-stop always + snap_height 100%
- Module toggles: 9-plugin rack with descriptions (no lonely card)
- Home layout: scroll_snap mandatory + module items

## 2026-07-22 — Fix sticky header + restore wiped content

- Disable document scroll-snap on public pages (broke sticky nav)
- Snap CSS only on builder canvas
- Home meta scroll_snap=none
- Restored navigation, pages, and blog posts after wipe

## 2026-07-22 — Лендинг: живые панели вместо картинок, snap/футер

- Виджеты module-toggles, pipeline-panel, mcp-inspector вместо скриншотов
- Snap: proximity + футер как snap-end, хедер без snap
- Home: убраны пустые экраны из картинок, меньше секций

## 2026-07-22 — Builder: перелистывание секций scroll-snap

- Режим scroll-snap страницы: обычный / мягкий / как страницы
- Кнопка «Включить страницы для всех секций» (100dvh + fade-up + center)
- У секции: snap, valign, анимации fade/slide/scale/blur
- Превью snap в холсте билдера

## 2026-07-22 — Hero фон: меньше затемнения, видно превью

- Убрано тройное тяжёлое затемнение фона hero — один лёгкий градиент
- Дефолт затемнения 0.22, 0 = без оверлея
- В билдере оверлей ещё слабее, чтобы фон-картинка была видна

## 2026-07-22 — Hero-блок: размеры медиа и режим фона

- Клик по картинке выбирает медиа — работают ширина/высота/object-fit
- Поля media_width / media_height / media_object_fit в инспекторе
- Роль медиа: сбоку или фон блока + затемнение и min-height

## 2026-07-22 — Builder UI: иконки палитры и glass chrome

- Палитра виджетов — плитки с Lucide-иконками и hover glow
- Секции — мини-превью колонок вместо плоских кнопок
- Glass topbar/sidepanels, точечный canvas, акцент на device toggle
- Лейблы Секция/Колонка/виджет с анимацией и soft glow при выборе
- CMS_MAP: путь widgetIcons

## 2026-07-22 — Full-bleed секции только по явной настройке

- Убрано авто-fullBleed для hero-block/pl-* — ширина секции только через настройку Full-bleed в инспекторе

## 2026-07-22 — Builder: секции с атмосферой + универсальные блоки лендинга

- Секции Builder: glow, overlay, fade-up, full-bleed, htmlId, min-height, hide mobile/desktop
- Универсальные виджеты: hero-block, showcase-block, compare-block, cta-block, media-placeholder, stat-row
- Главная пересобрана как демо Builder (revision builder-demo-2026-07-22)

## 2026-07-22 — Атомарные виджеты пайплайна и вкладок для билдера

- Виджеты: connector-line, step-badge, steps-row, content-tabs
- Image: URL без media_id; секции до 12 колонок; htmlId якоря
- pl-* помечены устаревшими; ассеты в /landing/*.png
- Главная будет из атомов (layout отдельно)

## 2026-07-22 — Редактируемые номера шагов пайплайна в билдере

- Кружки пайплайна 1–6 стали редактируемыми полями pipeline_N_badge
- В дереве/инспекторе: «Пайплайн N · номер», клик и правка на холсте
- Анимация заливки кружков сохранена

## 2026-07-22 — Метки выбора лендинга = дерево структуры

- Бирюзовый бейдж «шаг 1» — UI выбора EditableShell, не контент сайта
- Подписи EditableText синхронизированы с деревом (Пайплайн N · имя и т.д.) через plFieldLabel

## 2026-07-22 — Виджеты Чип и Ряд чипов в билдере

- Добавлены базовые виджеты chip и chip-row (тот же стиль, что чипы в Лендинг · Hero)
- Чип: текст + опциональная ссылка, inline-edit на холсте
- Ряд чипов: список через ItemsEditor, дефолт как у hero
- Карта CMS_MAP: chip / chip-row в basic.tsx

## 2026-07-22 — Билдер: лендинг как отдельные секции, не монолит

- Лендинг разбит на pl-hero…pl-cta (секция→колонка→виджет)
- Главная: 11 секций лендинга + блог
- Full-bleed для всех pl-* блоков

## 2026-07-22 — Билдер: редактирование каждой строки product-landing

- product-landing: все тексты в settings + EditableText
- В дереве структуры видны все поля лендинга
- Инспектор показывает label поля, не сырой key

## 2026-07-22 — Дашборд: скрыть UI проектов без плагина

- Дашборд скрывает блоки Projects/Portfolio при выключенных плагинах

## 2026-07-22 — Fix: 404 /admin/projects при выключенном Projects

- Дашборд не дергает /admin/projects при выключенном плагине
- Blog edit не грузит список проектов без плагина projects

## 2026-07-22 — Билдер-контент без Portfolio: гейты и виджеты

- Отвязал билдер-страницы about/contact от Portfolio
- cta-banner / contact-form / blog-list больше не требуют Portfolio
- Блог и blog-list зависят от плагина blog
- Sitemap и API page/blog/contactInfo без Portfolio-гейта

## 2026-07-22 — Fix: применить миграцию target_regions на проде

- Регистрация миграции 019_seo_target_regions в MigrationService::FILES

## 2026-07-22 — SEO: целевые рынки CIS/EU/USA/ASIA + schema areaServed

- Миграция seo_settings.target_regions
- Чекбоксы рынков в /admin/seo
- Публичный site.seo.target_regions
- JSON-LD Organization/WebSite areaServed в prerender

## 2026-07-22 — Favicon: padding по краям, без обрезки

- Favicon с отступами ~14% по краям — лого не обрезается снизу в сниппете/вкладке
- cache-bust ?v=5

## 2026-07-22 — Favicon: прозрачный фон, без чёрного квадрата

- Favicon PNG с прозрачным фоном (без чёрной подложки во вкладке)
- PNG первым в head, cache-bust ?v=4

## 2026-07-22 — Favicon: только квадратный ico/png, без SVG

- Убран tall SVG из rel=icon — браузер брал его вместо .ico и рисовал чёрные полосы
- Cache-bust ?v=3 на favicon.ico/png/apple-touch

## 2026-07-22 — Fix favicon: убраны чёрные полосы

- Favicon без чёрных полос: cover-fit + непрозрачный фон сайта (не letterbox contain)

## 2026-07-22 — Yandex SEO: favicon.ico + чистый sitemap

- favicon.ico + apple-touch-icon из SVG (Yandex favicon)
- link rel=icon в index.html (ico/png/svg)
- Sitemap: исключены payment/product-template slug’и как в robots

## 2026-07-22 — Сетка возможностей: ровные пары 2+2

- Сетка фич: первые 6 карточек 2+2+2 (col-span-2), без кривой полосы 1+2 / 2+1

## 2026-07-22 — Hero glow без обрезки + компактный header

- product-landing full-bleed — glow не режется Container/max-w-6xl
- Мягкие body/hero radial-gradient (fade ~70%)
- Header компактнее + CTA-кнопка
- Packager: PHP_BIN / .tools/php

## 2026-07-22 — Картинки на главной product landing

- Подключены финальные иллюстрации к секциям hero, builder, MCP, update, pipeline, modules и CTA
- ImagePlaceholder показывает реальные изображения вместо заглушек
- Ассеты в modules/site/productLanding/assets/

## 2026-07-22 — Главная: продуктовый лендинг Jasefly с placeholder и pipeline

- Новый виджет product-landing + модуль site/productLanding (ImagePlaceholder, секции 1–11)
- Главная __home: layout на product-landing + blog-list; SEO title/description
- Резерв layout: content/jasefly-official/layouts/__home.backup-2026-07-22.json
- Навигация: пункт Обновления в header

## 2026-07-21 — Lab reference: футер-ссылки столбиком

- Footer links: flex-column + display block — строки друг под другом

## 2026-07-21 — Lab reference: затемнение nav при первом скролле

- Nav прозрачный наверху, при scrollY>0 затемнение #050505f0 + blur + border

## 2026-07-21 — Lab reference: hero video fps-loop как на CM

- Hero bg: autoplay loop video fps-loop.mp4 (как /videos/hero/fps-loop.mp4 на CM)
- opacity 0.45/0.50, scale 1.015, object-position 58% → center
- poster r6x + muted/playsInline для autoplay

## 2026-07-21 — Lab reference: hero/telemetry 1:1 по скрину CM

- Hero title: 2 строки, вторая с lg:ml-[8.333%] как на CM
- Kicker: зелёный sq + Verified Marketplace + линия + Curated game software
- Telemetry в container (Active больше не уезжает в центр)
- Сильнее затемнение hero bg слева под референс

## 2026-07-21 — Lab reference: ширина container + футер 1:1

- Container breakpoints как у Tailwind CM: до 96rem (1536px)
- Футер в container + border-x frame
- Market help — первая строка футера (Status/Discord ячейки)
- Legal справа: grid areas Shop|Support|Legal + mobile Support row-span

## 2026-07-21 — Lab reference: 1:1 CSS tokens + homepage layout from cheaters.market

- Exact :root tokens (#58c83a accent, #0a0a0a bg, surfaces/borders/text)
- Full-bleed hero with R6 bg, dual gradients, grid lines, 100svh
- Telemetry bar 12-col (live / drops / stats) from HTML classes
- Bento/featured/games/why/faq/footer radii, spacing, mono labels, Lucide-style icons

## 2026-07-21 — Fix Unable to preload CSS for reference chunk

- Fix Lab reference CSS preload crash: убран битый CDN @import Geist
- Geist Sans/Mono как локальные woff2 в experiment assets
- vite:preloadError → одноразовый reload после деплоя

## 2026-07-21 — Lab: CM homepage closer mock (Geist)

- Lab /lab/reference: максимально близкий мок главной Cheater's Market
- Geist Sans/Mono с CDN, секции по скринам (hero, bento, featured, games, why, FAQ, footer)
- Без CMS-модулей — чистый UI в experiment

## 2026-07-21 — Lab: Cheater's Market UI reference

- Lab reference пересобран под UI Cheater's Market из PDF/HTML
- Тёмный маркетплейс: nav, games grid, featured products, stats
- Ассеты из reference/ скопированы в experiment assets

## 2026-07-21 — Lab: reference visual experiment

- Lab entry reference: атмосферный визуальный референс (Syne/Sora, локальная dark/light)
- Whitelist FE+BE + дефолтный content_json
- CMS_MAP: starter + reference

## 2026-07-21 — Lab admin: fix empty id from useParams

- LabEditPage/LabPreviewPage: useAdminRouteParams вместо useParams (Activate/preview больше не бьют /experiments//)

## 2026-07-21 — Lab: MCP-токен для draft preview

- Fix: draft /lab/:slug preview accepts MCP token (не только JWT)

## 2026-07-21 — Jasefly Lab: изолированные эксперименты

- Новый модуль lab: CRUD экспериментов, whitelist entry_key, soft delete
- Публичный /lab/:slug вне SiteLayout; starter-эксперимент с CSS Modules
- Админка Jasefly Lab + права lab.* + MCP list/get/create/update/publish/preview

## 2026-07-21 — Support: уведы в соцсети для любого агента

- Уведы в TG/Discord/Max/email: абсолютная ссылка на inbox для любого саппорта
- Текст: откройте inbox — станете онлайн и ответите в CMS
- URL сайта из SEO canonical / HTTP_HOST

## 2026-07-21 — Fix Support Telegram ticket notifications

- Support TG: уведомления всегда (не только когда агент online)
- Fallback на bot/chat из плагина Почта; default notify_telegram=true
- Лог support.log + кнопка «Тест Telegram» в inbox

## 2026-07-21 — Support: новый чат после закрытия тикета

- После закрытия тикета виджет даёт «Начать новый диалог» и создаёт новый тикет вместо записи в closed
- send/FAQ не пишут в закрытый тикет

## 2026-07-21 — Support: клик по FAQ в чате

- В чате кликабельные FAQ: юзер жмёт вопрос → в тикет пишется вопрос + точный ответ бота
- API: GET /support/faq, POST /support/faq/{id}/ask; faq в /support/config

## 2026-07-21 — Fix eternal chat history loading

- SupportWidget: сброс «Загрузка истории» для новых посетителей без тикета (баг cancelled + restoredRef)

## 2026-07-21 — Fix Support chat 429 polling

- Support poll: SoftRateLimit вместо hard 429 на GET messages/active/heartbeat
- Виджет: стабильный poll без пересоздания интервала + backoff при throttle/429
- DDoS middleware не режет /support/ (лимит у плагина)
- Интервал опроса по умолчанию 3.5 с

## 2026-07-21 — Support FAQ: редактирование записей

- FAQ: кнопка «Редактировать» для правок сидов в /admin/support/faq

## 2026-07-21 — Support: сиды FAQ для бота

- Сиды FAQ для бота Support: 12 явных вопрос/ответ с пометкой «БАЗОВЫЙ ОТВЕТ» и keywords
- Правка в админке: /admin/support/faq

## 2026-07-21 — Support: история после reload + фикс звука

- Восстановление истории чата по visitor_key: GET /support/active + cookie/localStorage
- Не создавать второй тикет при reload — reuse открытого
- История видна вместе с формой контакта
- Звук: HTMLAudio WAV + unlock по клику (надёжнее Web Audio)

## 2026-07-21 — Support: звуки для посетителя и агента

- Звук уведомлений: виджет (ответ агента/бота) и админ-inbox (новый тикет / сообщение посетителя)
- Web Audio ping без файлов + unlock по клику

## 2026-07-21 — Плагин Support: живой чат и тикеты

- Новый модуль Support: тикеты, сообщения, FAQ, presence агентов
- Публичный виджет чата (polling 2–3 с), контакт при уходе, MX + anti-disposable email
- Админка /admin/support (inbox) и /admin/support/faq
- Уведомления агентам: email, Telegram, Discord, Max
- Права support.manage / support.agent, запись в CMS_MAP
- ZIP: index.html = копия spa.html (маркер гейта; вход — index.php)

## 2026-07-21 — Prerender: H1 hero и полный контент главной для ботов

- Prerender walkLayout: hero (H1), features-grid, cta-banner, faq, blog-list и др.
- Главная для Яндекса снова с H1 и полным смысловым содержимым

## 2026-07-21 — SEO prerender: нормальный description главной для Яндекса

- Главная для ботов: meta description из seo_settings, не из случайного H2 лейаута
- Тело — layout главной + блог в конце; dedupe nav; og:image; сброс кэша prerender v3

## 2026-07-21 — Fix: translate/batch больше не сыпет 429 в консоль

- /translate/batch: soft rate limit (HTTP 200 + throttled) вместо жёсткого 429
- Виджет: chunk 200 + retry при throttle/429 без спама в консоли

## 2026-07-21 — Fix: prerender SQL navigation href

- PrerenderService: navigation_items.href вместо несуществующего url (чинит полный HTML для ботов)

## 2026-07-21 — SEO: надёжный prerender + fallback enriched shell

- index.php вызывает PrerenderService::render напрямую (без require prerender.php)
- prerender.php: fallback на enriched SPA + X-Prerender-Error при сбое

## 2026-07-21 — SEO: index.php + spa.html вместо пустого #root для Яндекса

- Корневой index.php: боты → prerender, люди → SPA с title/desc/OG из БД
- Vite shell переименован в spa.html (nginx не отдаёт пустой index.html)
- DirectoryIndex index.php, SPA fallback на index.php
- SiteUpdater удаляет старый index.html после апдейта
- CMS_MAP: контур SEO ботов

## 2026-07-21 — Тексты прогрева переводчика под Google

- Тексты админки прогрева под Google вместо MyMemory

## 2026-07-21 — Бесплатный Google Translate вместо DeepL по умолчанию

- Провайдер google (нейросеть без ключа) + fallback LibreTranslate/MyMemory
- DeepL оставлен опцией только при наличии API key
- Автомиграция mymemory/deepl-без-ключа → google
- Админка и CMS_MAP обновлены

## 2026-07-21 — Fix: полный код DeepL в TranslateService

- Дописан TranslateService::viaDeepL (был вызов без метода)
- DeepL Free/Pro + Auth Key

## 2026-07-21 — Translate: провайдер DeepL API

- Провайдер DeepL (Free/Pro) с Auth Key
- Настройки deepl_api_key / deepl_plan / deepl_api_url в плагине
- Пакетный перевод до 40 фраз за запрос

## 2026-07-21 — Translate: понятный статус квоты MyMemory

- Явное сообщение quota_hit / дневной лимит MyMemory в прогреве
- Подсказка: email → 50k символов/день вместо 5k

## 2026-07-21 — Полноценный переводчик: без фейков, синк при сохранении

- Не кэшируем фейки (оригинал = «перевод»); purgeInvalid чистит БД
- MyMemory: ретраи, split длинных фраз, проверка responseStatus
- Синк перевода при сохранении страниц/статей (resource.afterSave + TranslateSync)
- Админка: «Очистить фейки и прогреть», медленный надёжный прогрев

## 2026-07-21 — Статичный перевод из кэша без постоянного прогрева

- Публичный /translate/batch — только кэш (без MyMemory), перевод почти мгновенный
- Автопрогрев один раз до ready + content_hash; повтор только при смене контента
- Виджет упрощён: без шторма запросов, откат на русский стабильный

## 2026-07-21 — TranslateWidget: стабильный RU↔EN и полный перевод

- Переключение на русский сразу abort + restore (больше не залипает English)
- Стабильные ключи оригиналов, без порчи source-текста
- MutationObserver без шторма; второй проход через 1.4с для полного покрытия
- Auto-warmup не гоняется параллельно с живым переводом

## 2026-07-21 — Переводчик: полные списки и DOM после React

- TranslateCorpus: HTML списки (li/p) разбиваются на отдельные фразы для кэша
- TranslateWidget: trim-ключи, MutationObserver для React-перерисовки списков
- Заголовки переводились, пункты ul оставались на русском — исправлено

## 2026-07-21 — Translate auto-warmup: без 429 в консоли

- auto-warmup: SoftRateLimitMiddleware отвечает 200+throttled вместо 429
- FE: lock держится на паузу между тиками, реже запросы (~22с)
- Убраны красные Failed to load resource в консоли от прогрева перевода

## 2026-07-21 — Мобильный адаптив features-grid: 2 колонки

- features-grid: на мобиле 2 колонки вместо 3/4, текст с break-words
- секции билдера: колонки <100% на мобиле в столбец
- общий Grid: 2 колонки на мобиле для 3–4 col layouts

## 2026-07-21 — Иконки features-grid: бренды и Lucide вместо вопросиков

- Tech brand icons via simple-icons: React, Vite, MySQL, JWT, Tailwind, Framer, TypeScript, PHP
- Expanded Lucide registry + aliases for package/server/gauge/cart/workflow steps and all site feature icons
- Home tech stack icon names aligned to brand slugs

## 2026-07-21 — Blog image lightbox (fullscreen, close on X/backdrop)

- Add ImageLightbox for fullscreen image preview
- Blog cover clickable lightbox + object-contain
- RichText images open in lightbox on click

## 2026-07-21 — Fix media upload Unsupported file type for SVG/AVIF/ICO

- Allow SVG, AVIF, ICO, BMP in media uploads
- Accept .jpeg/.jpe aliases for JPEG
- Sanitize SVG on upload and CSP on SVG stream

## 2026-07-21 — Yandex Webmaster verification HTML at site root

- Add frontend/public/yandex_bcb93e163b99f9d3.html
- Exclude .html from bot prerender rewrite so verification file is served as static

## 2026-07-21 — Fix install SQL BOM in 001_schema.sql

- Remove UTF-8 BOM from 001_schema.sql (MySQL 1064 on first statement)
- Strip BOM in install.php and MigrationService when parsing SQL
- Stop packing docs .md into public_html web root

## 2026-07-21 — Jasefly CMS

- Rebrand product copy from Portfolio CMS → Jasefly CMS
- Hosting packages: `jasefly-cms-install-*.zip` / `jasefly-cms-update-*.zip`
- MCP package `@jasefly/mcp-cms`, server id `jasefly-cms`, default repo `C:/JASEFLY_CMS`
