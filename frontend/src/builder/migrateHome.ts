import type { PageLayout } from '@/types'
import { createId, createSection, createWidget } from '@/builder/types'
import { getWidget } from '@/builder/registry'
import { initBuilderWidgets } from '@/builder/widgets'
import { isSeedLayout } from '@/builder/public/CmsPages'

/** Example contact block: map + details (edit address/phone/hours in builder). */
const CONTACT_TEMPLATE_LAT = 55.7539
const CONTACT_TEMPLATE_LNG = 37.6208
const CONTACT_TEMPLATE_ADDRESS = 'г. Москва, Красная площадь, 1'
const CONTACT_TEMPLATE_DETAILS_HTML = [
  '<p><strong>Ваша компания</strong></p>',
  '<p>Тел.: <a href="tel:+79990000000">+7 (999) 000-00-00</a></p>',
  `<p>${CONTACT_TEMPLATE_ADDRESS}<br>`,
  `<a href="https://yandex.ru/maps/?rtext=~${CONTACT_TEMPLATE_LAT},${CONTACT_TEMPLATE_LNG}" target="_blank" rel="noopener noreferrer">Построить маршрут в Яндекс Навигаторе</a><br>`,
  `<a href="https://www.google.com/maps/dir/?api=1&amp;destination=${CONTACT_TEMPLATE_LAT},${CONTACT_TEMPLATE_LNG}" target="_blank" rel="noopener noreferrer">Построить маршрут в Google картах</a></p>`,
  '<p>Понедельник - Суббота: с 09:00 до 20:00<br>Воскресенье: с 10:00 до 18:00</p>',
  '<p>Email: <a href="mailto:info@example.com">info@example.com</a></p>',
  '<p><em>Будем рады, если Вы станете нашими клиентами!</em></p>',
].join('')

initBuilderWidgets()

function sectionWithWidget(widgetType: string, settings: Record<string, unknown> = {}): PageLayout['elements'][number] {
  const def = getWidget(widgetType)
  const section = createSection(1)
  const widget = createWidget(widgetType, { ...(def?.defaultSettings ?? {}), ...settings })
  section.elements![0].elements = [widget]
  return section
}

function collectWidgetTypes(els: PageLayout['elements'] | undefined, into: string[] = []): string[] {
  for (const el of els ?? []) {
    if (el.elType === 'widget' && el.widgetType) into.push(el.widgetType)
    if (el.elements?.length) collectWidgetTypes(el.elements, into)
  }
  return into
}

/** True when layout has no widgets (empty section shell). */
export function isShellLayout(layout: PageLayout | null | undefined): boolean {
  if (!layout?.elements?.length) return true
  return collectWidgetTypes(layout.elements).length === 0
}

/** Seed stub with only heading/text — replace with rich portfolio widgets. */
export function isSparseSeedLayout(layout: PageLayout | null | undefined): boolean {
  if (!layout || !isSeedLayout(layout)) return isShellLayout(layout)
  const types = collectWidgetTypes(layout.elements)
  if (!types.length) return true
  return types.every((t) => t === 'heading' || t === 'text')
}

