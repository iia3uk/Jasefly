import type { SettingsField } from '@/builder/types'

/** Default copy for Jasefly product landing (builder settings + public fallback). */
export const PRODUCT_LANDING_DEFAULTS: Record<string, string | number | boolean> = {
  hero_badge: 'PHP 8.3 · React · TypeScript · Vite · MySQL · MCP',
  hero_title_1: 'Разрабатывайте сайты с AI.',
  hero_title_2: 'Разворачивайте без лишней инфраструктуры.',
  hero_body:
    'Jasefly — модульная CMS с MCP-доступом, локальной сборкой и управляемыми обновлениями. Собирайте frontend на своей машине и публикуйте готовый проект на PHP/MySQL-хостинге.',
  hero_cta1_label: 'Начать работу',
  hero_cta1_href: '/docs',
  hero_cta2_label: 'Посмотреть, как это работает',
  hero_cta2_href: '#how-it-works',
  hero_chip_0: 'Локальная сборка',
  hero_chip_1: 'MCP для AI-агентов',
  hero_chip_2: 'Update ZIP',
  hero_chip_3: 'Shared Hosting Ready',
  hero_image_title: 'Интерфейс Jasefly CMS',

  how_title: 'От локальной разработки до production',
  how_subtitle: 'Сборка и проверки остаются на вашей машине. На сервер отправляется готовый пакет.',
  pipeline_0_badge: '1',
  pipeline_0_name: 'Develop',
  pipeline_0_desc: 'Frontend, backend и контент редактируются локально.',
  pipeline_1_badge: '2',
  pipeline_1_name: 'Build',
  pipeline_1_desc: 'Vite собирает React и TypeScript в production-assets.',
  pipeline_2_badge: '3',
  pipeline_2_name: 'Test',
  pipeline_2_desc: 'Проверки выполняются до упаковки проекта.',
  pipeline_3_badge: '4',
  pipeline_3_name: 'Package',
  pipeline_3_desc: 'Формируется install- или update-ZIP.',
  pipeline_4_badge: '5',
  pipeline_4_name: 'Upload',
  pipeline_4_desc: 'Пакет загружается через административную панель.',
  pipeline_5_badge: '6',
  pipeline_5_name: 'Ready',
  pipeline_5_desc: 'CMS проверяет пакет, применяет миграции и возвращает сайт в рабочее состояние.',

  compare_title: 'Не каждому сайту нужен отдельный application server',
  compare_subtitle:
    'Jasefly не заменяет VPS во всех сценариях. Она уменьшает объём серверного администрирования там, где достаточно PHP и MySQL.',
  compare_left_title: 'Типичный самостоятельный VPS',
  compare_left_0: 'Установка и обновление операционной системы',
  compare_left_1: 'Настройка SSH',
  compare_left_2: 'Настройка Nginx или Apache',
  compare_left_3: 'Установка Node.js и npm',
  compare_left_4: 'Управление процессами',
  compare_left_5: 'Настройка deployment',
  compare_left_6: 'Резервное копирование',
  compare_left_7: 'Регулярное обслуживание сервера',
  compare_right_title: 'Jasefly CMS',
  compare_right_0: 'Собрать проект локально',
  compare_right_1: 'Выполнить проверки',
  compare_right_2: 'Получить ZIP-пакет',
  compare_right_3: 'Загрузить его на хостинг',
  compare_right_4: 'Запустить installer или update',
  compare_right_5: 'Управлять сайтом через админку',
  compare_footnote:
    'VPS остаётся подходящим выбором для проектов со специальными требованиями к runtime, масштабированию и инфраструктуре.',

  action_title: 'Не только CMS. Полный рабочий процесс.',
  showcase_0_title: 'Управляйте страницами визуально',
  showcase_0_desc: 'Собирайте структуру страниц в Page Builder, редактируйте контент и сохраняйте изменения в CMS.',
  showcase_0_point_0: 'Секции, колонки и виджеты в одном редакторе',
  showcase_0_point_1: 'Настройки страницы и SEO рядом с контентом',
  showcase_0_point_2: 'Публикация и черновики без ручной правки файлов',
  showcase_1_title: 'Подключайте AI через MCP',
  showcase_1_desc: 'Давайте AI-агентам контекст и доступ только к тем операциям, которые нужны для работы с сайтом.',
  showcase_1_point_0: 'Карта сайта и digest страниц для быстрого контекста',
  showcase_1_point_1: 'Контролируемое изменение контента и структуры',
  showcase_1_point_2: 'Проверки перед выполнением чувствительных операций',
  showcase_2_title: 'Обновляйте production из админки',
  showcase_2_desc:
    'Загружайте готовый пакет и проходите проверяемый путь обновления без ручной замены проекта на хостинге.',
  showcase_2_point_0: 'Валидация пакета до применения',
  showcase_2_point_1: 'Миграции в составе управляемого обновления',
  showcase_2_point_2: 'Сохранение контента и настроек сайта',

  features_title: 'Всё необходимое для разработки и поддержки сайта',
  features_subtitle: 'Модули, Page Builder, AI-доступ и production-пайплайн в одной системе.',
  feature_0_title: 'Модульная архитектура',
  feature_0_desc: 'Подключайте нужные возможности без переписывания ядра.',
  feature_1_title: 'Page Builder',
  feature_1_desc: 'Собирайте страницы из секций, колонок и виджетов.',
  feature_2_title: 'MCP для AI',
  feature_2_desc: 'Давайте AI-агентам управляемый доступ к структуре и контенту.',
  feature_3_title: 'Remote Deploy',
  feature_3_desc: 'Собирайте, проверяйте и отправляйте обновления через единый pipeline.',
  feature_4_title: 'Обновления из админки',
  feature_4_desc: 'Загружайте подготовленные ZIP-пакеты без ручной замены файлов.',
  feature_5_title: 'Shared Hosting Ready',
  feature_5_desc: 'Используйте готовый frontend и PHP API без Node.js на production.',
  feature_6_title: 'SEO и prerender',
  feature_6_desc: 'Управляйте metadata, sitemap, robots и представлением страниц для поисковых систем.',
  feature_7_title: 'Commerce',
  feature_7_desc: 'Работайте с товарами, каталогом, checkout, заказами и страницами оплаты.',
  feature_8_title: 'Безопасность',
  feature_8_desc: 'Роли, разрешения, JWT, refresh-токены, 2FA, журнал действий и резервные копии.',
  feature_9_title: 'Hosting Guard',
  feature_9_desc: 'Ограничивайте нагрузку AI-агентов с помощью троттлинга и кэширования.',

  mcp_title: 'CMS, спроектированная для совместной работы с AI',
  mcp_subtitle: 'Jasefly предоставляет AI-агентам управляемый доступ к структуре сайта, контенту и операциям.',
  mcp_flow_0: 'AI Agent',
  mcp_flow_1: 'MCP Client',
  mcp_flow_2: 'Permissions / Rate Limits',
  mcp_flow_3: 'Jasefly API',
  mcp_flow_4: 'Pages / Content / Navigation / Settings',
  mcp_card_0_title: 'Карта сайта',
  mcp_card_0_desc: 'Агент получает структуру и связи страниц.',
  mcp_card_1_title: 'Сущности и digest',
  mcp_card_1_desc: 'Короткий контекст вместо полного обхода проекта.',
  mcp_card_2_title: 'Управляемое редактирование',
  mcp_card_2_desc: 'Операции проходят через API и валидацию.',
  mcp_card_3_title: 'Hosting Guard',
  mcp_card_3_desc: 'Лимиты и проверки защищают production-среду.',
  mcp_cmd_0: 'get_site_map',
  mcp_cmd_1: 'get_page_digest',
  mcp_cmd_2: 'update_content',
  mcp_cmd_3: 'validate_update',
  mcp_image_title: 'Инспектор MCP и операции CMS',

  updates_title: 'Обновления без ручной замены проекта',
  updates_step_0: 'Build',
  updates_step_1: 'Package',
  updates_step_2: 'Upload',
  updates_step_3: 'Validate',
  updates_step_4: 'Migrate',
  updates_step_5: 'Ready',
  updates_keep_title: 'Сохраняется',
  updates_keep_0: 'Локальная конфигурация',
  updates_keep_1: 'Пользовательские загрузки',
  updates_keep_2: 'Резервные копии',
  updates_keep_3: 'Журналы',
  updates_new_title: 'Обновляется',
  updates_new_0: 'Runtime',
  updates_new_1: 'Frontend assets',
  updates_new_2: 'API-файлы',
  updates_new_3: 'Контролируемые миграции',
  updates_image_title: 'Панель управления обновлением',

  modules_title: 'Подключайте только нужные возможности',
  modules_tab_0: 'Система',
  modules_tab_1: 'Контент',
  modules_tab_2: 'Коммерция',
  modules_tab_3: 'Интеграции',
  modules_tab_4: 'Продвижение',
  modules_0_0: 'Авторизация',
  modules_0_1: 'Роли и права',
  modules_0_2: 'Миграции',
  modules_0_3: 'Обновления',
  modules_0_4: 'Журнал действий',
  modules_0_5: 'Резервные копии',
  modules_1_0: 'Страницы',
  modules_1_1: 'Page Builder',
  modules_1_2: 'Блог',
  modules_1_3: 'Проекты',
  modules_1_4: 'Медиатека',
  modules_1_5: 'Навигация',
  modules_2_0: 'Товары',
  modules_2_1: 'Каталог',
  modules_2_2: 'Checkout',
  modules_2_3: 'Заказы',
  modules_2_4: 'Страницы оплаты',
  modules_3_0: 'Webhooks',
  modules_3_1: 'Mail',
  modules_3_2: 'MCP',
  modules_3_3: 'Remote deploy',
  modules_4_0: 'SEO',
  modules_4_1: 'Sitemap',
  modules_4_2: 'Robots',
  modules_4_3: 'Prerender',
  modules_4_4: 'Пользовательские CSS и JavaScript',
  modules_image_title: 'Управление модулями Jasefly',

  audience_title: 'Для разработчиков, которым важен результат, а не обслуживание инфраструктуры',
  audience_0_title: 'Независимые разработчики',
  audience_0_desc: 'Запускайте клиентские сайты без создания инфраструктуры с нуля.',
  audience_1_title: 'Фрилансеры',
  audience_1_desc: 'Быстро собирайте и поддерживайте несколько проектов.',
  audience_2_title: 'Небольшие студии',
  audience_2_desc: 'Используйте единое ядро и добавляйте проектные модули.',
  audience_3_title: 'AI-first разработчики',
  audience_3_desc: 'Работайте со структурой и контентом сайта через MCP.',
  audience_4_title: 'Владельцы shared hosting',
  audience_4_desc: 'Используйте современную админку и frontend без отдельного application server.',

  tech_title: 'Современный стек разработки. Простой production-runtime.',
  tech_dev_title: 'Разработка',
  tech_dev_0: 'React',
  tech_dev_1: 'TypeScript',
  tech_dev_2: 'Vite',
  tech_dev_3: 'Tailwind',
  tech_dev_4: 'framer-motion',
  tech_dev_5: 'MCP',
  tech_prod_title: 'Production',
  tech_prod_0: 'PHP 8.3',
  tech_prod_1: 'MySQL',
  tech_prod_2: 'Готовый frontend',
  tech_prod_3: 'Shared Hosting',
  tech_footnote:
    'Тяжёлая работа — сборка, типизация и проверки — выполняется локально. На production остаётся предсказуемый PHP/MySQL runtime и готовые статические ресурсы.',

  cta_title: 'Создавайте сайт, а не серверную инфраструктуру',
  cta_subtitle:
    'Jasefly объединяет локальную разработку, модульный backend, визуальное управление контентом, MCP-доступ и управляемый production deployment.',
  cta_btn1_label: 'Начать работу',
  cta_btn1_href: '/docs',
  cta_btn2_label: 'Открыть документацию',
  cta_btn2_href: '/docs',
  cta_image_title: 'Jasefly CMS: разработка, управление и публикация',
}

