import { endpoints } from '@/lib/api'
import type { BuilderElementDTO, HomepageSection, PageLayout, SitePayload } from '@/types'
import { isPlaceholderText, preferRealText } from '@/builder/editor/placeholderText'

/** Builder widget type → homepage_sections.section_key */
export const WIDGET_SECTION_KEY: Record<string, string> = {
  'profile-card': 'about_preview',
  'projects-grid': 'featured_projects',
  skills: 'skills',
  experience: 'experience',
  services: 'services',
  testimonials: 'testimonials',
  'blog-list': 'blog_preview',
  'contact-form': 'contact_cta',
  'cta-banner': 'contact_cta',
}

function walkWidgets(elements: BuilderElementDTO[] | undefined, visit: (el: BuilderElementDTO) => void) {
  for (const el of elements ?? []) {
    if (el.elType === 'widget') visit(el)
    if (el.elements?.length) walkWidgets(el.elements, visit)
  }
}

function firstWidget(layout: PageLayout, type: string): BuilderElementDTO | null {
  let hit: BuilderElementDTO | null = null
  walkWidgets(layout.elements, (el) => {
    if (!hit && el.widgetType === type) hit = el
  })
  return hit
}

/**
 * Admin → Builder: merge CMS hero/sections into layout.
 * Never overwrite real layout copy with CMS stubs ("Заголовок", "asd", …).
 * Real CMS fills only empty/stub layout fields.
 */
export function pullCmsIntoLayout(layout: PageLayout, site: SitePayload | null | undefined): PageLayout {
  if (!site) return layout

  const mapElement = (el: BuilderElementDTO): BuilderElementDTO => {
    const kids = el.elements?.map(mapElement)
    if (el.elType !== 'widget' || !el.widgetType) {
      return kids ? { ...el, elements: kids } : el
    }

    const raw = { ...(el.settings ?? {}) }
    let next = raw
    let changed = false

    if (el.widgetType === 'hero' && site.hero) {
      const h = site.hero
      const merged = {
        ...raw,
        // Layout wins when it has real copy; CMS only fills stubs/empties.
        badge_text: preferRealText(raw.badge_text, h.badge_text),
        headline: preferRealText(raw.headline, h.headline),
        subheadline: preferRealText(raw.subheadline, h.subheadline),
        primary_cta_label: preferRealText(raw.primary_cta_label, h.primary_cta_label),
        primary_cta_href: preferRealText(raw.primary_cta_href, h.primary_cta_href),
        secondary_cta_label: preferRealText(raw.secondary_cta_label, h.secondary_cta_label),
        secondary_cta_href: preferRealText(raw.secondary_cta_href, h.secondary_cta_href),
        background_media_id:
          raw.background_media_id
          ?? h.background_media_id
          ?? h.background?.id
          ?? null,
      }
      next = merged
      changed = true
    }

    const sectionKey = WIDGET_SECTION_KEY[el.widgetType]
    if (sectionKey && site.homepage_sections?.length) {
      const section = site.homepage_sections.find((s) => s.section_key === sectionKey)
      if (section) {
        next = {
          ...next,
          title: preferRealText(next.title, section.title),
          subtitle: preferRealText(next.subtitle, section.subtitle),
          ...(section.cta_label != null || 'cta_label' in next
            ? {
                cta_label: preferRealText(next.cta_label, section.cta_label),
                cta_href: preferRealText(next.cta_href, section.cta_href),
              }
            : {}),
        }
        changed = true
      }
    }

    if (!changed && !kids) return el
    return {
      ...el,
      ...(changed ? { settings: next } : {}),
      ...(kids ? { elements: kids } : {}),
    }
  }

  return {
    ...layout,
    elements: (layout.elements ?? []).map(mapElement),
  }
}

/** True when layout hero has real copy and CMS hero is still stubbed. */
export function layoutHeroShouldHealCms(
  layout: PageLayout,
  site: SitePayload | null | undefined,
): boolean {
  const heroEl = firstWidget(layout, 'hero')
  if (!heroEl?.settings || !site?.hero) return false
  const s = heroEl.settings
  const h = site.hero
  // Heal when layout has a real headline and CMS does not (or other key fields).
  if (!isPlaceholderText(s.headline) && isPlaceholderText(h.headline)) return true
  if (!isPlaceholderText(s.badge_text) && isPlaceholderText(h.badge_text) && isPlaceholderText(h.headline)) return true
  if (!isPlaceholderText(s.subheadline) && isPlaceholderText(h.subheadline) && isPlaceholderText(h.headline)) return true
  return false
}

/**
 * Builder → Admin: mirror home layout hero + section widgets into CMS singletons/lists.
 * Stub layout values never overwrite real CMS fields.
 */
export async function pushLayoutToCms(layout: PageLayout, site: SitePayload | null | undefined): Promise<void> {
  const heroEl = firstWidget(layout, 'hero')
  if (heroEl?.settings) {
    const s = heroEl.settings
    const h = site?.hero
    await endpoints.adminSingletonSave('hero', {
      badge_text: preferRealText(s.badge_text, h?.badge_text),
      headline: preferRealText(s.headline, h?.headline),
      subheadline: preferRealText(s.subheadline, h?.subheadline),
      primary_cta_label: preferRealText(s.primary_cta_label, h?.primary_cta_label),
      primary_cta_href: preferRealText(s.primary_cta_href, h?.primary_cta_href),
      secondary_cta_label: preferRealText(s.secondary_cta_label, h?.secondary_cta_label),
      secondary_cta_href: preferRealText(s.secondary_cta_href, h?.secondary_cta_href),
      background_media_id:
        s.background_media_id
        ?? h?.background_media_id
        ?? h?.background?.id
        ?? null,
    })
  }

  if (!site?.homepage_sections?.length) return

  const updates: Array<Promise<unknown>> = []
  const seen = new Set<string>()

  walkWidgets(layout.elements, (el) => {
    const key = el.widgetType ? WIDGET_SECTION_KEY[el.widgetType] : undefined
    if (!key || seen.has(key) || !el.settings) return
    seen.add(key)
    const section = site.homepage_sections.find((s) => s.section_key === key)
    if (!section?.id) return
    const payload: Partial<HomepageSection> = {
      title: preferRealText(el.settings.title, section.title),
      subtitle: preferRealText(el.settings.subtitle, section.subtitle),
    }
    if ('cta_label' in el.settings || section.cta_label != null) {
      payload.cta_label = preferRealText(el.settings.cta_label, section.cta_label)
      payload.cta_href = preferRealText(el.settings.cta_href, section.cta_href)
    }
    updates.push(endpoints.adminSave('homepage-sections', payload, section.id))
  })

  if (updates.length) await Promise.all(updates)
}
