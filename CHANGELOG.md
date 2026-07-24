# Changelog

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
