/**
 * Home layout — mandatory snap (1 scroll ≈ 1 section) + live UI panels.
 * Run: node content/jasefly-official/build-home-atoms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(__dirname, '_home_atoms_layout.json')

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function section(opts, columns) {
  const cols = columns.map((widgets) => ({
    id: id('c'),
    elType: 'column',
    settings: { width: Math.round((100 / columns.length) * 100) / 100 },
    elements: widgets.map((w) => ({
      id: id('w'),
      elType: 'widget',
      widgetType: w.type,
      settings: w.settings || {},
    })),
  }))
  const snapOff = opts.scroll_snap === 'off'
  return {
    id: id('s'),
    elType: 'section',
    settings: {
      paddingY: opts.paddingY ?? 'clamp(2.5rem, 5vh, 4rem)',
      gap: opts.gap || '1.75rem',
      columns: columns.length,
      ...(opts.min_height != null ? { min_height: opts.min_height } : {}),
      v_align: opts.v_align ?? 'center',
      scroll_snap: opts.scroll_snap ?? 'start',
      snap_stop: opts.snap_stop ?? (snapOff ? 'normal' : 'always'),
      animation: opts.animation ?? 'fade-up',
      ...(opts.htmlId ? { htmlId: opts.htmlId } : {}),
      ...(opts.glow ? { glow: true } : {}),
      ...(opts.full_bleed ? { full_bleed: true } : {}),
      ...(opts.background ? { background: opts.background } : {}),
    },
    elements: cols,
  }
}

function w(type, settings) {
  return { type, settings }
}

const layout = {
  version: 1,
  meta: {
    product: 'jasefly-official',
    revision: 'copy-one-idea-per-section-2026-07-24',
    useOnSite: true,
    seed: false,
    scroll_snap: 'mandatory',
    scroll_smooth: false,
    snap_height: 'var(--cms-snap-vh)',
    note: 'Each section = full snap viewport, opaque bg, content centered',
  },
  elements: [
    // 1. Hero — что такое Jasefly (без цикла, агентов, хостинга)
    section({
      paddingY: 'clamp(5rem, 12vh, 8rem)',
      min_height: 'min(92dvh, 56rem)',
      v_align: 'center',
      glow: true,
      animation: 'blur-up',
      scroll_snap: 'start',
    }, [[
      w('hero-block', {
        badge: 'PHP 8.3 · React · TypeScript · Vite · MySQL',
        title_1: 'Jasefly CMS',
        title_2: 'Модульная система управления сайтом.',
        body: 'Одно ядро для страниц, ролей и контента. Проект собирается модулями под задачу — без отдельного application server на каждый заказ.',
        cta1_label: 'Открыть документацию',
        cta1_href: '/docs',
        cta2_label: 'Как устроен цикл',
        cta2_href: '#how-it-works',
        layout: 'split',
        align: 'left',
        media_mode: 'background',
        media_id: 10,
        media_url: '/landing/hero.png',
        media_alt: 'Jasefly CMS',
        media_overlay: '0.2',
        media_object_fit: 'cover',
        chips: [
          { label: 'Page Builder' },
          { label: 'Роли и доступ' },
          { label: 'Медиатека' },
          { label: 'SEO' },
        ],
      }),
    ]]),

    // 2. Локальная разработка — IDE → Build → ZIP → Update → Production
    section({ htmlId: 'how-it-works', animation: 'fade-up' }, [[
      w('heading', { text: 'От IDE до production', tag: 'h2', size: 'xl', align: 'center' }),
      w('text', {
        html: '<p style="text-align:center;max-width:36rem;margin:0 auto">Пишете код у себя. Сборка и проверки — до выкладки. На сервер уходит готовый артефакт.</p>',
        align: 'center',
      }),
      w('steps-row', {
        animate: true,
        show_line: true,
        items: [
          { badge: '1', title: 'IDE', text: 'Правки в привычном окружении.' },
          { badge: '2', title: 'Build', text: 'Frontend собирается в статику.' },
          { badge: '3', title: 'Test', text: 'Ошибки ловятся до релиза.' },
          { badge: '4', title: 'ZIP', text: 'Пакет install или update.' },
          { badge: '5', title: 'Update', text: 'Применение через админку.' },
          { badge: '6', title: 'Live', text: 'Сайт снова в рабочем режиме.' },
        ],
      }),
    ]]),

    // 3. Почему не нужен VPS — время и обслуживание (без MCP / ZIP)
    section({ animation: 'fade-up', background: 'rgba(255,255,255,0.015)' }, [[
      w('compare-block', {
        title: 'Меньше часов на обслуживание сервера',
        subtitle: 'Типичный VPS забирает время на патчи, процессы и ритуал деплоя. Здесь эта рутина не становится частью каждого проекта.',
        left_title: 'Типичный VPS',
        right_title: 'С Jasefly',
        left_items: 'Патчи ОС и зависимостей\nСлежение за процессами\nСкрипты деплоя под каждый релиз\nSSH ради мелких правок\nОтдельный runtime под UI',
        right_items: 'Часы возвращаются в продукт\nКонтент правят в админке\nРелиз — операция, не ритуал\nНет Node-процесса на проде\nХватает PHP и MySQL',
        footnote: 'Отдельный VPS остаётся нужен для нестандартных runtime и высокой нагрузки.',
      }),
    ]]),

    // 4. Page Builder — выгода для команды (не список виджетов)
    section({ animation: 'fade-up' }, [[
      w('showcase-block', {
        title: 'Страницы меняются без релиза кода',
        body: 'Редактор собирает макет и публикует черновик. Разработчик не открывает шаблоны ради каждой правки текста.',
        points: 'Черновик до публикации\nSEO рядом со структурой\nОдин холст для команды',
        media_url: '/landing/page-builder.png',
        media_alt: 'Page Builder',
        reverse: false,
      }),
    ]]),

    // 5. MCP — только агенты
    section({ animation: 'fade-up' }, [[
      w('showcase-block', {
        title: 'Агент получает tools, а не весь репозиторий',
        body: 'Через MCP модель видит карту сайта, digest и разрешённые операции. Действует в рамках токена — без произвольного доступа к файлам.',
        points: 'Список tools вместо shell\nScoped-права по токену\nПодтверждение чувствительных шагов',
        media_url: '/landing/mcp-workflow.png',
        media_alt: 'MCP для агентов',
        reverse: true,
      }),
    ]]),

    // 6. Обновления — безопасность (без повторного объяснения ZIP)
    section({ animation: 'fade-up' }, [[
      w('showcase-block', {
        title: 'Релиз с проверками, а не «залить поверх»',
        body: 'Перед включением сверяется манифест, пишется changelog, сохраняются uploads и настройки. План отката задаётся до применения.',
        points: 'Changelog до включения\nПроверки целостности\nКонтент и config не затираются',
        media_url: '/landing/update-zip.png',
        media_alt: 'Безопасные обновления',
        reverse: false,
      }),
    ]]),

    // 7. Возможности — реальные проблемы → выгода (не каталог функций)
    section({ animation: 'scale-in', background: 'rgba(255,255,255,0.015)' }, [[
      w('features-grid', {
        title: 'Какие задачи закрывает',
        subtitle: 'Не перечень экранов — сдвиги в работе команды.',
        columns: 3,
        items: [
          { title: 'Контент меняется чаще кода', body: 'Правки выходят без ожидания деплоя.', icon: 'layout-template' },
          { title: 'Редакторам не нужен сервер', body: 'Роли и доступ живут в админке.', icon: 'users' },
          { title: 'Проект ≠ полный набор модулей', body: 'Включаете только то, что нужно заказу.', icon: 'layers' },
          { title: 'Медиа не в git', body: 'Файлы в хранилище CMS, не в коммитах.', icon: 'image' },
          { title: 'Публикация осознанная', body: 'Черновик отдельно от живого URL.', icon: 'file' },
          { title: 'Аудит действий', body: 'Видно, кто менял страницы и настройки.', icon: 'shield' },
        ],
      }),
    ]]),

    // 8. MCP deeper — механика агента
    section({ animation: 'fade-up' }, [[
      w('heading', { text: 'Как агент работает с сайтом', tag: 'h2', size: 'lg', align: 'left' }),
      w('text', {
        html: '<p>Сначала карта и digest. Затем выбор tool. Затем действие в лимитах токена. Больше структуры — меньше догадок о содержимом.</p>',
        align: 'left',
      }),
      w('mcp-inspector', {
        caption: 'Поверхность tools · не файловая система',
        preview_text: 'Агент оперирует ресурсами CMS: страницы, навигация, настройки — строго по правам токена.',
      }),
    ]]),

    // 9. Pipeline — контрольные точки релиза
    section({ animation: 'fade-up', background: 'rgba(255,255,255,0.015)' }, [[
      w('heading', { text: 'Контрольные точки перед включением', tag: 'h2', size: 'lg', align: 'left' }),
      w('pipeline-panel', {
        active_index: 2,
        caption: 'Статусы видны в админке до и после каждого шага',
        panel_text: 'На этом этапе сверяется changelog и совместимость. Применение стартует только после прохождения проверок.',
        steps: [
          { label: 'Манифест', icon: 'box', text: 'Читается состав пакета и целевая версия.' },
          { label: 'Совместимость', icon: 'network', text: 'Проверяются зависимости и схема БД.' },
          { label: 'Changelog', icon: 'file-minus', text: 'Фиксируется, что изменится на сайте.' },
          { label: 'Применение', icon: 'upload', text: 'Миграции и файлы включаются по порядку.' },
          { label: 'Контроль', icon: 'check', text: 'Сайт отвечает, журнал записан.' },
        ],
      }),
    ]]),

    // 10. Модули — сборка под проект (без AI-преимуществ)
    section({ animation: 'fade-up', v_align: 'center' }, [[
      w('heading', { text: 'Соберите CMS под конкретный проект', tag: 'h2', size: 'lg', align: 'left' }),
      w('module-toggles', {
        caption: 'Модули независимы. Зависимости объявлены явно. Выключаете лишнее — ядро не переписываете.',
        columns: 3,
        items: [
          { label: 'Система', icon: 'settings', on: true, text: 'Ядро, роли, настройки сайта' },
          { label: 'Контент', icon: 'file', on: true, text: 'Страницы, билдер, медиа' },
          { label: 'Блог', icon: 'megaphone', on: true, text: 'Посты и лента' },
          { label: 'Магазин', icon: 'shop', on: false, text: 'Каталог — если нужен заказчику' },
          { label: 'Платежи', icon: 'package', on: false, text: 'Зависит от модуля магазина' },
          { label: 'Агенты', icon: 'network', on: true, text: 'Протокол tools для внешних агентов' },
          { label: 'Переводчик', icon: 'puzzle', on: true, text: 'Языки поверх готовых страниц' },
          { label: 'Поддержка', icon: 'shield', on: true, text: 'Чат и FAQ на сайте' },
          { label: 'Lab', icon: 'box', on: false, text: 'Песочница экспериментов' },
        ],
      }),
    ]]),

    // 11. Кому подходит — аудитория без повторных тезисов
    section({ animation: 'fade-up', background: 'rgba(255,255,255,0.015)' }, [[
      w('features-grid', {
        title: 'Кому это рабочий процесс',
        subtitle: 'Если важны повторяемый релиз и админка для команды.',
        columns: 3,
        items: [
          { title: 'Сольные разработчики', body: 'Один процесс на все клиентские сайты.', icon: 'code-xml' },
          { title: 'Фрилансеры', body: 'Смена проекта без смены стека.', icon: 'users' },
          { title: 'Студии', body: 'Общие соглашения по модулям и билдеру.', icon: 'layers' },
          { title: 'Контент-команды', body: 'Правки без тикета разработчику.', icon: 'file' },
          { title: 'Продуктовые команды', body: 'Сайт в том же релизном цикле, что и код.', icon: 'rocket' },
        ],
      }),
    ]]),

    // 12. Shared hosting angle — почему хватает PHP (без повторного сравнения с VPS)
    section({ animation: 'fade-up' }, [[
      w('heading', { text: 'UI собирается заранее. На хостинге — PHP и MySQL.', tag: 'h2', size: 'lg', align: 'left' }),
      w('stat-row', {
        items: [
          { value: 'React', label: 'UI' },
          { value: 'TypeScript', label: 'Типы' },
          { value: 'Vite', label: 'Сборка' },
          { value: 'PHP 8.3', label: 'Runtime' },
        ],
      }),
      w('chip-row', {
        items: [
          { label: 'React' }, { label: 'TypeScript' }, { label: 'Vite' },
          { label: 'PHP 8.3' }, { label: 'MySQL' }, { label: 'PDO' },
        ],
      }),
    ]]),

    // 13. CTA — мотивация попробовать (не повтор Hero)
    section({ glow: true, animation: 'scale-in', scroll_snap: 'start' }, [[
      w('cta-block', {
        title: 'Поставьте локально и соберите первую страницу',
        subtitle: 'Документация ведёт от установки до публикации. Без демо «посмотрите картинки».',
        cta1_label: 'Открыть документацию',
        cta1_href: '/docs',
        cta2_label: 'API для интеграций',
        cta2_href: '/api-docs',
        layout: 'split',
        show_media: true,
        media_url: '/landing/final-cta.png',
        media_alt: 'Jasefly CMS',
      }),
    ]]),

    section({ animation: 'fade-up', scroll_snap: 'start', paddingY: 'clamp(7.5rem, 18vh, 12rem)', v_align: 'center' }, [[
      w('blog-list', { title: 'Заметки из разработки', limit: 3 }),
    ]]),
  ],
}

fs.writeFileSync(outPath, JSON.stringify(layout, null, 2), 'utf8')
console.log('Wrote', outPath, 'sections:', layout.elements.length)
