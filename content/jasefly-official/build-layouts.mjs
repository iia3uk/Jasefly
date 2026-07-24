/**
 * Build Page Builder layouts for the official Jasefly CMS product site.
 * Run: node content/jasefly-official/build-layouts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, 'layouts')
fs.mkdirSync(outDir, { recursive: true })

let n = 0
const id = (p = 'el') => `${p}_${(++n).toString(36)}`

function widget(type, settings = {}) {
  return { id: id('w'), elType: 'widget', widgetType: type, settings }
}

function column(widgets, width = 100) {
  return { id: id('c'), elType: 'column', settings: { width }, elements: widgets }
}

function section(cols, settings = {}) {
  const list = Array.isArray(cols[0]) || cols[0]?.elType === 'widget'
    ? [column(cols)]
    : cols
  return {
    id: id('s'),
    elType: 'section',
    settings: { paddingY: '3.5rem', gap: '1.5rem', columns: list.length, ...settings },
    elements: list,
  }
}

function layout(elements) {
  return { version: 1, meta: { product: 'jasefly-official' }, elements }
}

function h(text, tag = 'h2', size = 'xl') {
  return widget('heading', { text, tag, size, align: 'left' })
}

function p(html, align = 'left') {
  return widget('text', { html, align })
}

function features(title, subtitle, items, columns = 3) {
  return widget('features-grid', { title, subtitle, columns, items })
}

function faq(title, subtitle, items) {
  return widget('faq', { title, subtitle, items })
}

function cta(title, subtitle, label, href) {
  return widget('cta-banner', { title, subtitle, cta_label: label, cta_href: href })
}

function hero(s) {
  return widget('hero', {
    badge_text: '',
    headline: '',
    subheadline: '',
    primary_cta_label: '',
    primary_cta_href: '',
    secondary_cta_label: '',
    secondary_cta_href: '',
    background_media_id: null,
    ...s,
  })
}

const pages = {}

// ─── HOME ───────────────────────────────────────────────────────────────────
pages.__home = {
  title: 'Главная',
  slug: '__home',
  id: 1,
  seo_title: 'Jasefly CMS — модульная AI-ready CMS на PHP и React',
  seo_description:
    'Jasefly CMS объединяет Page Builder, модули, MCP для AI, локальную production-сборку, обновления из админки и развёртывание на shared-хостинге.',
  layout: layout([
    section([
      hero({
        badge_text: 'PHP 8.3 · React · TypeScript · Vite · MySQL · MCP',
        headline: 'Современная CMS, готовая к работе с AI',
        subheadline:
          'Разрабатывайте сайт локально, управляйте контентом через MCP и разворачивайте готовую production-сборку даже на обычном shared-хостинге.',
        primary_cta_label: 'Изучить возможности',
        primary_cta_href: '/features',
        secondary_cta_label: 'Как это работает',
        secondary_cta_href: '/workflow',
      }),
    ], { paddingY: '2rem' }),
    section([
      features(
        'От локальной разработки до shared-хостинга',
        'Сборка и проверка остаются на вашей машине. На production уходит готовый пакет.',
        [
          { icon: 'code', title: 'Локальная разработка', body: 'Пишете и правите проект у себя: frontend, backend, контент через MCP.' },
          { icon: 'zap', title: 'Build', body: 'Vite собирает React/TypeScript в статические assets.' },
          { icon: 'shield', title: 'Test', body: 'Локальные проверки перед упаковкой обновления.' },
          { icon: 'package', title: 'ZIP', body: 'Install или update-пакет для загрузки на хостинг.' },
          { icon: 'server', title: 'Shared Hosting', body: 'PHP API + готовый frontend. Node.js на сервере не нужен.' },
          { icon: 'refresh', title: 'Обновление из админки', body: 'ZIP загружается в панели, миграции применяются контролируемо.' },
        ],
        3,
      ),
    ]),
    section([
      h('Не каждый сайт требует отдельного VPS', 'h2', 'xl'),
      p(
        '<p>Для обычного современного сайта разработчику часто приходится устанавливать и обслуживать Node.js, Nginx, процессы сборки, SSL, резервные копии и систему деплоя. Jasefly переносит сборку на локальную машину, а на production отправляет уже готовый frontend и PHP API.</p><p>Это не значит, что VPS плохой или небезопасный. Jasefly уменьшает необходимость в постоянном администрировании для проектов, которым достаточно PHP и MySQL.</p>',
      ),
    ]),
    section(
      [
        column([
          h('Типичный VPS', 'h3', 'lg'),
          p(
            '<ul><li>установка операционной системы;</li><li>настройка SSH;</li><li>настройка веб-сервера;</li><li>установка Node.js и npm;</li><li>настройка процессов;</li><li>настройка deployment;</li><li>обновление серверных пакетов;</li><li>постоянное администрирование.</li></ul>',
          ),
        ], 50),
        column([
          h('Jasefly CMS', 'h3', 'lg'),
          p(
            '<ul><li>собрать проект локально;</li><li>получить ZIP;</li><li>загрузить на хостинг;</li><li>запустить installer;</li><li>работать через админку.</li></ul>',
          ),
        ], 50),
      ],
      { columns: 2 },
    ),
    section([
      features(
        'Ключевые возможности',
        'Модули, билдер, AI-доступ и production-пайплайн в одной системе.',
        [
          { icon: 'layers', title: 'Модульная архитектура', body: 'Включайте нужные возможности без переписывания всей системы.' },
          { icon: 'layout', title: 'Page Builder', body: 'Собирайте страницы из секций, колонок и виджетов.' },
          { icon: 'bot', title: 'MCP для нейросети', body: 'Подключайте Cursor и других AI-агентов к структуре и контенту сайта.' },
          { icon: 'upload', title: 'Remote Deploy', body: 'Собирайте, проверяйте и отправляйте обновления через управляемый pipeline.' },
          { icon: 'refresh', title: 'Обновления из админки', body: 'Устанавливайте подготовленные ZIP-обновления без ручной замены файлов.' },
          { icon: 'server', title: 'Shared Hosting Ready', body: 'Production требует PHP и MySQL, а frontend приходит уже собранным.' },
          { icon: 'search', title: 'SEO и Prerender', body: 'Метаданные, sitemap, robots и представление страниц для поисковых роботов.' },
          { icon: 'cart', title: 'Commerce', body: 'Товары, каталоги, checkout и страницы оплаты.' },
          { icon: 'shield', title: 'Безопасность', body: 'Роли, разрешения, JWT, refresh-токены, 2FA, журнал действий и резервные копии.' },
          { icon: 'gauge', title: 'Hosting Guard', body: 'Троттлинг и кэширование в MCP-клиенте ограничивают чрезмерную нагрузку от автоматических агентов.' },
        ],
        2,
      ),
    ]),
    section([
      features(
        'CMS, спроектированная для совместной работы с AI',
        'AI не должен бесконтрольно перебирать API. Jasefly использует карту сайта, digest-данные, ограничения запросов и управляемые операции.',
        [
          { icon: 'map', title: 'Карта сайта', body: 'Агент получает структуру страниц, навигации и настроек одним запросом.' },
          { icon: 'list', title: 'Сущности и страницы', body: 'Читает доступные ресурсы и выжимки layout без лишних циклов.' },
          { icon: 'edit', title: 'Редактирование через API', body: 'Меняет контент через MCP/API в рамках разрешений токена.' },
          { icon: 'check', title: 'Локальная проверка', body: 'Build и test выполняются локально до отправки пакета.' },
          { icon: 'package', title: 'Production-пакет', body: 'Собирается install или update ZIP.' },
          { icon: 'upload', title: 'Обновление', body: 'Пакет отправляется и проверяется; ошибки и журналы — только в рамках токена.' },
        ],
        3,
      ),
    ]),
    section([
      features(
        'Модули',
        'Группы возможностей, доступные в установленной CMS.',
        [
          { icon: 'settings', title: 'Система', body: 'Авторизация, роли и права, миграции, обновления, журнал действий, резервные копии.' },
          { icon: 'file', title: 'Контент', body: 'Страницы, Page Builder, блог, проекты, медиатека, навигация.' },
          { icon: 'cart', title: 'Коммерция', body: 'Товары, каталог, checkout, заказы, страницы оплаты.' },
          { icon: 'plug', title: 'Интеграции', body: 'Webhooks, mail, MCP, remote deploy.' },
          { icon: 'search', title: 'Продвижение', body: 'SEO, sitemap, robots, prerender, пользовательские CSS и JavaScript.' },
        ],
        3,
      ),
    ]),
    section([
      h('Обновления без ручной замены проекта', 'h2', 'xl'),
      p(
        '<p>Сборщик создаёт специальный update-пакет. Администратор загружает ZIP через панель, после чего CMS обновляет runtime-файлы и применяет миграции, не затрагивая локальную конфигурацию, загрузки, резервные копии и журналы.</p>',
      ),
      features(
        '',
        '',
        [
          { icon: 'zap', title: 'Build', body: 'Локальная сборка frontend и подготовка API.' },
          { icon: 'package', title: 'Package', body: 'Формирование update ZIP.' },
          { icon: 'upload', title: 'Upload', body: 'Загрузка пакета в админке.' },
          { icon: 'shield', title: 'Validate', body: 'Проверка пакета перед применением.' },
          { icon: 'database', title: 'Migrate', body: 'Накат SQL-миграций.' },
          { icon: 'check', title: 'Ready', body: 'Сайт снова в рабочем состоянии.' },
        ],
        3,
      ),
    ]),
    section([
      h('Современный frontend без Node.js на production', 'h2', 'xl'),
      p(
        '<p>React и TypeScript собираются локально через Vite. На хостинг отправляются готовые статические assets и PHP API. Production-серверу не требуется самостоятельно компилировать frontend.</p><ul><li>PHP 8.2+;</li><li>MySQL;</li><li>Apache или Nginx;</li><li>HTTPS;</li><li>возможность загрузки ZIP.</li></ul>',
      ),
    ]),
    section([
      features(
        'Для кого',
        '',
        [
          { icon: 'user', title: 'Независимые разработчики', body: 'Запускайте клиентские сайты без создания инфраструктуры с нуля.' },
          { icon: 'briefcase', title: 'Фрилансеры', body: 'Быстро собирайте и поддерживайте несколько проектов.' },
          { icon: 'users', title: 'Небольшие студии', body: 'Используйте единое ядро и добавляйте проектные модули.' },
          { icon: 'bot', title: 'AI-first разработчики', body: 'Работайте с контентом и структурой сайта через MCP.' },
          { icon: 'server', title: 'Владельцы shared-хостинга', body: 'Современная админка и frontend без отдельного application server.' },
        ],
        3,
      ),
    ]),
    section([
      features(
        'Технологии',
        'Стек, на котором строится Jasefly CMS.',
        [
          { icon: 'code', title: 'PHP 8.3', body: 'Целевой runtime backend API.' },
          { icon: 'react', title: 'React', body: 'Публичный сайт и админка.' },
          { icon: 'ts', title: 'TypeScript', body: 'Типизированный frontend.' },
          { icon: 'vite', title: 'Vite', body: 'Локальная сборка production assets.' },
          { icon: 'db', title: 'MySQL', body: 'Основное хранилище данных.' },
          { icon: 'key', title: 'JWT', body: 'Сессии и API-доступ.' },
          { icon: 'bot', title: 'MCP', body: 'Протокол для AI-агентов.' },
          { icon: 'style', title: 'Tailwind', body: 'Утилитарные стили UI.' },
          { icon: 'motion', title: 'Framer Motion', body: 'Умеренные анимации интерфейса.' },
          { icon: 'layout', title: 'Page Builder', body: 'Секции, колонки, виджеты.' },
          { icon: 'server', title: 'Shared Hosting', body: 'Готовый пакет без Node на сервере.' },
        ],
        3,
      ),
    ]),
    section([
      cta(
        'Создавайте сайт, а не серверную инфраструктуру',
        'Jasefly CMS объединяет локальную разработку, модульный backend, визуальное управление контентом, AI-доступ и простой production deployment.',
        'Посмотреть документацию',
        '/docs',
      ),
      widget('button', {
        label: 'Изучить возможности',
        href: '/features',
        variant: 'secondary',
        align: 'center',
        new_tab: false,
      }),
    ]),
    section([
      widget('blog-list', { title: 'Из блога', limit: 3 }),
    ]),
  ]),
}

// ─── FEATURES ───────────────────────────────────────────────────────────────
pages.features = {
  title: 'Возможности',
  slug: 'features',
  seo_title: 'Возможности Jasefly CMS — Page Builder, MCP, модули и деплой',
  seo_description:
    'Модульная архитектура, визуальный Page Builder, MCP для AI, remote deploy, обновления из админки, SEO, commerce и безопасность.',
  layout: layout([
    section([
      h('Возможности Jasefly CMS', 'h1', '2xl'),
      p(
        '<p>Платформа объединяет разработку, управление контентом и production-развёртывание. Ниже — что делает каждая возможность, какую задачу закрывает и кому полезна.</p>',
      ),
    ]),
    section([
      features(
        'Платформа',
        '',
        [
          {
            icon: 'layers',
            title: 'Модульная система',
            body: 'Что делает: включает и отключает доменные модули. Решает: не тащить лишний функционал. Как: через реестр модулей и плагины. Кому: студиям и разработчикам с разными проектами.',
          },
          {
            icon: 'layout',
            title: 'Page Builder',
            body: 'Что делает: собирает страницы из секций, колонок и виджетов. Решает: правки без правки React-кода. Как: в админке на canvas. Кому: разработчикам и контент-редакторам.',
          },
          {
            icon: 'file',
            title: 'Управление контентом',
            body: 'Что делает: страницы, блог, проекты, медиа, навигация. Решает: единый источник правды для публичного сайта. Как: CRUD в админке и через MCP. Кому: всем, кто ведёт сайт без правки репозитория для каждого текста.',
          },
          {
            icon: 'palette',
            title: 'Темы',
            body: 'Что делает: пресеты цветов и шрифтов. Решает: быстрый визуальный каркас. Как: singleton theme. Кому: при запуске бренда без кастомного дизайн-кода.',
          },
          {
            icon: 'search',
            title: 'SEO',
            body: 'Что делает: title, description, OG, sitemap, robots, prerender. Решает: индексацию SPA. Как: настройки страницы и SEO-модуль. Кому: продуктовым и контентным сайтам.',
          },
          {
            icon: 'image',
            title: 'Медиатека',
            body: 'Что делает: хранит и подставляет изображения и файлы. Решает: централизованные ассеты. Как: media API и поля виджетов. Кому: любому публичному сайту.',
          },
          {
            icon: 'cart',
            title: 'Commerce',
            body: 'Что делает: товары, каталог, checkout, оплата. Решает: продажу цифровых и простых товаров. Как: модули Products и Payments. Кому: проектам с витриной.',
          },
          {
            icon: 'shield',
            title: 'Безопасность',
            body: 'Что делает: роли, JWT, 2FA, журнал, бэкапы. Решает: контроль доступа и аудит. Как: Users/System. Кому: любым продакшен-сайтам.',
          },
          {
            icon: 'refresh',
            title: 'Обновления',
            body: 'Что делает: ZIP update из админки + миграции. Решает: обновление без ручной замены дерева файлов. Как: пакет update и панель Updates. Кому: shared-хостингу и соло-разработчикам.',
          },
          {
            icon: 'bot',
            title: 'MCP',
            body: 'Что делает: даёт AI-агенту карту сайта и операции. Решает: управляемое редактирование контента нейросетью. Как: MCP-токен и инструменты. Кому: Cursor и AI-first workflow.',
          },
          {
            icon: 'upload',
            title: 'Remote Deploy',
            body: 'Что делает: pipeline build → test → changelog → deploy → verify. Решает: повторяемый выпуск кода. Как: MCP cms_release. Кому: разработчикам с локальной сборкой.',
          },
          {
            icon: 'gauge',
            title: 'Hosting Guard',
            body: 'Что делает: троттлинг и кэш запросов MCP-клиента. Решает: защиту shared-хостинга от шторма запросов агента. Как: лимиты в MCP-конфиге. Кому: всем, кто пускает AI к API.',
          },
        ],
        2,
      ),
    ]),
    section([cta('Дальше по процессу', 'Посмотрите полный цикл от локальной машины до хостинга.', 'Как это работает', '/workflow')]),
  ]),
}

// ─── WORKFLOW ───────────────────────────────────────────────────────────────
pages.workflow = {
  title: 'Как это работает',
  slug: 'workflow',
  seo_title: 'Как работает Jasefly CMS — от локальной разработки до хостинга',
  seo_description:
    'Полный цикл: локальная установка, разработка, MCP, build, ZIP, установка или обновление на shared-хостинге и дальнейшее управление сайтом.',
  layout: layout([
    section([
      h('Как это работает', 'h1', '2xl'),
      p('<p>Ниже — полный цикл от репозитория до работающего сайта на обычном хостинге.</p>'),
    ]),
    section([
      features(
        'Полный цикл',
        '',
        [
          { icon: '1', title: '1. Локальная установка', body: 'Клонируете репозиторий, поднимаете backend и frontend у себя.' },
          { icon: '2', title: '2. Разработка', body: 'Меняете модули, виджеты, API и UI в привычном git-workflow.' },
          { icon: '3', title: '3. Cursor / MCP', body: 'Агент получает карту сайта и правит контент через API в рамках токена.' },
          { icon: '4', title: '4. Локальный запуск', body: 'Проверяете сайт и админку на своей машине.' },
          { icon: '5', title: '5. Проверка', body: 'Линт, тесты пакета и ручной просмотр критичных сценариев.' },
          { icon: '6', title: '6. Production build', body: 'Vite собирает статический frontend; API готовится к упаковке.' },
          { icon: '7', title: '7. Install / Update ZIP', body: 'Сборщик создаёт пакет для первой установки или апдейта.' },
          { icon: '8', title: '8. Загрузка на хостинг', body: 'ZIP попадает в public_html или через панель обновлений.' },
          { icon: '9', title: '9. Installer / Updates', body: 'Первый запуск — install.php; дальше — обновления из админки.' },
          { icon: '10', title: '10. Управление сайтом', body: 'Контент, SEO, модули и медиа правятся в админке или через MCP.' },
        ],
        2,
      ),
    ]),
    section([cta('Нужен AI-контур?', 'Разберите, как MCP ограничивает агента и какие операции доступны.', 'MCP и AI', '/mcp')]),
  ]),
}

// ─── MODULES ────────────────────────────────────────────────────────────────
pages.modules = {
  title: 'Модули',
  slug: 'modules',
  seo_title: 'Модули Jasefly CMS — система, контент, коммерция и SEO',
  seo_description:
    'Каталог реально доступных модулей: System, Users, Content, Blog, Projects, Portfolio, Products, Payments, SEO, Media, Mail и другие.',
  layout: layout([
    section([
      h('Модули', 'h1', '2xl'),
      p(
        '<p>Список отражает возможности установленной CMS. Стоимость не указана — модули входят в платформу как встроенные или подключаемые пакеты.</p>',
      ),
    ]),
    section([
      features(
        'Система',
        'Каркас runtime и администрирования.',
        [
          { icon: 'settings', title: 'System', body: 'Категория: системный. Назначение: ядро, плагины, обновления, бэкапы, журнал. Статус: системный.' },
          { icon: 'users', title: 'Users', body: 'Категория: системный. Назначение: авторизация, роли, права, 2FA. Статус: системный.' },
        ],
        2,
      ),
    ]),
    section([
      features(
        'Контент',
        '',
        [
          { icon: 'file', title: 'Content', body: 'Категория: контент. Страницы, навигация, site settings, Page Builder layouts. Статус: встроенный.' },
          { icon: 'pen', title: 'Blog', body: 'Категория: контент. Посты, категории, теги, SEO постов. Статус: встроенный / плагин.' },
          { icon: 'folder', title: 'Projects', body: 'Категория: контент. Портфолио-проекты и медиа. Статус: встроенный / плагин.' },
          { icon: 'briefcase', title: 'Portfolio', body: 'Категория: продукт поверх ядра. Услуги, навыки, опыт, отзывы и связанные виджеты. Статус: плагин.' },
          { icon: 'image', title: 'Media', body: 'Категория: контент. Медиатека и использование файлов. Статус: встроенный.' },
        ],
        2,
      ),
    ]),
    section([
      features(
        'Коммерция и продвижение',
        '',
        [
          { icon: 'cart', title: 'Products', body: 'Категория: коммерция. Каталог товаров и витринные шаблоны. Статус: плагин.' },
          { icon: 'card', title: 'Payments', body: 'Категория: коммерция. Checkout, провайдеры оплаты, оферта. Статус: плагин.' },
          { icon: 'search', title: 'SEO', body: 'Категория: продвижение. Sitemap, robots, редиректы, SEO-настройки. Статус: встроенный.' },
          { icon: 'mail', title: 'Mail', body: 'Категория: интеграции. Письма и уведомления с контакт-формы. Статус: встроенный.' },
        ],
        2,
      ),
    ]),
    section([
      features(
        'Дополнительно',
        '',
        [
          { icon: 'globe', title: 'Translate', body: 'Категория: дополнительный. Помощь с переводами корпуса контента. Статус: плагин.' },
          { icon: 'shield', title: 'DDoS', body: 'Категория: дополнительный. Интеграции с внешними anti-DDoS провайдерами при настройке. Статус: плагин.' },
          { icon: 'user-plus', title: 'Registration', body: 'Категория: дополнительный. Публичная регистрация пользователей. Статус: плагин.' },
        ],
        2,
      ),
    ]),
    section([
      p(
        '<p><strong>MCP и Hosting Guard</strong> — часть инструментария агента и конфигурации MCP-клиента, а не отдельный платный модуль в каталоге. Remote deploy выполняется через MCP pipeline, а не отдельным UI-модулем витрины.</p>',
      ),
      cta('Подробнее про AI-доступ', '', 'MCP и AI', '/mcp'),
    ]),
  ]),
}

// ─── MCP ────────────────────────────────────────────────────────────────────
pages.mcp = {
  title: 'MCP и AI',
  slug: 'mcp',
  seo_title: 'MCP и AI в Jasefly CMS — управляемый доступ агента к сайту',
  seo_description:
    'Что такое MCP для CMS, как агент получает карту сайта, какие операции доступны, как ограничиваются права токена и зачем нужны throttling и digest.',
  layout: layout([
    section([
      h('MCP и AI', 'h1', '2xl'),
      p(
        '<p>MCP (Model Context Protocol) — способ подключить AI-агента (например Cursor) к инструментам CMS: карте сайта, контенту, проверкам и деплою. Это не «полный доступ к серверу», а набор операций через API с токеном.</p>',
      ),
    ]),
    section([
      faq('Как устроен доступ', '', [
        {
          q: 'Что такое MCP в контексте CMS?',
          a: 'Протокол и набор инструментов, через которые агент вызывает операции CMS: прочитать карту, обновить страницу, запустить pipeline сборки и деплоя.',
        },
        {
          q: 'Зачем это CMS?',
          a: 'Чтобы нейросеть работала со структурой и контентом осознанно: через digest и карту, а не через хаотичный перебор эндпоинтов.',
        },
        {
          q: 'Как агент получает структуру сайта?',
          a: 'Обычно одним запросом карты сайта: страницы, навигация, тема и ключевые singleton-настройки. Для деталей страницы — digest layout.',
        },
        {
          q: 'Какие операции может выполнять агент?',
          a: 'В рамках токена: чтение/создание/обновление контента, singleton-настройки, bulk-операции, локальный build/test, changelog, deploy update, verify. Точный набор зависит от выданных прав и конфигурации MCP.',
        },
        {
          q: 'Почему токен ≠ доступ к серверу?',
          a: 'Токен ходит в HTTP API CMS. Он не заменяет SSH, не открывает произвольные файлы хостинга и не даёт прав вне реализованных эндпоинтов. Это снижение поверхности, а не абсолютная гарантия безопасности.',
        },
        {
          q: 'Зачем throttling и digest?',
          a: 'Shared-хостинг плохо переносит шторм запросов. Digest и карта уменьшают число round-trip, а Hosting Guard в MCP-клиенте ограничивает частоту и кэширует GET.',
        },
      ]),
    ]),
    section([
      features(
        'Типичный AI-контур',
        '',
        [
          { icon: 'map', title: 'Карта', body: 'cms_site_map — понять, что уже есть.' },
          { icon: 'edit', title: 'Контент', body: 'create/update/bulk в пределах лимитов.' },
          { icon: 'check', title: 'Build & test', body: 'Локально, до отправки на хостинг.' },
          { icon: 'upload', title: 'Deploy', body: 'Управляемый pipeline с verify.' },
        ],
        2,
      ),
    ]),
    section([
      p(
        '<p>Не заявляем абсолютную безопасность: токен нужно хранить секретно, права — минимально необходимыми, а действия агента — ревьюить. MCP делает работу с CMS удобнее и прозрачнее, но ответственность за секреты и изменения остаётся за человеком.</p>',
      ),
      cta('Shared-хостинг', 'Почему production обходится без Node.js.', 'Shared Hosting', '/shared-hosting'),
    ]),
  ]),
}

// ─── SHARED HOSTING ─────────────────────────────────────────────────────────
pages['shared-hosting'] = {
  title: 'Shared Hosting',
  slug: 'shared-hosting',
  seo_title: 'Jasefly CMS на shared-хостинге — без Node.js на production',
  seo_description:
    'Почему frontend собирается локально, что делает PHP API, как проходит установка ZIP и когда всё же нужен VPS.',
  layout: layout([
    section([
      h('Shared Hosting', 'h1', '2xl'),
      p(
        '<p>React и TypeScript собираются локально через Vite. На хостинг уходят готовые статические assets и PHP API. Production не компилирует frontend и не требует постоянного Node.js runtime.</p>',
      ),
    ]),
    section([
      features(
        'Как устроен production',
        '',
        [
          { icon: 'laptop', title: 'Локальная сборка', body: 'На машине разработчика: npm/Vite, проверки, упаковка ZIP.' },
          { icon: 'code', title: 'PHP API', body: 'На хостинге отвечает за данные, авторизацию, медиа, MCP API и бизнес-логику.' },
          { icon: 'file', title: 'Статический frontend', body: 'index.html и assets отдаются веб-сервером; SPA-маршруты через .htaccess/Nginx.' },
          { icon: 'package', title: 'Установка', body: 'Распаковка ZIP в public_html, installer для БД и конфигурации, затем удаление установщика.' },
        ],
        2,
      ),
    ]),
    section([
      h('Чем отличается от постоянного Node-приложения', 'h2', 'xl'),
      p(
        '<p>Классический Node на VPS держит процесс приложения, часто нуждается в process manager и отдельной сборке на сервере. Jasefly разделяет этапы: сборка локально, runtime на PHP+MySQL. Это удобно для сайтов и витрин, которым достаточно shared-хостинга.</p>',
      ),
      h('Когда VPS всё же нужен', 'h2', 'xl'),
      p(
        '<ul><li>фоновые процессы и воркеры;</li><li>WebSocket;</li><li>игровые серверы;</li><li>интенсивные очереди;</li><li>специальные системные зависимости;</li><li>приложения с постоянным Node.js runtime;</li><li>высокие и нестандартные нагрузки.</li></ul><p>В этих случаях VPS или контейнерная платформа — нормальный выбор. Jasefly не претендует заменить их для любой нагрузки.</p>',
      ),
      p(
        '<p><strong>Требования production:</strong> PHP 8.2+, MySQL, Apache или Nginx, HTTPS, возможность загрузить ZIP.</p>',
      ),
    ]),
    section([cta('Обновления', 'Как обновлять сайт без ручной замены проекта.', 'Обновления', '/updates')]),
  ]),
}

// ─── DOCS ───────────────────────────────────────────────────────────────────
pages.docs = {
  title: 'Документация',
  slug: 'docs',
  seo_title: 'Документация Jasefly CMS — установка, MCP, модули, обновления',
  seo_description:
    'Вводные разделы: требования, установка, локальный запуск, структура, сборка, deployment, обновления, Page Builder, API, MCP и безопасность.',
  layout: layout([
    section([
      h('Документация', 'h1', '2xl'),
      p(
        '<p>Ниже — вводные разделы по официальному сайту продукта. Расширенные гайды с пошаговыми скриншотами и полным справочником API находятся в разработке.</p>',
      ),
    ]),
    section([
      faq('Разделы', 'Кратко и по делу. Детали — в связанных страницах сайта.', [
        {
          q: 'Системные требования',
          a: 'Production: PHP 8.2+, расширения PDO/MySQL (или SQLite), JSON, mbstring, openssl; MySQL; Apache/Nginx; HTTPS. Локально дополнительно нужны Node.js и npm для сборки frontend.',
        },
        {
          q: 'Установка',
          a: 'Распакуйте install ZIP в корень сайта, откройте install.php, укажите БД и админа, затем удалите установщик. Подробнее — на странице Shared Hosting и в репозитории.',
        },
        {
          q: 'Локальный запуск',
          a: 'Поднимите backend PHP и frontend Vite из репозитория. Контент и код разделяйте: контент правится в CMS/MCP, код — в git.',
        },
        {
          q: 'Структура проекта',
          a: 'frontend/ (React), backend/ (PHP modules), mcp-cms/ (агент деплоя/контента), content/ (content packs). Новые домены — модулями, не патчем ядра.',
        },
        {
          q: 'Сборка и deployment',
          a: 'Локальный build → update/install ZIP → загрузка на хостинг или через MCP cms_release. На production Node.js не требуется.',
        },
        {
          q: 'Обновления',
          a: 'Update-пакет через админку: validate → files → migrations. Сохраняются config, uploads, логи и бэкапы. См. страницу «Обновления».',
        },
        {
          q: 'Модули и Page Builder',
          a: 'Модули включаются в админке. Страницы собираются из секций/колонок/виджетов. Каталог модулей и возможностей — на страницах «Модули» и «Возможности».',
        },
        {
          q: 'API и MCP',
          a: 'REST API под /api/v1. MCP даёт агенту карту сайта, CRUD и pipeline. Токен храните только в env. См. «MCP и AI».',
        },
        {
          q: 'Безопасность и устранение проблем',
          a: 'Роли, 2FA, JWT, журнал. При сбоях: диагностика в админке, логи, повтор verify после деплоя. Расширенный troubleshooting — в разработке.',
        },
      ]),
    ]),
    section([
      p('<p><em>Статус:</em> вводная документация на сайте готова; глубокие руководства помечаем как «в разработке» и будем дополнять.</p>'),
      cta('Есть вопрос по продукту?', 'Напишите через форму контактов.', 'Контакты', '/contact'),
    ]),
  ]),
}

// ─── UPDATES ────────────────────────────────────────────────────────────────
pages.updates = {
  title: 'Обновления',
  slug: 'updates',
  seo_title: 'Обновления Jasefly CMS — install и update ZIP из админки',
  seo_description:
    'Как устроены install и update пакеты, проверка ZIP, сохранение uploads и config, миграции, журналы и рекомендации перед обновлением.',
  layout: layout([
    section([
      h('Обновления', 'h1', '2xl'),
      p(
        '<p>Jasefly разделяет полный установочный пакет и пакет обновления. Update не затирает локальную конфигурацию, загрузки, резервные копии и журналы.</p>',
      ),
    ]),
    section([
      features(
        'Пакеты',
        '',
        [
          { icon: 'package', title: 'Install package', body: 'Полный набор для новой площадки: frontend assets, API, installer, миграции схемы.' },
          { icon: 'refresh', title: 'Update package', body: 'Runtime-файлы и миграции поверх существующей установки без медиа и локальных секретов.' },
          { icon: 'shield', title: 'Проверка пакета', body: 'Перед применением CMS валидирует архив и состав обновления.' },
          { icon: 'folder', title: 'Uploads', body: 'Файлы медиатеки сохраняются и не входят в типичный update wipe.' },
          { icon: 'key', title: 'Локальный config', body: 'Секреты и config.local / .env на сервере не должны перезаписываться update-пакетом.' },
          { icon: 'database', title: 'Миграции', body: 'SQL накатывается после обновления файлов; схема доводится до актуальной.' },
          { icon: 'list', title: 'Журналирование', body: 'Действия и ошибки фиксируются для разбора после релиза.' },
          { icon: 'save', title: 'Резервные копии', body: 'Перед крупным обновлением рекомендуется бэкап БД и файлов из админки/хостинга.' },
        ],
        2,
      ),
    ]),
    section([
      h('Рекомендации перед обновлением', 'h2', 'xl'),
      p(
        '<ol><li>Сделайте резервную копию БД и critical files.</li><li>Проверьте, что update собран из нужного коммита.</li><li>Загрузите ZIP через панель обновлений.</li><li>Дождитесь validate → migrate → ready.</li><li>Обновите админку (hard refresh) и проверьте ключевые страницы.</li></ol>',
      ),
      cta('Как устроен весь цикл', '', 'Как это работает', '/workflow'),
    ]),
  ]),
}

// ─── ABOUT ──────────────────────────────────────────────────────────────────
pages.about = {
  title: 'О проекте',
  slug: 'about',
  id: 2,
  seo_title: 'О проекте Jasefly CMS — независимая разработка IIA3UK',
  seo_description:
    'Jasefly CMS создана независимым разработчиком IIA3UK: контроль кодовой базы, AI-first workflow, модульность и deployment на shared-хостинг.',
  layout: layout([
    section([
      h('О проекте', 'h1', '2xl'),
      p(
        '<p>Jasefly CMS создана независимым разработчиком <strong>IIA3UK</strong> как собственная платформа для разработки сайтов, управления контентом через AI и безопасного развёртывания на обычном хостинге.</p>',
      ),
    ]),
    section([
      features(
        'Мотивация',
        '',
        [
          { icon: 'code', title: 'Контроль над кодовой базой', body: 'Собственное ядро вместо тяжёлой зависимости от чужой CMS.' },
          { icon: 'layers', title: 'Удобное расширение', body: 'Новые домены — модулями, без бесконечных патчей ядра.' },
          { icon: 'bot', title: 'AI-first workflow', body: 'Карта сайта, digest и MCP для работы с Cursor и агентами.' },
          { icon: 'upload', title: 'Автоматизация deployment', body: 'Локальная сборка, ZIP и обновления из админки.' },
          { icon: 'briefcase', title: 'Свои и клиентские проекты', body: 'Один стек для личных продуктов и заказов.' },
        ],
        2,
      ),
    ]),
    section([
      p('<p>Проект развивается одним автором — это не команда и не компания. Связь по предложениям и ошибкам — через страницу контактов.</p>'),
      cta('Связаться', '', 'Контакты', '/contact'),
    ]),
  ]),
}

// ─── CONTACT ────────────────────────────────────────────────────────────────
pages.contact = {
  title: 'Контакты',
  slug: 'contact',
  id: 4,
  seo_title: 'Контакты Jasefly CMS — вопросы, ошибки, сотрудничество',
  seo_description:
    'Напишите о CMS, предложениях по разработке, ошибках, идеях модулей или сотрудничестве. Форма обратной связи на сайте.',
  layout: layout([
    section([
      h('Контакты', 'h1', '2xl'),
      p(
        '<p>Если хотите обсудить Jasefly CMS, предложить улучшение, сообщить об ошибке, идее модуля или возможном сотрудничестве — напишите через форму. Публичный email и соцсети появятся здесь, когда будут официально опубликованы.</p>',
      ),
      features(
        'О чём можно написать',
        '',
        [
          { icon: 'message', title: 'Вопросы о CMS', body: 'Как устроены модули, MCP, деплой и shared-хостинг.' },
          { icon: 'code', title: 'Разработка', body: 'Предложения по доработке и интеграции.' },
          { icon: 'bug', title: 'Ошибки', body: 'Баги публичного сайта или сценариев установки/обновления.' },
          { icon: 'puzzle', title: 'Модули', body: 'Идеи дополнительных модулей и виджетов.' },
          { icon: 'handshake', title: 'Сотрудничество', body: 'Совместные проекты без обещаний SLA и выдуманных контактов.' },
        ],
        2,
      ),
      widget('contact-form', { title: 'Форма сообщения', subtitle: 'Опишите задачу или вопрос.' }),
    ]),
  ]),
}

// ─── PRIVACY ────────────────────────────────────────────────────────────────
pages.privacy = {
  title: 'Политика конфиденциальности',
  slug: 'privacy',
  id: 3,
  seo_title: 'Политика конфиденциальности — Jasefly CMS',
  seo_description:
    'Нейтральный шаблон политики: формы, технические журналы, авторизация, cookies сессии и безопасность. Требует ручной юридической проверки владельцем.',
  layout: layout([
    section([
      h('Политика конфиденциальности', 'h1', '2xl'),
      p(
        '<p><strong>Важно:</strong> это нейтральный шаблон. Перед юридической публикацией владелец сайта должен проверить и дополнить текст под свою юрисдикцию, реальные сервисы и оператора данных.</p>',
      ),
      p(
        `<h2>1. Оператор</h2>
<p>Сайт Jasefly CMS поддерживается независимым разработчиком IIA3UK. Контакт для запросов — через форму на странице «Контакты».</p>
<h2>2. Какие данные могут обрабатываться</h2>
<ul>
<li><strong>Данные форм:</strong> имя, email и текст сообщения, если вы отправили обращение.</li>
<li><strong>Данные авторизации:</strong> учётные записи администраторов и пользователей (логин, хеш пароля, признаки 2FA) — только для доступа к системе.</li>
<li><strong>Технические журналы:</strong> служебные события и ошибки для поддержки работоспособности.</li>
<li><strong>Cookies:</strong> необходимые cookies сессии и согласие cookie-баннера, если он включён.</li>
</ul>
<p>На момент публикации этого шаблона на сайте <em>не утверждается</em> использование конкретной аналитики, рекламных пикселей, платёжных провайдеров для посетителей маркетинговых страниц или email-рассылок — пока они не подключены владельцем явно.</p>
<h2>3. Цели</h2>
<p>Ответ на обращения, обеспечение безопасности, работа админки и публичного сайта, диагностика сбоев.</p>
<h2>4. Хранение и безопасность</h2>
<p>Данные хранятся на хостинге сайта. Применяются меры: разграничение ролей, JWT/сессии, по возможности 2FA, ограничение доступа к конфигурации. Абсолютная безопасность не гарантируется.</p>
<h2>5. Передача третьим лицам</h2>
<p>Данные не продаются. Передача возможна только если это требуется для работы инфраструктуры хостинга или по закону.</p>
<h2>6. Права пользователя</h2>
<p>Вы можете запросить уточнение, исправление или удаление данных обращения, связавшись через форму контактов. Для административных аккаунтов действуют внутренние процедуры доступа.</p>
<h2>7. Что проверить вручную перед публикацией</h2>
<ul>
<li>реквизиты оператора и юрисдикцию;</li>
<li>фактически подключённую аналитику и cookies;</li>
<li>платёжные и mail-сервисы;</li>
<li>сроки хранения и политику бэкапов;</li>
<li>наличие DPA с хостинг-провайдером при необходимости.</li>
</ul>
<p>Дата шаблона: 21 июля 2026 г.</p>`,
      ),
    ]),
  ]),
}

// ─── BLOG COVER ─────────────────────────────────────────────────────────────
pages.blog = {
  title: 'Блог',
  slug: 'blog',
  id: 5,
  seo_title: 'Блог Jasefly CMS — shared-хостинг, MCP и обновления',
  seo_description:
    'Статьи о локальной сборке, shared-хостинге, MCP для CMS и безопасных обновлениях сайта.',
  layout: layout([
    section([
      h('Блог', 'h1', '2xl'),
      p('<p>Заметки о архитектуре Jasefly CMS, AI-доступе и развёртывании без лишней серверной рутины.</p>'),
      widget('blog-list', { title: 'Свежие материалы', limit: 12 }),
    ]),
  ]),
}

const manifest = []
for (const [key, page] of Object.entries(pages)) {
  n = 0 // reset ids per page for readability
  // rebuild not needed — ids already unique enough across file write
  const file = path.join(outDir, `${key}.json`)
  fs.writeFileSync(file, JSON.stringify(page, null, 2), 'utf8')
  manifest.push({
    key,
    file: `layouts/${key}.json`,
    slug: page.slug,
    id: page.id ?? null,
    title: page.title,
  })
  console.log('wrote', key, 'widgets≈', JSON.stringify(page.layout).match(/"elType":"widget"/g)?.length ?? 0)
}

fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('manifest', manifest.length, 'pages')
