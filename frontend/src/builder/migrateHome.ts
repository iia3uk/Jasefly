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

/**
 * Default home out-of-the-box: one platform hero only.
 * No below-the-fold sections — site owner builds the rest in the builder.
 */
export function buildDefaultHomeLayout(): PageLayout {
  return {
    version: 1,
    meta: { seed: true, seed_kind: 'platform' },
    elements: [
      sectionWithWidget('hero-block', {
        badge: 'Jasefly',
        title_1: 'Платформа для сайтов',
        title_2: 'и агентов.',
        body: 'Page Builder, модули и MCP в одном ядре — на shared-хостинге или Node VPS.',
        cta1_label: 'Открыть админку',
        cta1_href: '/admin',
        cta2_label: '',
        cta2_href: '',
        cta3_label: '',
        cta3_href: '',
        cta4_label: '',
        cta4_href: '',
        layout: 'stack',
        align: 'left',
        media_mode: 'background',
        height_preset: 'viewport',
        living: true,
        media_overlay: '0.45',
        chips: [
          { label: 'Page Builder' },
          { label: 'MCP / AI' },
          { label: 'Dual runtime' },
          { label: 'Modules' },
        ],
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