const LABELS: Record<string, string> = {
  hero_badge: 'Hero · бейдж',
  hero_title_1: 'Hero · заголовок 1',
  hero_title_2: 'Hero · заголовок 2',
  hero_body: 'Hero · текст',
  hero_cta1_label: 'Hero · кнопка 1',
  hero_cta1_href: 'Hero · ссылка 1',
  hero_cta2_label: 'Hero · кнопка 2',
  hero_cta2_href: 'Hero · ссылка 2',
  hero_chip_0: 'Hero · чип 1',
  hero_chip_1: 'Hero · чип 2',
  hero_chip_2: 'Hero · чип 3',
  hero_chip_3: 'Hero · чип 4',
  hero_image_title: 'Hero · подпись картинки',
  how_title: 'Как работает · заголовок',
  how_subtitle: 'Как работает · подзаголовок',
  compare_title: 'Сравнение · заголовок',
  compare_subtitle: 'Сравнение · подзаголовок',
  compare_left_title: 'Сравнение · VPS заголовок',
  compare_right_title: 'Сравнение · Jasefly заголовок',
  compare_footnote: 'Сравнение · сноска',
  action_title: 'Showcase · заголовок секции',
  features_title: 'Фичи · заголовок',
  features_subtitle: 'Фичи · подзаголовок',
  mcp_title: 'MCP · заголовок',
  mcp_subtitle: 'MCP · подзаголовок',
  mcp_image_title: 'MCP · подпись картинки',
  updates_title: 'Обновления · заголовок',
  updates_keep_title: 'Обновления · сохраняется',
  updates_new_title: 'Обновления · обновляется',
  updates_image_title: 'Обновления · подпись картинки',
  modules_title: 'Модули · заголовок',
  modules_image_title: 'Модули · подпись картинки',
  audience_title: 'Аудитория · заголовок',
  tech_title: 'Стек · заголовок',
  tech_dev_title: 'Стек · разработка',
  tech_prod_title: 'Стек · production',
  tech_footnote: 'Стек · сноска',
  cta_title: 'CTA · заголовок',
  cta_subtitle: 'CTA · подзаголовок',
  cta_btn1_label: 'CTA · кнопка 1',
  cta_btn1_href: 'CTA · ссылка 1',
  cta_btn2_label: 'CTA · кнопка 2',
  cta_btn2_href: 'CTA · ссылка 2',
  cta_image_title: 'CTA · подпись картинки',
}

