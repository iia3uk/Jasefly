/**
 * Create /api-docs product page + nav + docs cross-link.
 * node content/jasefly-official/apply-api-docs.mjs
 */
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'

loadMcpEnv()
const client = clientFromEnv()

let n = 0
const id = (p = 'el') => `${p}_${(++n).toString(36)}`
const widget = (type, settings = {}) => ({ id: id('w'), elType: 'widget', widgetType: type, settings })
const column = (widgets, width = 100) => ({ id: id('c'), elType: 'column', settings: { width }, elements: widgets })
const section = (widgets, settings = {}) => ({
  id: id('s'),
  elType: 'section',
  settings: { paddingY: '3rem', gap: '1.25rem', columns: 1, ...settings },
  elements: [column(widgets)],
})
const h = (text, tag = 'h2', size = 'xl') => widget('heading', { text, tag, size, align: 'left' })
const p = (html) => widget('text', { html, align: 'left' })

const BASE = 'https://jasefly.com/api/v1'

const layout = {
  version: 1,
  meta: { product: 'jasefly-api-docs' },
  elements: [
    section([
      h('API Jasefly CMS', 'h1', '2xl'),
      p(`<p>Полная документация HTTP API для людей и AI-агентов. Базовый URL: <code>${BASE}</code>. Машиночитаемый краткий индекс: <code>GET ${BASE}/docs</code>.</p>
<p><strong>Для нейросети:</strong> сначала прочитай разделы «Модель мышления», «Авторизация», «Правила агента» и «Page Builder layout». Не перебирай эндпоинты циклами — используй карту сайта и digest.</p>
<p><strong>Для человека:</strong> ниже — принципы, формат ответов, публичные и admin-методы, CRUD-ресурсы, singleton-настройки, MCP и примеры <code>curl</code>.</p>`),
    ]),

    section([
      h('Модель мышления', 'h2', 'xl'),
      p(`<p>Jasefly CMS разделяет три слоя:</p>
<ol>
<li><strong>Публичный сайт</strong> — SPA + данные из public API (<code>/site</code>, <code>/pages/{slug}</code>, блог, товары…).</li>
<li><strong>Admin API</strong> — CRUD контента, медиа, синглтоны, плагины, обновления. Требует JWT или MCP-токен.</li>
<li><strong>MCP-слой</strong> — те же admin-эндпоинты + удобные агрегаты (<code>/admin/mcp/site-map</code>, digests, schema) и локальный pipeline сборки/деплоя на стороне агента.</li>
</ol>
<p>Контент страниц хранится как <code>layout_json</code> (дерево section → column → widget). Менять «жёсткий» React-код для текстов не нужно: правьте layout через API/админку/MCP.</p>
<pre><code>Клиент / Агент
    │  Authorization: Bearer &lt;token&gt;
    ▼
 /api/v1  (PHP)
    │
    ├─ public GET  → витрина
    ├─ auth        → login / refresh / me
    └─ admin/*     → CRUD + MCP helpers
         │
         ▼
      MySQL + storage
</code></pre>`),
    ]),

    section([
      widget('features-grid', {
        title: 'Быстрый старт',
        subtitle: 'Минимум, чтобы начать ковырять API вручную.',
        columns: 2,
        items: [
          { icon: '1', title: 'Проверка жив ли API', body: `GET ${BASE}/health — без токена.` },
          { icon: '2', title: 'Bootstrap сайта', body: `GET ${BASE}/site — тема, nav, настройки одним ответом.` },
          { icon: '3', title: 'Войти', body: 'POST /auth/login → access_token (или используйте MCP_API_TOKEN).' },
          { icon: '4', title: 'Карта для агента', body: 'GET /admin/mcp/site-map — страницы + nav + singletons.' },
        ],
      }),
    ]),

    section([
      h('Формат ответа', 'h2', 'xl'),
      p(`<p>Типичный JSON:</p>
<pre><code>{
  "data": { ... },
  "error": null,
  "meta": { "api_version": "v1" }
}</code></pre>
<p>При ошибке смотрите HTTP-код и поле <code>error</code> / <code>message</code>. Для list-ресурсов часто есть массив в <code>data</code> (иногда обёрнутый). Успешный create обычно возвращает <code>201</code>.</p>
<p><strong>Контент-Type:</strong> <code>application/json</code>, кроме upload медиа (<code>multipart/form-data</code>).</p>`),
    ]),

    section([
      h('Авторизация', 'h2', 'xl'),
      p(`<h3>JWT (человек / админка)</h3>
<ol>
<li><code>POST /auth/login</code> с <code>{"email","password"}</code>.</li>
<li>Если включена 2FA — <code>POST /auth/2fa/verify</code> с <code>challenge_token</code> и кодом.</li>
<li>Дальше: заголовок <code>Authorization: Bearer &lt;access_token&gt;</code>.</li>
<li>Обновление: <code>POST /auth/refresh</code> с <code>refresh_token</code>.</li>
<li>Текущий пользователь: <code>GET /auth/me</code>.</li>
</ol>
<h3>MCP-токен (агент)</h3>
<p>Длинный токен из <code>api/config/.env</code> → <code>MCP_API_TOKEN</code>. Передаётся тем же Bearer. Права = роль токена (обычно супер-админские операции MCP). Токен ≠ SSH и не открывает произвольные файлы сервера.</p>
<pre><code>curl -s ${BASE}/auth/me \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Accept: application/json"
</code></pre>
<p>Роли системы: <code>super_admin</code>, <code>admin</code>, <code>editor</code> (+ разрешения модулей). Admin-роуты защищены middleware auth + permissions.</p>`),
    ]),

    section([
      h('Публичные эндпоинты', 'h2', 'xl'),
      p(`<p>Без авторизации (часть с rate-limit).</p>
<table>
<thead><tr><th>Метод</th><th>Путь</th><th>Назначение</th></tr></thead>
<tbody>
<tr><td>GET</td><td><code>/health</code></td><td>Healthcheck</td></tr>
<tr><td>GET</td><td><code>/docs</code></td><td>Краткий машиночитаемый индекс API</td></tr>
<tr><td>GET</td><td><code>/site</code></td><td>Bootstrap: settings, theme, navigation, hero…</td></tr>
<tr><td>GET</td><td><code>/profile</code></td><td>Профиль</td></tr>
<tr><td>GET</td><td><code>/pages/{slug}</code></td><td>Страница + layout (для home часто slug <code>__home</code>)</td></tr>
<tr><td>GET</td><td><code>/blog</code>, <code>/blog/{slug}</code></td><td>Посты</td></tr>
<tr><td>GET</td><td><code>/projects</code>, <code>/projects/{slug}</code></td><td>Проекты</td></tr>
<tr><td>GET</td><td><code>/products</code>, <code>/products/{slug}</code>, <code>/products/facets</code>, <code>/products/config</code></td><td>Каталог (если модуль Products включён)</td></tr>
<tr><td>GET</td><td><code>/statistics</code>, <code>/experience</code>, <code>/education</code>, <code>/skills</code>, <code>/services</code>, <code>/testimonials</code>, <code>/contact-info</code></td><td>Публичные сущности портфолио</td></tr>
<tr><td>GET</td><td><code>/search?q=</code></td><td>Публичный поиск (rate-limit)</td></tr>
<tr><td>POST</td><td><code>/contact</code></td><td>Форма обратной связи (rate-limit)</td></tr>
<tr><td>GET</td><td><code>/media/{id}</code></td><td>Отдача файла медиа</td></tr>
<tr><td>GET</td><td><code>/sitemap.xml</code>, <code>/robots.txt</code></td><td>SEO</td></tr>
<tr><td>GET</td><td><code>/payments/config</code></td><td>Публичный конфиг оплаты</td></tr>
<tr><td>POST</td><td><code>/payments/checkout</code></td><td>Создать платёж</td></tr>
<tr><td>GET</td><td><code>/payments/status/{id}</code></td><td>Статус платежа</td></tr>
<tr><td>POST</td><td><code>/payments/webhook?provider=</code></td><td>Webhook провайдера</td></tr>
</tbody>
</table>
<pre><code>curl -s ${BASE}/site | jq .
curl -s ${BASE}/pages/__home | jq '.data.title, .data.seo_title'
</code></pre>`),
    ]),

    section([
      h('Admin CRUD — общий контракт', 'h2', 'xl'),
      p(`<p>Для ресурса <code>{resource}</code>:</p>
<pre><code>GET    /admin/{resource}          # список
POST   /admin/{resource}          # создать
GET    /admin/{resource}/{id}     # одна запись
PUT    /admin/{resource}/{id}     # обновить (частичные поля ок)
DELETE /admin/{resource}/{id}     # soft-delete где поддерживается
</code></pre>
<p><strong>Ресурсы ядра:</strong> <code>pages</code>, <code>blog</code>, <code>blog-categories</code>, <code>blog-tags</code>, <code>projects</code>, <code>project-categories</code>, <code>products</code>, <code>services</code>, <code>navigation</code>, <code>homepage-sections</code>, <code>testimonials</code>, <code>experience</code>, <code>education</code>, <code>skills</code>, <code>skill-categories</code>, <code>statistics</code>, <code>social-links</code>, <code>media</code>.</p>
<p>Дополнительно:</p>
<ul>
<li><code>POST /admin/blog/{id}/publish</code>, <code>POST /admin/projects/{id}/publish</code> — смена статуса публикации.</li>
<li><code>POST /admin/navigation/reorder</code>, <code>/admin/projects/reorder</code>, <code>/admin/skills/reorder</code> — порядок.</li>
<li>Страницы: поле <code>layout</code> в теле PUT/POST → сервер пишет в <code>layout_json</code>. Также: <code>seo_title</code>, <code>seo_description</code>, <code>slug</code>, <code>title</code>, <code>status</code>, <code>template</code>.</li>
</ul>
<pre><code>curl -s -X PUT ${BASE}/admin/pages/1 \\
  -H "Authorization: Bearer TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"seo_title":"Новый title","seo_description":"Описание"}'
</code></pre>`),
    ]),

    section([
      h('Singleton-настройки', 'h2', 'xl'),
      p(`<p>Одна запись на весь сайт:</p>
<pre><code>GET /admin/{name}
PUT /admin/{name}   # partial update
</code></pre>
<p>Имена: <code>profile</code>, <code>hero</code>, <code>site-settings</code>, <code>seo</code>, <code>theme</code>, <code>contact-info</code>, <code>footer</code>, <code>email-settings</code>.</p>
<p>Примеры полей:</p>
<ul>
<li><code>site-settings</code>: <code>site_name</code>, <code>locale</code>, <code>cookie_banner_*</code>, <code>maintenance_mode</code></li>
<li><code>seo</code>: <code>site_title</code>, <code>site_description</code>, <code>og_title</code>, <code>og_description</code>, <code>robots_txt</code></li>
<li><code>theme</code>: <code>preset</code>, цвета, шрифты</li>
<li><code>footer</code>: <code>tagline</code>, <code>copyright_text</code>, <code>columns_json</code>, <code>show_social</code></li>
</ul>`),
    ]),

    section([
      h('Page Builder layout (важно для агентов)', 'h2', 'xl'),
      p(`<p>Layout — JSON:</p>
<pre><code>{
  "version": 1,
  "elements": [
    {
      "id": "s_1",
      "elType": "section",
      "settings": { "paddingY": "3rem", "columns": 1 },
      "elements": [
        {
          "id": "c_1",
          "elType": "column",
          "settings": { "width": 100 },
          "elements": [
            {
              "id": "w_1",
              "elType": "widget",
              "widgetType": "heading",
              "settings": { "text": "Заголовок", "tag": "h1", "size": "2xl" }
            }
          ]
        }
      ]
    }
  ]
}
</code></pre>
<p><strong>Реальные типы виджетов (landing/product):</strong> <code>hero</code>, <code>heading</code>, <code>text</code>, <code>button</code>, <code>image</code>, <code>spacer</code>, <code>divider</code>, <code>html</code>, <code>features-grid</code>, <code>faq</code>, <code>cta-banner</code>, <code>logos-strip</code>, <code>blog-list</code>, <code>contact-form</code>, <code>image-gallery</code>, <code>video-embed</code>, … плюс portfolio/commerce при включённых плагинах.</p>
<p>Не выдумывайте типы виджетов. Перед правкой читайте digest страницы: <code>GET /admin/mcp/pages-digest/{slug}</code>.</p>
<p>Главная страница: <code>is_home=1</code>, slug обычно <code>__home</code> (URL публично <code>/</code>).</p>`),
    ]),

    section([
      h('Медиа', 'h2', 'xl'),
      p(`<ul>
<li><code>GET /admin/media</code> — список</li>
<li><code>POST /admin/media</code> — upload (<code>multipart</code>, поле <code>file</code>)</li>
<li><code>PUT /admin/media/{id}</code> — метаданные</li>
<li><code>POST /admin/media/{id}/replace</code> — заменить файл, сохранив id</li>
<li><code>DELETE /admin/media/{id}</code> — удалить</li>
<li>Папки: <code>/admin/media/folders</code></li>
<li>Служебные: <code>/admin/media/unused</code>, <code>/missing</code>, <code>purge-missing</code></li>
<li>Публичная отдача: <code>GET /media/{id}</code></li>
</ul>`),
    ]),

    section([
      h('Система, плагины, обновления, trash', 'h2', 'xl'),
      p(`<ul>
<li><code>GET /admin/dashboard</code>, <code>/admin/system/status</code>, <code>/admin/system/last-error</code></li>
<li><code>GET /admin/plugins</code>, <code>POST /admin/plugins/{name}/toggle</code>, settings/seed-pages</li>
<li><code>GET /admin/modules</code>, <code>/admin/blueprints</code>, <code>/admin/blocks</code>, <code>/admin/public-routes</code></li>
<li><code>GET|POST /admin/migrations*</code> — статус и retry</li>
<li><code>GET|POST /admin/updates</code> — список / загрузка update ZIP</li>
<li><code>POST /admin/backup</code> — резервная копия</li>
<li>Trash: <code>GET /admin/trash</code>, restore / force-delete / empty</li>
<li>Activity: <code>GET /admin/activity</code></li>
<li>Users/roles: <code>/admin/users</code>, <code>/admin/roles</code>, permissions</li>
<li>Content pack: <code>POST /admin/content-pack/apply</code> (осторожно: режим replace чистит таблицы)</li>
</ul>`),
    ]),

    section([
      h('MCP HTTP helpers', 'h2', 'xl'),
      p(`<p>Под MCP-токеном удобны агрегаты:</p>
<table>
<thead><tr><th>Метод</th><th>Путь</th><th>Зачем</th></tr></thead>
<tbody>
<tr><td>GET</td><td><code>/admin/mcp/site-map</code></td><td>Страницы + nav + singletons одним запросом</td></tr>
<tr><td>GET</td><td><code>/admin/mcp/pages-digest</code></td><td>Короткие выжимки всех страниц</td></tr>
<tr><td>GET</td><td><code>/admin/mcp/pages-digest/{idOrSlug}</code></td><td>Детали layout одной страницы</td></tr>
<tr><td>GET</td><td><code>/admin/mcp/schema</code></td><td>Схема БД / missing tables</td></tr>
<tr><td>GET</td><td><code>/admin/mcp/diagnostics</code></td><td>Диагностика</td></tr>
<tr><td>GET</td><td><code>/admin/mcp/last-error</code></td><td>Последняя ошибка</td></tr>
<tr><td>POST</td><td><code>/admin/mcp/changelog</code></td><td>Запись changelog релиза</td></tr>
</tbody>
</table>
<p>Cursor MCP-инструменты (<code>cms_site_map</code>, <code>cms_bulk</code>, <code>cms_release</code>…) — обёртки над этими HTTP-вызовами + локальный build. Не долбите хостинг: пауза между запросами, bulk ≤ 25, кэш GET.</p>`),
    ]),

    section([
      widget('faq', {
        title: 'Правила для AI-агентов',
        subtitle: 'Обязательный протокол работы с API/MCP.',
        items: [
          {
            q: 'С чего начать правки контента?',
            a: 'Один раз GET /admin/mcp/site-map (или cms_site_map). Не крутите cms_list по всем ресурсам подряд.',
          },
          {
            q: 'Как править страницу?',
            a: 'pages-digest/{slug} → собрать layout/поля → PUT /admin/pages/{id} с layout / seo_title / seo_description.',
          },
          {
            q: 'Можно ли wipe через content-pack?',
            a: 'replace_content удаляет таблицы включая pages. Для продуктового сайта предпочитайте инкрементальный create/update.',
          },
          {
            q: 'Как не убить shared-хостинг?',
            a: 'Очередь запросов, пауза ~2с, ≤15/мин, кэш GET, пачки bulk. Digest вместо сотен мелких GET.',
          },
          {
            q: 'Где секреты?',
            a: 'Только в env (MCP_API_TOKEN / JWT). Не писать в контент страниц, чаты и git.',
          },
          {
            q: 'Как деплоить код?',
            a: 'Локально: build → test → changelog → deploy update ZIP → verify. Через MCP: cms_release. Не invent scp/zip вручную без нужды.',
          },
        ],
      }),
    ]),

    section([
      h('Примеры сценариев', 'h2', 'xl'),
      p(`<h3>1. Прочитать SEO главной</h3>
<pre><code>curl -s ${BASE}/pages/__home | jq '.data | {title, seo_title, seo_description}'
</code></pre>
<h3>2. Обновить тему</h3>
<pre><code>curl -s -X PUT ${BASE}/admin/theme \\
  -H "Authorization: Bearer TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"preset":"graphite","primary_color":"#c4c4c8"}'
</code></pre>
<h3>3. Создать пункт навигации</h3>
<pre><code>curl -s -X POST ${BASE}/admin/navigation \\
  -H "Authorization: Bearer TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"label":"API","href":"/api-docs","location":"header","sort_order":9,"is_visible":1}'
</code></pre>
<h3>4. Карта сайта для агента</h3>
<pre><code>curl -s ${BASE}/admin/mcp/site-map \\
  -H "Authorization: Bearer TOKEN" | jq '{pages_count, navigation, singletons}'
</code></pre>`),
    ]),

    section([
      h('Ограничения и честность', 'h2', 'xl'),
      p(`<ul>
<li>Набор модулей зависит от включённых плагинов — проверяйте <code>GET /admin/plugins</code>.</li>
<li>Краткий <code>GET /docs</code> не заменяет эту страницу: он даёт индекс, здесь — принципы и контракты.</li>
<li>Некоторые поля страницы (page-level OG) могут отсутствовать: используйте page <code>seo_*</code> + site singleton <code>seo</code>.</li>
<li>Webhook платежей и секреты провайдеров настраиваются в Payments — не публикуйте ключи.</li>
<li>Эта страница — живой контент CMS: правьте её в билдере или через API так же, как остальные.</li>
</ul>`),
    ]),

    section([
      widget('cta-banner', {
        title: 'Смотрите также',
        subtitle: 'Вводная документация, MCP и цикл разработки.',
        cta_label: 'Документация',
        cta_href: '/docs',
      }),
      widget('button', { label: 'MCP и AI', href: '/mcp', variant: 'secondary', align: 'center', new_tab: false }),
      widget('button', { label: 'Как это работает', href: '/workflow', variant: 'ghost', align: 'center', new_tab: false }),
    ]),
  ],
}

