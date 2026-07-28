/**
 * Site-wide visitor copy rewrite → live CMS (MCP token from mcp-cms/.env).
 * Does NOT deploy code. Does NOT commit.
 *
 * Usage:
 *   node content/jasefly-official/apply-visitor-copy.mjs
 *   RESUME_FROM=about node content/jasefly-official/apply-visitor-copy.mjs
 *
 * RESUME_FROM skips singletons/home and all pages before the given slug
 * (throttle recovery). Slug alias: modules → cms-modules.
 *
 * Resolves pages by slug (not hardcoded IDs). Home patches match widgets by
 * widgetType and fail if more than one match exists for a type.
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
  settings: { paddingY: '3.5rem', gap: '1.5rem', columns: 1, ...settings },
  elements: [column(widgets)],
})
const h = (text, tag = 'h2', size = 'xl') => widget('heading', { text, tag, size, align: 'left' })
const p = (html, align = 'left') => widget('text', { html, align })
const features = (title, items, columns = 2, subtitle = '') =>
  widget('features-grid', { title, subtitle, columns, items })
const cta = (title, subtitle, cta_label, cta_href) =>
  widget('cta-banner', { title, subtitle, cta_label, cta_href })
const faq = (title, items, subtitle = '') => widget('faq', { title, subtitle, items })

const pages = [
  {

    title: 'Возможности',
    slug: 'features',
    seo_title: 'Возможности Jasefly CMS — редактор, модули, хостинг и AI',
    seo_description:
      'Что умеет Jasefly: страницы и блог, роли, SEO, медиа, модули, обновления ZIP, работа через AI и публикация на обычный PHP-хостинг.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Возможности', 'h1', '2xl'),
          p(
            '<p>Краткий каталог того, что уже есть в системе. Полный путь установки и публикации — на странице <a href="/workflow">Как это работает</a>. Список встроенных модулей — на странице <a href="/cms-modules">Модули</a>.</p>',
          ),
        ]),
        section([
          features('Для сайта и контента', [
            { icon: 'layout', title: 'Редактор страниц', body: 'Собирайте страницы из блоков в админке: заголовки, тексты, галереи, формы, карточки и другие виджеты.' },
            { icon: 'file', title: 'Контент без правки кода', body: 'Страницы, меню, медиа и SEO правятся в админке. Тексты не нужно менять в репозитории ради каждой правки.' },
            { icon: 'megaphone', title: 'Блог', body: 'Публикуйте статьи с обложками, excerpt и отдельными SEO-полями.' },
            { icon: 'image', title: 'Медиатека', body: 'Загружайте изображения и файлы в одно место и подставляйте их в страницы и посты.' },
            { icon: 'search', title: 'SEO', body: 'Title, description, Open Graph, sitemap и поддержка индексации для SPA.' },
            { icon: 'palette', title: 'Тема сайта', body: 'Цвета, шрифты и визуальный каркас настраиваются без пересборки проекта.' },
          ]),
        ]),
        section([
          features('Для команды и доступа', [
            { icon: 'users', title: 'Пользователи и роли', body: 'Разделяйте права: кто правит контент, кто управляет системой, кто только смотрит.' },
            { icon: 'shield', title: 'Безопасный вход', body: 'Вход в админку с паролем, при необходимости — двухфакторная проверка и журнал действий.' },
            { icon: 'mail', title: 'Формы и почта', body: 'Принимайте обращения с сайта и отправляйте уведомления на почту или в мессенджер.' },
            { icon: 'message', title: 'Поддержка на сайте', body: 'Чат и FAQ для посетителей — если модуль поддержки включён.' },
          ]),
        ]),
        section([
          features('Для разработки и роста', [
            { icon: 'layers', title: 'Модули', body: 'Включайте только нужные части: блог, магазин, перевод, поддержку и другие. Лишнее можно оставить выключенным.' },
            { icon: 'package', title: 'Пакеты модулей', body: 'Дополнительные возможности ставятся ZIP-пакетом и обновляются отдельно от ядра.' },
            { icon: 'bot', title: 'Работа с AI', body: 'Агент в Cursor или другой IDE может читать карту сайта и менять контент через защищённый доступ. Подробности — на странице MCP.' },
            { icon: 'upload', title: 'Публикация и обновления', body: 'Сайт собирается локально и выкладывается ZIP-пакетом. Обновления из админки сохраняют конфиг, медиа и бэкапы.' },
            { icon: 'server', title: 'Обычный PHP-хостинг', body: 'На сервере нужны PHP и база данных. Постоянный Node.js на production не требуется.' },
            { icon: 'cart', title: 'Магазин (по необходимости)', body: 'Каталог, заказы и оплата подключаются модулями, если сайту нужна витрина.' },
          ]),
        ]),
        section([
          cta('Как всё связать вместе', 'От репозитория до сайта на хостинге — по шагам.', 'Как это работает', '/workflow'),
        ]),
      ],
    },
  },
  {

    title: 'Как это работает',
    slug: 'workflow',
    seo_title: 'Как работает Jasefly CMS — от установки до сайта на хостинге',
    seo_description:
      'Пошаговый путь: установка, наполнение, проверка, сборка ZIP, публикация на PHP-хостинг и обновления из админки.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Как это работает', 'h1', '2xl'),
          p('<p>Один понятный цикл: собираете сайт локально, публикуете на обычный хостинг, дальше правите контент в админке или с помощью AI.</p>'),
        ]),
        section([
          features(
            'Путь от идеи до публикации',
            [
              { icon: '1', title: 'Установите локально', body: 'Клонируйте репозиторий или поставьте install-пакет. Поднимите PHP API и админку у себя.' },
              { icon: '2', title: 'Соберите структуру сайта', body: 'Создайте страницы в редакторе, настройте меню, тему и SEO. Включите только нужные модули.' },
              { icon: '3', title: 'Наполните контент', body: 'Тексты и медиа — через админку. При желании поручите черновики AI, а результат проверьте сами.' },
              { icon: '4', title: 'Проверьте локально', body: 'Откройте публичные страницы и админку, убедитесь что формы, меню и черновики работают.' },
              { icon: '5', title: 'Соберите production-пакет', body: 'Frontend собирается локально. На хостинг уходят готовые файлы и PHP API — без Node.js на сервере.' },
              { icon: '6', title: 'Опубликуйте', body: 'Первый раз — install ZIP и мастер установки. Дальше — update ZIP через админку или управляемый деплой.' },
              { icon: '7', title: 'Ведите сайт', body: 'Меняйте страницы, блог и настройки без пересборки всего проекта. Обновления ядра — отдельным пакетом.' },
              { icon: '8', title: 'Развивайте модулями', body: 'Новая функция — отдельный модуль или пакет, а не правка ядра «на живую».' },
            ],
            2,
          ),
        ]),
        section([
          p(
            '<p>Подробнее про hosting без Node.js — на странице <a href="/shared-hosting">Shared Hosting</a>. Про обновления ZIP — на странице <a href="/updates">Обновления</a>. Про доступ AI — на странице <a href="/mcp">MCP и AI</a>.</p>',
          ),
          cta('Нужна справка по установке?', 'Короткие ответы и ссылки на связанные разделы.', 'Документация', '/docs'),
        ]),
      ],
    },
  },
  {

    title: 'Модули',
    slug: 'cms-modules',
    seo_title: 'Модули Jasefly CMS — что можно включить на сайте',
    seo_description:
      'Система, контент, блог, медиа, SEO, магазин, платежи, перевод, поддержка и другие модули. Включайте только то, что нужно проекту.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Модули', 'h1', '2xl'),
          p(
            '<p>Модуль — отдельная возможность, которую можно включить или выключить. Ниже список того, что уже есть в поставке. Это не прайс и не обещание платных дополнений: модули поставляются вместе с CMS или как устанавливаемые пакеты.</p>',
          ),
        ]),
        section([
          features('Основа', [
            { icon: 'settings', title: 'System', body: 'Настройки сайта, плагины, обновления, бэкапы, журнал и диагностика.' },
            { icon: 'users', title: 'Users', body: 'Администраторы, роли, вход и двухфакторная проверка.' },
            { icon: 'file', title: 'Content', body: 'Страницы, навигация, тема и базовый контент сайта.' },
            { icon: 'image', title: 'Media', body: 'Загрузка и хранение файлов для страниц и постов.' },
          ]),
        ]),
        section([
          features('Контент и продвижение', [
            { icon: 'megaphone', title: 'Blog', body: 'Статьи, категории и публичная лента.' },
            { icon: 'briefcase', title: 'Projects / Portfolio', body: 'Кейсы и портфолио — если сайт показывает работы.' },
            { icon: 'search', title: 'SEO', body: 'Метаданные, редиректы и поддержка поисковой выдачи.' },
            { icon: 'mail', title: 'Mail / Forms', body: 'Обращения с сайта и почтовые уведомления.' },
          ]),
        ]),
        section([
          features('По желанию', [
            { icon: 'shop', title: 'Products / Payments / Orders', body: 'Каталог, оплата и заказы — только если нужна витрина.' },
            { icon: 'globe', title: 'Translate', body: 'Перевод публичных страниц поверх уже собранного сайта.' },
            { icon: 'message', title: 'Support', body: 'Чат и FAQ для посетителей.' },
            { icon: 'shield', title: 'DDoS / Registration / Lab', body: 'Защита, публичная регистрация и экспериментальные страницы — по необходимости.' },
          ]),
        ]),
        section([
          p(
            '<p>Доступ AI к сайту и деплой через агента — это не отдельные «платные модули», а инструменты вокруг CMS. Разбор — на странице <a href="/mcp">MCP и AI</a>.</p>',
          ),
          cta('Как выбрать набор для своего сайта', 'Начните с основы и добавляйте модули по задаче.', 'Возможности', '/features'),
        ]),
      ],
    },
  },
  {

    title: 'MCP и AI',
    slug: 'mcp',
    seo_title: 'MCP и AI в Jasefly CMS — безопасная работа агента с сайтом',
    seo_description:
      'Как AI получает карту сайта, правит контент и запускает проверку обновлений через токен API — без SSH и без хаотичных запросов.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('MCP и AI', 'h1', '2xl'),
          p(
            '<p>MCP (Model Context Protocol) — способ подключить AI-агента к понятным инструментам CMS. Агент не получает «весь сервер». Он работает через API с отдельным токеном: читает карту сайта, обновляет контент, при необходимости запускает проверку и деплой.</p>',
          ),
        ]),
        section([
          faq('Что важно понимать', [
            {
              q: 'Зачем это обычному сайту?',
              a: 'Чтобы поручать AI рутину: собрать черновик страницы, обновить тексты, проверить структуру. Редактор по-прежнему может всё делать руками в админке.',
            },
            {
              q: 'Чем это отличается от «дать нейросети пароль от хостинга»?',
              a: 'Токен открывает только операции CMS API. Это не SSH и не произвольные файлы сервера. Поверхность меньше, но секрет токена всё равно нужно хранить бережно.',
            },
            {
              q: 'Как агент ориентируется на сайте?',
              a: 'Сначала берёт карту страниц и меню, затем выжимку нужной страницы. Так он не перебирает API наугад и меньше нагружает shared-хостинг.',
            },
            {
              q: 'Что можно автоматизировать?',
              a: 'Контент, настройки, пакетные правки, локальную сборку и управляемый выпуск обновления — в рамках выданных прав. Человек остаётся ответственным за результат.',
            },
            {
              q: 'Какие есть ограничения?',
              a: 'Есть паузы и лимиты запросов, чтобы не «задушить» хостинг. MCP не заменяет code review и не гарантирует идеальный текст без проверки.',
            },
          ]),
        ]),
        section([
          features('Типичный порядок работы', [
            { icon: 'map', title: 'Карта сайта', body: 'Агент видит страницы, меню и основные настройки одним снимком.' },
            { icon: 'file', title: 'Правка контента', body: 'Обновляет тексты и блоки в рамках уже существующей структуры страницы.' },
            { icon: 'check', title: 'Проверка', body: 'Вы смотрите результат в админке или на превью до публикации.' },
            { icon: 'upload', title: 'Выпуск', body: 'Если менялся код — собирается пакет, пишется журнал изменений и выполняется проверка «сайт жив».' },
          ]),
        ]),
        section([
          cta('Куда публиковать результат', 'Production остаётся на PHP и базе данных.', 'Shared Hosting', '/shared-hosting'),
        ]),
      ],
    },
  },
  {

    title: 'Shared Hosting',
    slug: 'shared-hosting',
    seo_title: 'Jasefly CMS на shared-хостинге — без Node.js на сервере',
    seo_description:
      'Frontend собирается локально, на хостинг уходят готовые файлы и PHP API. Когда хватает обычного хостинга и когда нужен VPS.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Shared Hosting', 'h1', '2xl'),
          p(
            '<p>Jasefly рассчитана на привычный хостинг: PHP и MySQL. Сложная сборка frontend остаётся на вашем компьютере. На сервер попадает уже готовый результат.</p>',
          ),
        ]),
        section([
          features('Как устроен production', [
            { icon: 'laptop', title: 'Сборка локально', body: 'React-интерфейс собирается у вас через Vite. На сервере не нужно запускать npm.' },
            { icon: 'server', title: 'PHP API', body: 'Данные, вход, медиа, модули и API работают на PHP — том, что умеет обычный хостинг.' },
            { icon: 'layout', title: 'Статический frontend', body: 'Посетитель получает готовую оболочку сайта и assets рядом с API.' },
            { icon: 'package', title: 'Установка ZIP', body: 'Распаковываете пакет, указываете базу в мастере установки, создаёте администратора.' },
          ]),
        ]),
        section([
          h('Когда обычного хостинга достаточно', 'h2', 'lg'),
          p(
            '<p>Сайт в основном показывает страницы и формы, нагрузка предсказуемая, нет постоянных фоновых воркеров и WebSocket. Тогда ZIP-пакет и PHP API закрывают задачу без администрирования отдельного сервера.</p>',
          ),
          h('Когда лучше взять VPS', 'h2', 'lg'),
          p(
            '<p>Нужны долгие фоновые задачи, realtime, игровые сервисы, нестандартные системные зависимости или постоянный Node-процесс. Jasefly не утверждает, что VPS «не нужен никогда» — она убирает лишнюю серверную сложность там, где её действительно нет в задаче.</p>',
          ),
          features('Минимальные требования', [
            { icon: 'check', title: 'PHP 8.2+', body: 'С обычными расширениями для работы с БД, JSON и шифрованием.' },
            { icon: 'database', title: 'MySQL / MariaDB', body: 'Основная база для production. Для локальных проб возможен SQLite.' },
            { icon: 'globe', title: 'HTTPS и ZIP', body: 'Веб-сервер с HTTPS и возможность загрузить архив в корень сайта.' },
          ], 3),
        ]),
        section([
          cta('Как обновлять без потери данных', 'Install и update — разные пакеты.', 'Обновления', '/updates'),
        ]),
      ],
    },
  },
  {

    title: 'Документация',
    slug: 'docs',
    seo_title: 'Документация Jasefly CMS — с чего начать',
    seo_description:
      'Краткий указатель: требования, установка, локальный запуск, модули, обновления, API и безопасность. Глубокие гайды пополняются.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Документация', 'h1', '2xl'),
          p(
            '<p>Это входная точка, а не полный учебник на сотни страниц. Ниже — куда идти по теме. Подробные пошаговые гайды со скриншотами постепенно дополняются; актуальный код и README — в репозитории на GitHub.</p>',
          ),
        ]),
        section([
          faq(
            'С чего начать',
            [
              {
                q: 'Системные требования',
                a: 'Production: PHP 8.2+, MySQL, HTTPS. Локально для сборки интерфейса нужны Node.js и npm.',
              },
              {
                q: 'Первая установка',
                a: 'Install ZIP → мастер установки → создать администратора → удалить установщик. См. также Shared Hosting.',
              },
              {
                q: 'Локальная разработка',
                a: 'Репозиторий: backend на PHP, frontend на Vite. Контент ведите в CMS; код — в git.',
              },
              {
                q: 'Страницы и модули',
                a: 'Редактор страниц и список модулей описаны на страницах Возможности и Модули.',
              },
              {
                q: 'Публикация и обновления',
                a: 'Сборка локально, на хостинг — ZIP. Разница install/update — на странице Обновления.',
              },
              {
                q: 'AI и API',
                a: 'Доступ агента — MCP и AI. Человекочитаемый обзор HTTP API — на странице API.',
              },
              {
                q: 'Безопасность',
                a: 'Роли, 2FA, секреты вне git, бэкапы. Политика и условия — в подвале сайта; их нужно адаптировать под свою юрисдикцию.',
              },
            ],
            'Короткие ответы со ссылками на связанные разделы сайта.',
          ),
        ]),
        section([
          cta('Остались вопросы по продукту?', 'Напишите через форму — без обещаний SLA.', 'Контакты', '/contact'),
        ]),
      ],
    },
  },
  {

    title: 'Обновления',
    slug: 'updates',
    seo_title: 'Обновления Jasefly CMS — install и update ZIP',
    seo_description:
      'Чем install отличается от update, что сохраняется при обновлении и какой порядок действий безопаснее на shared-хостинге.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Обновления', 'h1', '2xl'),
          p(
            '<p>Обновление сайта — не «залить архив поверх наугад». Jasefly разделяет пакет первой установки и пакет обновления, чтобы не затирать то, что принадлежит вашей площадке.</p>',
          ),
        ]),
        section([
          features('Два типа пакетов', [
            {
              icon: 'package',
              title: 'Install',
              body: 'Для новой площадки: полный набор файлов и мастер установки базы и администратора.',
            },
            {
              icon: 'refresh',
              title: 'Update',
              body: 'Для уже работающего сайта: runtime и миграции. Не предназначен стирать медиатеку и локальные секреты.',
            },
            {
              icon: 'shield',
              title: 'Что обычно сохраняется',
              body: 'Локальная конфигурация, загруженные файлы, журналы и ранее сделанные бэкапы.',
            },
            {
              icon: 'database',
              title: 'Миграции',
              body: 'После замены файлов система накатывает нужные изменения схемы. Не пропускайте шаг проверки.',
            },
          ]),
        ]),
        section([
          h('Рекомендуемый порядок', 'h2', 'lg'),
          p(
            '<ol><li>Сделайте бэкап базы и критичных файлов.</li><li>Соберите update из нужного состояния проекта.</li><li>Загрузите ZIP в панели обновлений.</li><li>Дождитесь проверки пакета, применения файлов и миграций.</li><li>Проверьте публичные страницы и админку (лучше обновить кэш браузера).</li></ol>',
          ),
          cta('Смотреть весь цикл целиком', 'От локальной машины до хостинга.', 'Как это работает', '/workflow'),
        ]),
      ],
    },
  },
  {

    title: 'О проекте',
    slug: 'about',
    seo_title: 'О проекте Jasefly CMS — независимая разработка IIA3UK',
    seo_description:
      'Jasefly CMS делает независимый разработчик IIA3UK: свой стек для сайтов, модулей и публикации на обычный хостинг.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('О проекте', 'h1', '2xl'),
          p(
            '<p>Jasefly CMS — независимый проект разработчика <strong>IIA3UK</strong>. Это не компания и не агентство: один автор развивает платформу, которой сам пользуется для сайтов и заказных задач.</p>',
          ),
        ]),
        section([
          features('Зачем это сделано', [
            { icon: 'code', title: 'Свой контролируемый стек', body: 'Понятное ядро вместо бесконечной зависимости от чужой CMS и случайных плагинов.' },
            { icon: 'layers', title: 'Расширение модулями', body: 'Новая область — отдельный модуль, а не патч «куда придётся».' },
            { icon: 'layout', title: 'Админка для ежедневной работы', body: 'Контент и публикация доступны без обязательного погружения в код.' },
            { icon: 'bot', title: 'Место для AI', body: 'Если вы уже работаете в Cursor, агент может помогать с контентом и развитием проекта через управляемый доступ.' },
            { icon: 'server', title: 'Хостинг без лишней сложности', body: 'Production остаётся на PHP и базе данных — там, где это уместно задаче.' },
          ]),
        ]),
        section([
          p(
            '<p>Если нашли ошибку, хотите предложить улучшение или обсудить использование CMS — напишите через <a href="/contact">Контакты</a>. Ответы не обещают SLA: это открытый соло-проект.</p>',
          ),
          cta('Связаться', 'Форма на сайте и адрес электронной почты.', 'Контакты', '/contact'),
        ]),
      ],
    },
  },
  {

    title: 'Контакты',
    slug: 'contact',
    seo_title: 'Контакты Jasefly CMS — вопросы и предложения',
    seo_description:
      'Напишите о CMS, ошибках, идеях модулей или сотрудничестве. Укажите суть задачи и как с вами связаться.',
    template: 'system',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Контакты', 'h1', '2xl'),
          p(
            '<p>Напишите, если хотите задать вопрос о Jasefly CMS, сообщить об ошибке, предложить идею или обсудить сотрудничество. Почта: <a href="mailto:jasefly@jasefly.com">jasefly@jasefly.com</a>. Ответ приходит по мере возможности — без обещанного срока реакции.</p>',
          ),
          features('Что полезно указать в сообщении', [
            { icon: 'message', title: 'Суть запроса', body: 'Вопрос по установке, модулю, обновлению, багу или идее.' },
            { icon: 'globe', title: 'Контекст', body: 'Адрес сайта, версия/пакет, что уже пробовали.' },
            { icon: 'mail', title: 'Как ответить', body: 'Рабочий email, если пишете не с него.' },
            { icon: 'shield', title: 'Приватность', body: 'Не присылайте пароли и токены в открытом виде.' },
          ]),
          widget('contact-form', {
            title: 'Форма сообщения',
            subtitle: 'Кратко опишите задачу или вопрос.',
          }),
        ]),
      ],
    },
  },
  {

    title: 'Политика конфиденциальности',
    slug: 'privacy',
    seo_title: 'Политика конфиденциальности — Jasefly CMS',
    seo_description:
      'Какие данные может обрабатывать сайт jasefly.com: форма обратной связи, технические журналы, cookies для работы сайта.',
    template: 'builder',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Политика конфиденциальности', 'h1', '2xl'),
          p(
            '<p><strong>Важно.</strong> Это понятное описание текущей практики сайта продукта. Это не замена индивидуальной юридической консультации. Если вы ставите Jasefly на свой домен — адаптируйте текст под своего оператора, юрисдикцию и подключённые сервисы.</p>',
          ),
          p(
            `<h2>1. Оператор</h2>
<p>Сайт jasefly.com ведёт независимый разработчик IIA3UK. Связь: форма на странице «Контакты» и email jasefly@jasefly.com.</p>
<h2>2. Какие данные обрабатываются</h2>
<ul>
<li>сообщения из формы обратной связи (текст и указанные вами контакты);</li>
<li>данные входа в админку (для сотрудников сайта);</li>
<li>технические журналы для диагностики и безопасности;</li>
<li>необходимые cookies для работы сайта и сессии.</li>
</ul>
<p>Отдельная маркетинговая аналитика, пиксели рекламы и платёжные данные посетителей на этом сайте не заявляются, пока соответствующие сервисы не подключены явно.</p>
<h2>3. Зачем нужны данные</h2>
<p>Чтобы отвечать на обращения, обеспечивать вход в админку, поддерживать безопасность и диагностировать сбои.</p>
<h2>4. Хранение и защита</h2>
<p>Данные размещаются на хостинге сайта. Доступ к админке ограничивается учётками и правами. Абсолютная безопасность не гарантируется ни одним сайтом.</p>
<h2>5. Передача третьим лицам</h2>
<p>Мы не продаём данные обращений. Передача возможна хостинг-провайдеру в рамках работы инфраструктуры или по требованию закона.</p>
<h2>6. Ваши запросы</h2>
<p>Уточнение, исправление или удаление данных из обращений — через контакты. Для служебных учёток действуют правила доступа администратора.</p>
<p><em>Дата обновления описания: 28 июля 2026 г.</em></p>`,
          ),
        ]),
      ],
    },
  },
  {

    title: 'Блог',
    slug: 'blog',
    seo_title: 'Блог Jasefly CMS — хостинг, обновления и MCP',
    seo_description:
      'Статьи о публикации на shared-хостинге, безопасных обновлениях и работе AI с CMS.',
    template: 'system',
    layout: {
      version: 1,
      meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
      elements: [
        section([
          h('Блог', 'h1', '2xl'),
          p(
            '<p>Короткие разборы практических тем: когда хватает обычного хостинга, как устроены обновления и чем полезен управляемый доступ AI к CMS. Это не дублирует главную — здесь подробности по одной теме на статью.</p>',
          ),
          widget('blog-list', { title: 'Свежие материалы', limit: 12 }),
        ]),
      ],
    },
  },
]

const apiDocs = {
  title: 'API',
  slug: 'api-docs',
  status: 'published',
  template: 'builder',
  seo_title: 'API Jasefly CMS — обзор для людей и интеграций',
  seo_description:
    'Как устроен HTTP API: базовый URL, авторизация, публичные и admin-методы, контент и машиночитаемый индекс /docs.',
  layout: {
    version: 1,
    meta: { product: 'jasefly-official', revision: 'visitor-copy-2026-07-28' },
    elements: [
      section([
        h('API Jasefly CMS', 'h1', '2xl'),
        p(
          '<p>HTTP API нужен интеграциям, админке и AI-агентам. Базовый URL production: <code>https://jasefly.com/api/v1</code>. Краткий машиночитаемый индекс: <code>GET /api/v1/docs</code>.</p>',
        ),
        p(
          '<p>Если вы настраиваете сайт руками — чаще достаточно админки. Если пишете скрипт или подключаете агента — начните с авторизации и карты сайта, не перебирайте эндпоинты циклами.</p>',
        ),
      ]),
      section([
        features('Базовые правила', [
          { icon: 'key', title: 'Авторизация', body: 'Публичные чтения открыты. Админ-операции требуют access-токен или MCP-токен с нужными правами.' },
          { icon: 'map', title: 'Сначала карта', body: 'Для контента используйте карту сайта и digest страницы — меньше лишних запросов к хостингу.' },
          { icon: 'file', title: 'Контент и singleton', body: 'Страницы, блог и настройки вроде темы/SEO доступны через CRUD и отдельные singleton-эндпоинты.' },
          { icon: 'layout', title: 'Page Builder', body: 'Страница хранит layout как дерево секций, колонок и виджетов. Меняйте тексты внутри существующих блоков, не ломая структуру без нужды.' },
        ]),
      ]),
      section([
        p(
          '<p>Подробные схемы методов смотрите в OpenAPI/индексе API на сервере и в репозитории. Обзор доступа AI — на странице <a href="/mcp">MCP и AI</a>.</p>',
        ),
        cta('Вернуться к документации', 'Указатель разделов для старта.', 'Документация', '/docs'),
      ]),
    ],
  },
}

async function listPages() {
  const res = await client.get('/admin/pages')
  const rows = res?.data ?? res ?? []
  return Array.isArray(rows) ? rows : []
}

async function findPageBySlug(slug, pages) {
  const list = pages || (await listPages())
  const aliases = slug === 'cms-modules' ? ['cms-modules', 'modules'] : [slug]
  return list.find((p) => aliases.includes(p.slug)) || null
}

async function putPage(page, pages) {
  const existing = await findPageBySlug(page.slug, pages)
  if (!existing?.id) throw new Error(`page not found for slug=${page.slug}`)
  const data = {
    title: page.title,
    slug: page.slug,
    status: 'published',
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    template: page.template || 'builder',
    layout: page.layout,
  }
  console.log('update', page.slug, 'id=' + existing.id)
  await client.put(`/admin/pages/${existing.id}`, data)
}

async function ensureApiDocs(pages) {
  const existing = await findPageBySlug('api-docs', pages)
  if (existing?.id) {
    console.log('update api-docs id=' + existing.id)
    await client.put(`/admin/pages/${existing.id}`, { ...apiDocs, status: 'published' })
    return existing.id
  }
  console.log('create api-docs')
  const res = await client.post('/admin/pages', { ...apiDocs, status: 'published' })
  return res?.data?.id ?? res?.id
}

async function patchHome(pages) {
  const home =
    (await findPageBySlug('__home', pages))
    || pages.find((p) => p.is_home)
    || (await findPageBySlug('home', pages))
  if (!home?.id) throw new Error('home page not found by slug')
  const row = (await client.get(`/admin/pages/${home.id}`))?.data ?? (await client.get(`/admin/pages/${home.id}`))
  const layout = row.layout || (row.layout_json ? JSON.parse(row.layout_json) : null)
  if (!layout?.elements) throw new Error('home layout missing')

  const byType = { 'mcp-inspector': [], 'cta-block': [], 'hero-block': [] }
  const collect = (nodes) => {
    for (const n of nodes || []) {
      if (n.elType === 'widget' && byType[n.widgetType]) byType[n.widgetType].push(n)
      if (n.elements) collect(n.elements)
    }
  }
  collect(layout.elements)
  for (const [type, list] of Object.entries(byType)) {
    if (list.length === 0) throw new Error(`home missing widgetType=${type}`)
    if (list.length > 1) throw new Error(`ambiguous home widgetType=${type} count=${list.length}`)
  }

  const mcp = byType['mcp-inspector'][0]
  mcp.settings = {
    ...mcp.settings,
    caption: 'Админка для ежедневной работы · AI — когда нужно развить проект',
    preview_text:
      'Редактор меняет страницы и публикации в привычной панели. AI помогает с черновиками, структурой и повторяющимися задачами — результат вы проверяете до публикации.',
    tools: [{ label: 'Карта сайта' }, { label: 'Выжимка страницы' }, { label: 'Обновление контента' }, { label: 'Проверка' }],
    operations: [
      { label: 'Чтение структуры сайта', icon: 'box', status: 'OK' },
      { label: 'Подготовка правок', icon: 'database', status: 'OK' },
      { label: 'Проверка перед публикацией', icon: 'network', status: 'OK' },
    ],
    rights: [
      { label: 'Права на контент', icon: 'shield' },
      { label: 'Отдельный доступ агента', icon: 'key' },
    ],
  }

  const ctaBlock = byType['cta-block'][0]
  ctaBlock.settings = {
    ...ctaBlock.settings,
    title: 'Начните с установки и первого сайта под свою задачу',
    subtitle: 'Откройте репозиторий, поставьте CMS локально или на хостинг и соберите структуру в админке.',
    cta1_label: 'Открыть на GitHub',
    cta1_href: 'https://github.com/iia3uk/jasefly',
    cta2_label: 'Как это работает',
    cta2_href: '/workflow',
  }

  const hero = byType['hero-block'][0]
  hero.settings = {
    ...hero.settings,
    body: 'Jasefly — готовая модульная CMS. Ведите сайт через админку или развивайте проект вместе с AI. Большинство нужных возможностей уже есть после установки.',
  }

  layout.meta = {
    ...(layout.meta || {}),
    revision: 'visitor-copy-home-cta-2026-07-28',
    useOnSite: true,
    seed: false,
  }

  console.log('update home id=' + home.id, 'slug=' + home.slug, '(by widgetType, unique)')
  await client.put(`/admin/pages/${home.id}`, {
    seo_title: 'Jasefly CMS — сайт на PHP-хостинге с админкой и AI',
    seo_description:
      'Модульная CMS: редактор страниц, роли, SEO, обновления ZIP и публикация на обычный хостинг. Админка для ежедневной работы, AI — для развития проекта.',
    layout,
  })
}

async function patchTerms(pages) {
  const page = await findPageBySlug('terms', pages)
  if (!page?.id) throw new Error('terms page not found')
  const content = `<h1>Условия использования</h1>
<p>Настоящие условия описывают использование сайта jasefly.com и программного обеспечения Jasefly CMS.</p>
<h2>1. Принятие условий</h2>
<p>Открывая сайт или используя Jasefly CMS, вы подтверждаете, что ознакомились с этими условиями и <a href="/privacy">политикой конфиденциальности</a>.</p>
<h2>2. Программное обеспечение</h2>
<p>Jasefly CMS распространяется как открытый проект. Права на код определяются лицензией репозитория на GitHub. Материалы сайта помогают понять продукт и не являются индивидуальной офертой услуг.</p>
<h2>3. Контент сайта</h2>
<p>Тексты и описания предоставляются «как есть» и могут обновляться без отдельного уведомления каждого посетителя.</p>
<h2>4. Ответственность</h2>
<p>Сайт и CMS предоставляются без гарантий. Автор не отвечает за убытки из‑за настройки вашего хостинга, ошибок конфигурации, действий третьих лиц или использования ПО не по назначению.</p>
<h2>5. Обратная связь</h2>
<p>Вопросы — через страницу <a href="/contact">Контакты</a>.</p>
<h2>6. Конфиденциальность</h2>
<p>Обработка данных описана в <a href="/privacy">Политике конфиденциальности</a>.</p>
<p><em>Информационный шаблон. При публикации на своём домене дополните юридически значимыми пунктами.</em></p>`
  console.log('update terms id=' + page.id)
  await client.put(`/admin/pages/${page.id}`, {
    title: 'Условия использования',
    slug: 'terms',
    status: 'published',
    seo_title: 'Условия использования — Jasefly CMS',
    seo_description:
      'Условия использования сайта jasefly.com и ПО Jasefly CMS: лицензия репозитория, ограничение ответственности, контакты.',
    content,
    layout: null,
  })
}

async function patchSingletonsAndNav() {
  console.log('put profile/hero/footer/contact-info')
  await client.put('/admin/profile', {
    name: 'Jasefly CMS',
    job_title: 'IIA3UK',
    short_bio: 'Модульная CMS для сайтов на PHP-хостинге: админка для ежедневной работы и возможность развивать проект с AI.',
  })
  await client.put('/admin/hero', {
    headline: 'Не ищите ещё один плагин. Соберите сайт таким, каким он нужен именно вам.',
    subheadline:
      'Jasefly — готовая модульная CMS. Ведите сайт через админку или развивайте проект вместе с AI. Большинство нужных возможностей уже есть после установки.',
    badge_text: 'Работает на обычном PHP-хостинге',
    primary_cta_label: 'Попробовать Jasefly',
    primary_cta_href: 'https://github.com/iia3uk/jasefly',
    secondary_cta_label: 'Посмотреть, как это работает',
    secondary_cta_href: '/workflow',
  })
  await client.put('/admin/contact-info', {
    email: 'jasefly@jasefly.com',
    form_enabled: 1,
    form_success_message: 'Спасибо! Сообщение получено — отвечу, как смогу.',
  })
  await client.put('/admin/footer', {
    copyright_text: '© {year} Jasefly CMS',
    tagline: 'Независимый проект IIA3UK. Если CMS полезна — можно поддержать.',
    show_social: 1,
    columns_json: JSON.stringify([
      {
        title: 'Продукт',
        links: [
          { href: '/features', label: 'Возможности' },
          { href: '/workflow', label: 'Как это работает' },
          { href: '/cms-modules', label: 'Модули' },
          { href: '/updates', label: 'Обновления' },
        ],
      },
      {
        title: 'Ресурсы',
        links: [
          { href: '/docs', label: 'Документация' },
          { href: '/api-docs', label: 'API' },
          { href: '/mcp', label: 'MCP и AI' },
          { href: '/blog', label: 'Блог' },
          { href: '/shared-hosting', label: 'Shared Hosting' },
          { href: 'https://github.com/iia3uk/jasefly', label: 'GitHub' },
        ],
      },
      {
        title: 'О проекте',
        links: [
          { href: '/about', label: 'О проекте' },
          { href: '/contact', label: 'Контакты' },
          { href: '/privacy', label: 'Конфиденциальность' },
          { href: '/terms', label: 'Условия' },
          { href: 'https://pay.cloudtips.ru/p/4cbdc8ab', label: 'Поддержать' },
        ],
      },
    ]),
  })
  await client.put('/admin/seo', {
    site_title: 'Jasefly CMS — модульная CMS на PHP-хостинге',
    site_description:
      'Готовая CMS с редактором страниц, модулями и обновлениями ZIP. Админка для контента, AI для развития проекта, production без Node.js.',
  })
  await client.put('/admin/site-settings', {
    cookie_banner_text:
      'Мы используем необходимые cookies для работы сайта. Подробнее — в политике конфиденциальности.',
  })

  const navRes = await client.get('/admin/navigation')
  const nav = navRes?.data ?? navRes ?? []
  const list = Array.isArray(nav) ? nav : []
  const github = list.find((n) => /github\.com\/iia3uk\/jasefly/i.test(String(n.href || '')))
  if (github?.id) {
    console.log('update github nav id=' + github.id)
    await client.put(`/admin/navigation/${github.id}`, {
      label: 'Открыть на GitHub',
      href: 'https://github.com/iia3uk/jasefly',
      location: github.location || 'header',
      sort_order: github.sort_order,
      is_visible: 1,
    })
  }
  const modulesNav = list.find((n) => ['/modules', '/cms-modules'].includes(String(n.href || '').replace(/\/$/, '')))
  if (modulesNav?.id) {
    console.log('update modules nav id=' + modulesNav.id)
    await client.put(`/admin/navigation/${modulesNav.id}`, {
      label: modulesNav.label || 'Модули',
      href: '/cms-modules',
      location: modulesNav.location || 'header',
      sort_order: modulesNav.sort_order,
      is_visible: modulesNav.is_visible ?? 1,
    })
  }
}

async function patchBlogPostsLight() {
  const res = await client.get('/admin/blog')
  const posts = res?.data ?? res ?? []
  const list = Array.isArray(posts) ? posts : []
  const updates = [
    {
      slug: 'why-a-modern-website-does-not-always-need-a-vps',
      seo_title: 'Почему сайту не всегда нужен VPS',
      seo_description: 'Когда обычного PHP-хостинга достаточно, а когда отдельный сервер действительно оправдан.',
      excerpt: 'VPS полезен не каждому сайту. Разбираем, когда хватает обычного хостинга и готовой сборки.',
    },
    {
      slug: 'how-jasefly-works-on-shared-hosting',
      seo_title: 'Как Jasefly CMS работает на shared-хостинге',
      seo_description: 'Локальная сборка frontend, PHP API на сервере и установка из ZIP без Node.js на production.',
      excerpt: 'React собирается локально, на хостинг уходят готовые файлы и PHP API.',
    },
    {
      slug: 'what-is-mcp-for-cms',
      seo_title: 'Что такое MCP для CMS',
      seo_description: 'Как AI-агент получает карту сайта и работает через токен API без хаотичного перебора запросов.',
      excerpt: 'MCP даёт агенту набор инструментов со схемами — вместо угадывания внутренних URL.',
    },
    {
      slug: 'local-build-and-safe-website-updates',
      seo_title: 'Локальная сборка и безопасные обновления сайта',
      seo_description: 'Чем install отличается от update и какой порядок снижает риск при выпуске изменений.',
      excerpt: 'Сборка локально, update ZIP в админку, миграции под контролем.',
    },
  ]
  for (const u of updates) {
    const post = list.find((p) => p.slug === u.slug)
    if (!post?.id) {
      console.warn('blog skip missing slug', u.slug)
      continue
    }
    console.log('blog', u.slug, 'id=' + post.id)
    await client.put(`/admin/blog/${post.id}`, {
      seo_title: u.seo_title,
      seo_description: u.seo_description,
      excerpt: u.excerpt,
    })
  }
}

async function main() {
  const resume = process.env.RESUME_FROM || ''
  const skipUntil = (slug) => {
    if (!resume) return false
    const order = [
      'features',
      'workflow',
      'cms-modules',
      'mcp',
      'shared-hosting',
      'docs',
      'updates',
      'about',
      'contact',
      'privacy',
      'blog',
    ]
    const ri = order.indexOf(resume === 'modules' ? 'cms-modules' : resume)
    const si = order.indexOf(slug)
    return ri >= 0 && si >= 0 && si < ri
  }

  const pagesIndex = await listPages()

  if (!resume) {
    await patchSingletonsAndNav()
    await patchHome(pagesIndex)
  } else {
    console.log('RESUME_FROM=', resume)
  }
  for (const page of pages) {
    if (skipUntil(page.slug)) {
      console.log('skip', page.slug)
      continue
    }
    n = 0
    await putPage(page, pagesIndex)
  }
  n = 0
  await ensureApiDocs(pagesIndex)
  await patchTerms(pagesIndex)
  await patchBlogPostsLight()
  console.log('DONE visitor copy apply')
}

main().catch((e) => {
  console.error(e.message || e)
  if (e.payload) console.error(JSON.stringify(e.payload, null, 2))
  process.exit(1)
})