/** Default home: product landing entry — not a digest of About/Skills/Experience. */
export function buildDefaultHomeLayout(): PageLayout {
  return {
    version: 1,
    meta: { seed: true },
    elements: [
      sectionWithWidget('hero', {
        show_stats: true,
        subheadline: 'Системы, которые работают в проде — от платформ до промышленной автоматизации.',
      }),
      sectionWithWidget('features-grid', {
        title: 'Что я создаю',
        subtitle: 'Пять направлений, которые сходятся в рабочих системах.',
        columns: 3,
        accented: true,
        last_row_alignment: 'center',
        items: [
          {
            icon: 'layers',
            title: 'Software Products',
            body: 'Собственные платформы и продукты: архитектура, backend, интерфейсы и эксплуатация.',
            markers: 'PHP · React · Go',
          },
          {
            icon: 'zap',
            title: 'Industrial Automation',
            body: 'Локальные системы управления: PLC, SCADA, OPC, архивирование и полевая автоматизация.',
            markers: 'CODESYS · ST · CFC',
          },
          {
            icon: 'sparkles',
            title: 'Game Technology',
            body: 'Игровые механики, серверные контуры и инструменты production-пайплайна.',
            markers: 'Unity · Godot · .NET',
          },
          {
            icon: 'cpu',
            title: 'Internal Tools',
            body: 'Редакторы, панели и утилиты, которые убирают ручную работу на объекте и в офисе.',
            markers: 'Web · Desktop · Automation',
          },
          {
            icon: 'bot',
            title: 'AI-first Development',
            body: 'AI и MCP как часть инженерного процесса: от анализа задачи до сопровождения продукта.',
            markers: 'Agents · MCP · Tooling',
          },
        ],
      }),
      sectionWithWidget('projects-grid', {
        title: 'Избранные проекты',
        subtitle: '',
        featured_only: true,
        layout: 'lead-with-stack',
        compact: false,
        limit: 3,
      }),
      sectionWithWidget('process-diagram', {
        title: 'Как я работаю',
        subtitle: 'Система проходит путь до рабочего продукта — и продолжает развиваться.',
        center_title: 'Рабочая система',
        center_description: 'Архитектура и автоматизация сходятся в устойчивое ядро.',
        nodes: [
          { id: 'idea', title: 'Идея', description: 'Задача и ограничения.', role: 'input' },
          { id: 'prototype', title: 'Прототип', description: 'Быстрая проверка гипотезы.', role: 'input' },
          { id: 'architecture', title: 'Архитектура', description: 'Устойчивая структура.', role: 'core' },
          { id: 'automation', title: 'Автоматизация', description: 'Снятие рутины.', role: 'core' },
          { id: 'ops', title: 'Эксплуатация', description: 'Рабочий контур.', role: 'output' },
          { id: 'growth', title: 'Развитие', description: 'Итерации по факту использования.', role: 'feedback' },
        ],
        connections: [
          { from: 'idea', to: 'prototype', type: 'direct' },
          { from: 'prototype', to: 'architecture', type: 'direct' },
          { from: 'architecture', to: 'automation', type: 'direct' },
          { from: 'automation', to: 'ops', type: 'direct' },
          { from: 'ops', to: 'growth', type: 'direct' },
          { from: 'growth', to: 'idea', type: 'feedback' },
        ],
      }),
      sectionWithWidget('stats-strip', {
        title: 'Результаты',
        subtitle: '',
        size: 'lg',
        autofill_from_projects: true,
        items: [
          { value: '6+', label: 'Лет автоматизации' },
          { value: '15', label: 'PLC в контуре' },
        ],
      }),
      sectionWithWidget('services', {
        title: 'Что могу разработать',
        subtitle: 'Спектр задач — детали в проектах и на странице услуг.',
        preset: 'spectrum',
      }),
      sectionWithWidget('testimonials', { title: 'Отзывы' }),
      sectionWithWidget('blog-list', { title: 'Последние статьи', limit: 3, cta_href: '/blog', cta_label: 'Блог' }),
      sectionWithWidget('cta-banner', {
        title: 'Есть задача — давайте разберём',
        subtitle: 'Опишите продукт, сроки и ограничения. Отвечу в рабочие дни.',
        cta_label: 'Связаться',
        cta_href: '/contact',
      }),
    ],
  }
}

export function buildDefaultAboutLayout(): PageLayout {
  return {
    version: 1,
    meta: { seed: true },
    elements: [
      sectionWithWidget('profile-card', {
        title: 'Обо мне',
        subtitle: '',
        cta_label: 'Связаться',
        cta_href: '/contact',
      }),
      sectionWithWidget('skills', { title: 'Навыки', preset: 'tabs', size: 'sm' }),
      sectionWithWidget('experience', { title: 'Опыт' }),
      sectionWithWidget('cta-banner', {
        title: 'Готовы обсудить задачу?',
        subtitle: 'Напишите — отвечу в рабочие дни.',
        cta_label: 'Написать',
        cta_href: '/contact',
      }),
    ],
  }
}

