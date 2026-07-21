import type { BuilderElementDTO, HeroSettings, HomepageSection, PageLayout, Profile, SitePayload } from '@/types'
import { getWidget } from '@/builder/registry'
import { isPlaceholderText } from '@/builder/editor/placeholderText'

/** Prefer non-empty raw setting, then CMS/default fallback. */
export function pickFilled(
  raw: Record<string, unknown>,
  key: string,
  ...fallbacks: unknown[]
): unknown {
  const v = raw[key]
  if (v != null && String(v).trim() !== '') return v
  for (const f of fallbacks) {
    if (f != null && String(f).trim() !== '') return f
  }
  return v ?? ''
}

/**
 * If the key exists on raw (even as ''), that value wins — user cleared/edited it.
 * Only fall back when the key was never written into the layout.
 */
export function pickOwned(
  raw: Record<string, unknown>,
  key: string,
  ...fallbacks: unknown[]
): unknown {
  if (Object.prototype.hasOwnProperty.call(raw, key)) {
    return raw[key] ?? ''
  }
  return pickFilled(raw, key, ...fallbacks)
}

export type EditorSettingsCtx = {
  site?: SitePayload | null
  profile?: Profile | null
}

/** Builder widget type → homepage_sections.section_key (CMS titles seed into layout once). */
const WIDGET_SECTION_KEY: Record<string, string> = {
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

function sectionFor(
  widgetType: string | undefined,
  site?: SitePayload | null,
): HomepageSection | undefined {
  if (!widgetType || !site?.homepage_sections?.length) return undefined
  const key = WIDGET_SECTION_KEY[widgetType]
  if (!key) return undefined
  return site.homepage_sections.find((s) => s.section_key === key)
}

/**
 * Settings shown in the builder right panel — defaults + CMS seeds for empty keys.
 * After bakeLayoutContent, raw settings hold the real values (no live CMS bind in widgets).
 */
export function resolveEditorSettings(
  widgetType: string | undefined,
  raw: Record<string, unknown>,
  defaults: Record<string, unknown>,
  ctx: EditorSettingsCtx,
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...defaults }
  for (const [k, v] of Object.entries(raw)) {
    // Keep explicit empties ('') — they mean "cleared by user", not "use CMS".
    if (v !== undefined) base[k] = v
  }

  if (!widgetType) return { ...defaults, ...raw, ...base }

  const section = sectionFor(widgetType, ctx.site)

  // Prefer real CMS hero only when layout field is missing/stub — never bake CMS stubs over real copy.
  if (widgetType === 'hero') {
    const hero = (ctx.site?.hero ?? {}) as HeroSettings
    const take = (key: string, cms: unknown, ...fallbacks: unknown[]) => {
      const rawVal = Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined
      const cmsReal = !isPlaceholderText(cms)
      if (cmsReal && (rawVal == null || isPlaceholderText(rawVal))) return cms
      return pickOwned(raw, key, ...fallbacks, cmsReal ? cms : undefined)
    }
    return {
      ...base,
      badge_text: take('badge_text', hero.badge_text, defaults.badge_text),
      headline: take('headline', hero.headline, defaults.headline, 'Заголовок'),
      subheadline: take('subheadline', hero.subheadline, defaults.subheadline),
      primary_cta_label: take('primary_cta_label', hero.primary_cta_label, defaults.primary_cta_label),
      primary_cta_href: take('primary_cta_href', hero.primary_cta_href, defaults.primary_cta_href),
      secondary_cta_label: take('secondary_cta_label', hero.secondary_cta_label, defaults.secondary_cta_label),
      secondary_cta_href: take('secondary_cta_href', hero.secondary_cta_href, defaults.secondary_cta_href),
      background_media_id: take(
        'background_media_id',
        hero.background_media_id ?? hero.background?.id,
        defaults.background_media_id,
      ),
    }
  }

  if (widgetType === 'profile-card') {
    return {
      ...base,
      title: pickOwned(raw, 'title', defaults.title, section?.title, 'Обо мне'),
      subtitle: pickOwned(raw, 'subtitle', defaults.subtitle, section?.subtitle, ctx.profile?.short_bio),
      cta_label: pickOwned(raw, 'cta_label', defaults.cta_label, section?.cta_label, 'Подробнее'),
      cta_href: pickOwned(raw, 'cta_href', defaults.cta_href, section?.cta_href, '/about'),
    }
  }

  // Any section-linked portfolio widget: seed title/subtitle/cta from homepage_sections.
  if (section) {
    return {
      ...base,
      title: pickOwned(raw, 'title', defaults.title, section.title),
      subtitle: pickOwned(raw, 'subtitle', defaults.subtitle, section.subtitle),
      ...(Object.prototype.hasOwnProperty.call(defaults, 'cta_label') || 'cta_label' in raw
        ? {
            cta_label: pickOwned(raw, 'cta_label', defaults.cta_label, section.cta_label),
            cta_href: pickOwned(raw, 'cta_href', defaults.cta_href, section.cta_href),
          }
        : {}),
    }
  }

  return { ...defaults, ...base }
}

/** Missing from layout (never written). Empty string is intentional — do not bake over it. */
function isMissingSetting(raw: Record<string, unknown>, key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(raw, key) || raw[key] == null
}

function isHeroStubValue(key: string, v: unknown): boolean {
  if (key === 'background_media_id') return v == null || v === ''
  // Hrefs like "/" are valid; only treat empty as missing for links.
  if (key.endsWith('_href') || key === 'href') return v == null || String(v).trim() === ''
  return isPlaceholderText(v)
}

function isEmptySetting(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  return false
}

function bakeElement(el: BuilderElementDTO, ctx: EditorSettingsCtx): BuilderElementDTO {
  const kids = el.elements?.map((c) => bakeElement(c, ctx))
  if (el.elType !== 'widget' || !el.widgetType) {
    return kids ? { ...el, elements: kids } : el
  }

  const def = getWidget(el.widgetType)
  const raw = { ...(el.settings ?? {}) }
  const defaults = def?.defaultSettings ?? {}
  const resolved = resolveEditorSettings(el.widgetType, raw, defaults, ctx)

  const keys = new Set<string>([
    ...Object.keys(defaults),
    ...Object.keys(resolved),
    ...(def?.settingsFields ?? []).map((f) => f.key),
  ])
  keys.delete('styles')
  keys.delete('fieldStyles')
  keys.delete('hidden')

  let changed = false
  const next: Record<string, unknown> = { ...raw }
  for (const key of keys) {
    const missing = isMissingSetting(raw, key)
      || (el.widgetType === 'hero' && isHeroStubValue(key, raw[key]))
    if (!missing) continue
    const baked = resolved[key]
    if (isEmptySetting(baked)) continue
    if (raw[key] === baked) continue
    next[key] = baked
    changed = true
  }

  if (!changed && !kids) return el
  return {
    ...el,
    settings: next,
    ...(kids ? { elements: kids } : {}),
  }
}

/**
 * Copy defaults/CMS seeds into empty widget settings so the layout is the source of truth.
 * Safe to run repeatedly: never overwrites non-empty keys.
 */
export function bakeLayoutContent(layout: PageLayout, ctx: EditorSettingsCtx): PageLayout {
  return {
    ...layout,
    elements: (layout.elements ?? []).map((el) => bakeElement(el, ctx)),
  }
}

export function layoutContentChanged(a: PageLayout, b: PageLayout): boolean {
  return JSON.stringify(a.elements) !== JSON.stringify(b.elements)
}
