import type { PageLayout } from '@/types'
import { createId, createSection, createWidget } from '@/builder/types'
import { getWidget } from '@/builder/registry'
import { initBuilderWidgets } from '@/builder/widgets'
import { isSeedLayout } from '@/builder/public/CmsPages'

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

/** Default home layout mirroring classic HomePage: Hero → обо мне с фото → остальное. */
export function buildDefaultHomeLayout(): PageLayout {
  return {
    version: 1,
    meta: { seed: true },
    elements: [
      sectionWithWidget('hero'),
      sectionWithWidget('profile-card', {
        title: 'Обо мне',
        subtitle: '',
        cta_label: 'Подробнее',
        cta_href: '/about',
      }),
      sectionWithWidget('projects-grid', { title: 'Избранные проекты', featured_only: true, limit: 3 }),
      sectionWithWidget('skills', { title: 'Навыки' }),
      sectionWithWidget('experience', { title: 'Опыт' }),
      sectionWithWidget('services', { title: 'Услуги' }),
      sectionWithWidget('testimonials', { title: 'Отзывы' }),
      sectionWithWidget('blog-list', { title: 'Блог', limit: 3 }),
      sectionWithWidget('cta-banner', {
        title: 'Расскажите о задаче',
        subtitle: 'Опишите продукт, сроки и ограничения — отвечу в рабочие дни.',
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
  return {
    version: 1,
    meta: { seed: true },
    elements: [
      sectionWithWidget('heading', { text: 'Связаться', tag: 'h1', size: 'xl', align: 'center' }),
      sectionWithWidget('contact-form', { title: '', subtitle: '' }),
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