export function buildDefaultProjectsLayout(): PageLayout {
  return {
    version: 1,
    meta: { seed: true },
    elements: [
      sectionWithWidget('heading', { text: 'Проекты', tag: 'h1', size: 'xl', align: 'left' }),
      sectionWithWidget('projects-grid', {
        title: '',
        subtitle: 'Избранные и недавние работы',
        limit: 12,
        featured_only: false,
      }),
    ],
  }
}

export function buildDefaultBlogLayout(): PageLayout {
  return {
    version: 1,
    meta: { seed: true },
    elements: [
      sectionWithWidget('heading', { text: 'Блог', tag: 'h1', size: 'xl', align: 'left' }),
      sectionWithWidget('blog-list', { title: '', subtitle: 'Заметки и разборы', limit: 12 }),
    ],
  }
}

export function buildDefaultServicesLayout(): PageLayout {
  return {
    version: 1,
    meta: { seed: true },
    elements: [
      sectionWithWidget('heading', { text: 'Услуги', tag: 'h1', size: 'xl', align: 'left' }),
      sectionWithWidget('services', { title: '', subtitle: 'Чем могу быть полезен' }),
    ],
  }
}

export function buildDefaultContactLayout(): PageLayout {
  const mapCol = createSection(2)
  mapCol.settings = {
    ...mapCol.settings,
    paddingY: '3.5rem',
    gap: '2.5rem',
    content_max_width: '1120px',
  }
  const [left, right] = mapCol.elements!
  left.settings = { width: 55 }
  right.settings = { width: 45 }
  left.elements = [
    createWidget('maps.map', {
      title: '',
      address: CONTACT_TEMPLATE_ADDRESS,
      center_lat: CONTACT_TEMPLATE_LAT,
      center_lng: CONTACT_TEMPLATE_LNG,
      zoom: 16,
      marker_title: 'Офис',
      marker_description: CONTACT_TEMPLATE_ADDRESS,
      height: 440,
      interactive: true,
      scroll_wheel_zoom: false,
      show_directions: false,
      fit_bounds: false,
      provider: 'yandex',
      map_style: 'default',
    }),
  ]
  right.elements = [
    createWidget('heading', {
      text: 'Контакты',
      tag: 'h1',
      size: 'xl',
      align: 'left',
      styles: { margin: '0 0 0.5rem' },
    }),
    createWidget('spacer', {
      height: '4px',
      styles: {
        backgroundColor: '#3cb54a',
        width: '3rem',
        borderRadius: '2px',
        margin: '0 0 1.5rem',
      },
    }),
    createWidget('text', {
      html: CONTACT_TEMPLATE_DETAILS_HTML,
      align: 'left',
      styles: { fontSize: '1rem', lineHeight: '1.75' },
    }),
  ]

  return {
    version: 1,
    meta: { seed: true },
    elements: [
      mapCol,
      sectionWithWidget('contact-form', {
        title: 'Написать нам',
        subtitle: 'Опишите задачу или вопрос - ответим в рабочие дни.',
      }),
    ],
  }
}

/** Pick a rich seed layout for home / portfolio system pages. */
export function defaultLayoutForPage(opts: { isHome?: boolean; slug?: string | null }): PageLayout | null {
  if (opts.isHome) return buildDefaultHomeLayout()
  switch (String(opts.slug || '')) {
    case 'about':
      return buildDefaultAboutLayout()
    case 'projects':
      return buildDefaultProjectsLayout()
    case 'blog':
      return buildDefaultBlogLayout()
    case 'services':
      return buildDefaultServicesLayout()
    case 'contact':
      return buildDefaultContactLayout()
    default:
      return null
  }
}

void createId