/** Label for structure tree, inspector and EditableShell selection chip. */
export function plFieldLabel(key: string): string {
  return autoLabel(key)
}

function autoLabel(key: string): string {
  if (LABELS[key]) return LABELS[key]
  if (key.startsWith('pipeline_') && key.endsWith('_badge')) return `Пайплайн ${Number(key.split('_')[1]) + 1} · номер`
  if (key.startsWith('pipeline_') && key.endsWith('_name')) return `Пайплайн ${Number(key.split('_')[1]) + 1} · имя`
  if (key.startsWith('pipeline_') && key.endsWith('_desc')) return `Пайплайн ${Number(key.split('_')[1]) + 1} · текст`
  if (key.startsWith('compare_left_')) return `VPS · пункт ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('compare_right_')) return `Jasefly · пункт ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('showcase_') && key.includes('_point_')) {
    const [, si, , pi] = key.split('_')
    return `Showcase ${Number(si) + 1} · пункт ${Number(pi) + 1}`
  }
  if (key.startsWith('showcase_') && key.endsWith('_title')) return `Showcase ${Number(key.split('_')[1]) + 1} · заголовок`
  if (key.startsWith('showcase_') && key.endsWith('_desc')) return `Showcase ${Number(key.split('_')[1]) + 1} · текст`
  if (key.startsWith('feature_') && key.endsWith('_title')) return `Фича ${Number(key.split('_')[1]) + 1} · заголовок`
  if (key.startsWith('feature_') && key.endsWith('_desc')) return `Фича ${Number(key.split('_')[1]) + 1} · текст`
  if (key.startsWith('mcp_flow_')) return `MCP · шаг ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('mcp_card_') && key.endsWith('_title')) return `MCP · карточка ${Number(key.split('_')[2]) + 1} · заголовок`
  if (key.startsWith('mcp_card_') && key.endsWith('_desc')) return `MCP · карточка ${Number(key.split('_')[2]) + 1} · текст`
  if (key.startsWith('mcp_cmd_')) return `MCP · команда ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('updates_step_')) return `Обновления · шаг ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('updates_keep_')) return `Сохраняется · ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('updates_new_')) return `Обновляется · ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('modules_tab_')) return `Модули · вкладка ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('modules_')) {
    const parts = key.split('_')
    return `Модули ${Number(parts[1]) + 1} · пункт ${Number(parts[2]) + 1}`
  }
  if (key.startsWith('audience_') && key.endsWith('_title')) return `Аудитория ${Number(key.split('_')[1]) + 1} · заголовок`
  if (key.startsWith('audience_') && key.endsWith('_desc')) return `Аудитория ${Number(key.split('_')[1]) + 1} · текст`
  if (key.startsWith('tech_dev_')) return `Стек dev · ${Number(key.split('_').pop()) + 1}`
  if (key.startsWith('tech_prod_')) return `Стек prod · ${Number(key.split('_').pop()) + 1}`
  return key
}