async function main() {
  console.log('create api-docs page')
  const created = await client.post('/admin/pages', {
    title: 'API',
    slug: 'api-docs',
    status: 'published',
    template: 'builder',
    seo_title: 'API Jasefly CMS — HTTP, Admin CRUD, MCP для людей и нейросетей',
    seo_description:
      'Полная документация API: авторизация, публичные и admin-эндпоинты, CRUD-ресурсы, layout Page Builder, MCP site-map и правила для AI-агентов.',
    layout,
  })
  const pageId = created?.data?.id ?? created?.id
  console.log('page id', pageId)

  console.log('nav header')
  await client.post('/admin/navigation', {
    label: 'API',
    href: '/api-docs',
    location: 'header',
    sort_order: 6,
    is_visible: 1,
    target: '_self',
  })
  console.log('nav footer')
  await client.post('/admin/navigation', {
    label: 'API',
    href: '/api-docs',
    location: 'footer',
    sort_order: 5,
    is_visible: 1,
    target: '_self',
  })

  // Cross-link from /docs (id 30)
  console.log('patch docs intro')
  await client.put('/admin/pages/30', {
    layout: {
      version: 1,
      meta: { product: 'jasefly-official' },
      elements: [
        {
          id: 's_docs1',
          elType: 'section',
          settings: { paddingY: '3.5rem', gap: '1.5rem', columns: 1 },
          elements: [
            {
              id: 'c_docs1',
              elType: 'column',
              settings: { width: 100 },
              elements: [
                {
                  id: 'w_docs_h',
                  elType: 'widget',
                  widgetType: 'heading',
                  settings: { text: 'Документация', tag: 'h1', size: '2xl', align: 'left' },
                },
                {
                  id: 'w_docs_p',
                  elType: 'widget',
                  widgetType: 'text',
                  settings: {
                    html: '<p>Ниже — вводные разделы. Полный справочник HTTP API для людей и нейросетей: <a href="/api-docs">API Jasefly CMS</a>. Машиночитаемый индекс: <code>GET /api/v1/docs</code>. Расширенные гайды со скриншотами помечаем как «в разработке».</p>',
                    align: 'left',
                  },
                },
              ],
            },
          ],
        },
        {
          id: 's_docs2',
          elType: 'section',
          settings: { paddingY: '3.5rem', gap: '1.5rem', columns: 1 },
          elements: [
            {
              id: 'c_docs2',
              elType: 'column',
              settings: { width: 100 },
              elements: [
                {
                  id: 'w_docs_faq',
                  elType: 'widget',
                  widgetType: 'faq',
                  settings: {
                    title: 'Разделы',
                    subtitle: 'Кратко и по делу. Детали — в связанных страницах сайта.',
                    items: [
                      {
                        q: 'Системные требования',
                        a: 'Production: PHP 8.2+, PDO/MySQL (или SQLite), JSON, mbstring, openssl; MySQL; Apache/Nginx; HTTPS. Локально дополнительно Node.js/npm для сборки frontend.',
                      },
                      {
                        q: 'Установка',
                        a: 'Распакуйте install ZIP, откройте install.php, укажите БД и админа, удалите установщик. См. Shared Hosting.',
                      },
                      {
                        q: 'API',
                        a: 'Полная документация: /api-docs. Краткий JSON-индекс: GET /api/v1/docs. Admin CRUD под Bearer JWT или MCP-токеном.',
                      },
                      {
                        q: 'Локальный запуск и структура',
                        a: 'frontend/ (React), backend/ (PHP modules), mcp-cms/ (агент). Новые домены — модулями.',
                      },
                      {
                        q: 'Сборка, deployment, обновления',
                        a: 'Локальный build → ZIP → хостинг или cms_release. Update из админки сохраняет config и uploads.',
                      },
                      {
                        q: 'Модули, Page Builder, MCP, безопасность',
                        a: 'См. страницы Модули, Возможности, MCP и AI. Токен только в env.',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        {
          id: 's_docs3',
          elType: 'section',
          settings: { paddingY: '3.5rem', gap: '1.5rem', columns: 1 },
          elements: [
            {
              id: 'c_docs3',
              elType: 'column',
              settings: { width: 100 },
              elements: [
                {
                  id: 'w_docs_note',
                  elType: 'widget',
                  widgetType: 'text',
                  settings: {
                    html: '<p><em>Статус:</em> вводная документация готова; глубокие руководства в разработке. API-справочник поддерживается отдельно на странице API.</p>',
                    align: 'left',
                  },
                },
                {
                  id: 'w_docs_cta',
                  elType: 'widget',
                  widgetType: 'cta-banner',
                  settings: {
                    title: 'К справочнику API',
                    subtitle: 'Эндпоинты, авторизация, layout и правила для агентов.',
                    cta_label: 'Открыть API',
                    cta_href: '/api-docs',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  })

  // Footer columns_json add API under Ресурсы
  const footer = await client.get('/admin/footer')
  const f = footer?.data ?? footer
  let cols = f.columns_json
  if (typeof cols === 'string') cols = JSON.parse(cols)
  if (Array.isArray(cols)) {
    const res = cols.find((c) => c.title === 'Ресурсы')
    if (res && Array.isArray(res.links) && !res.links.some((l) => l.href === '/api-docs')) {
      res.links.splice(1, 0, { label: 'API', href: '/api-docs' })
      await client.put('/admin/footer', { columns_json: cols })
      console.log('footer columns updated')
    }
  }

  console.log('done')
}

main().catch((e) => {
  console.error(e.message || e)
  if (e.payload) console.error(JSON.stringify(e.payload, null, 2))
  process.exit(1)
})