function fieldType(key: string): 'text' | 'textarea' | 'url' {
  if (key.endsWith('_href')) return 'url'
  if (
    key.endsWith('_body')
    || key.endsWith('_desc')
    || key.endsWith('_subtitle')
    || key.endsWith('_footnote')
    || key === 'hero_body'
    || key === 'cta_subtitle'
    || key === 'compare_subtitle'
    || key === 'mcp_subtitle'
    || key === 'features_subtitle'
    || key === 'how_subtitle'
    || key === 'tech_footnote'
  ) {
    return 'textarea'
  }
  return 'text'
}

/** Flat settings fields → left structure tree + right inspector. */
export function productLandingSettingsFields(): SettingsField[] {
  return Object.keys(PRODUCT_LANDING_DEFAULTS).map((key) => ({
    key,
    label: autoLabel(key),
    type: fieldType(key),
  }))
}

export type PlSectionId =
  | 'hero'
  | 'how'
  | 'compare'
  | 'showcase'
  | 'features'
  | 'mcp'
  | 'updates'
  | 'modules'
  | 'audience'
  | 'tech'
  | 'cta'

const SECTION_MATCH: Record<PlSectionId, (key: string) => boolean> = {
  hero: (k) => k.startsWith('hero_'),
  how: (k) => k.startsWith('how_') || k.startsWith('pipeline_'),
  compare: (k) => k.startsWith('compare_'),
  showcase: (k) => k.startsWith('action_') || k.startsWith('showcase_'),
  features: (k) => k.startsWith('features_') || k.startsWith('feature_'),
  mcp: (k) => k.startsWith('mcp_'),
  updates: (k) => k.startsWith('updates_'),
  modules: (k) => k.startsWith('modules_'),
  audience: (k) => k.startsWith('audience_'),
  tech: (k) => k.startsWith('tech_'),
  cta: (k) => k.startsWith('cta_'),
}

export function productLandingDefaultsFor(section: PlSectionId): Record<string, unknown> {
  const match = SECTION_MATCH[section]
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(PRODUCT_LANDING_DEFAULTS)) {
    if (match(key)) out[key] = value
  }
  return out
}

export function productLandingSettingsFieldsFor(section: PlSectionId): SettingsField[] {
  const match = SECTION_MATCH[section]
  return productLandingSettingsFields().filter((f) => match(f.key))
}

export function mergeProductLandingSettings(raw: unknown): Record<string, unknown> {
  const base = { ...PRODUCT_LANDING_DEFAULTS } as Record<string, unknown>
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  return { ...base, ...(raw as Record<string, unknown>) }
}

export function pl(settings: Record<string, unknown>, key: string): string {
  const v = settings[key]
  if (v == null) return String(PRODUCT_LANDING_DEFAULTS[key] ?? '')
  return String(v)
}
