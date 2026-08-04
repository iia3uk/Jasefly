import type { Project, ProjectTech } from '@/types'

/** Lifecycle statuses excluded from auto-filled product grids / stack. */
export function isCancelledProject(project: Pick<Project, 'project_status'>): boolean {
  return String(project.project_status || '').toLowerCase() === 'cancelled'
}

export function isPublishedProject(project: Pick<Project, 'status'>): boolean {
  const s = String(project.status || 'published').toLowerCase()
  return s === 'published' || s === ''
}

function techName(t: ProjectTech | string): string {
  if (typeof t === 'string') return t.trim()
  return String(t?.name || '').trim()
}

/** One short plain-text line for compact cards / autofill labels. */
export function projectOneLine(project: Pick<Project, 'short_description' | 'description'>, max = 72): string {
  const raw = String(project.short_description || project.description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return ''
  if (raw.length <= max) return raw
  const cut = raw.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`
}

function shortBlurb(project: Project, max = 72): string {
  return projectOneLine(project, max)
}

export type ProjectFeedCard = {
  id: string | number
  slug: string
  title: string
  label: string
}

export type LeadStackProjects = {
  primary: Project | null
  secondary: Project[]
}

function featuredPriorityOf(p: Pick<Project, 'featured_priority'>): number {
  const n = Number(p.featured_priority)
  return Number.isFinite(n) ? n : 0
}

/**
 * Order for showcase: highest featured_priority first, then lowest sort_order.
 * Optional primarySlug forces the lead without duplicating project content.
 */
export function sortProjectsForShowcase(
  projects: Project[] | undefined | null,
  primarySlug?: string,
): Project[] {
  const rows = (projects || []).slice()
  rows.sort((a, b) => {
    const pd = featuredPriorityOf(b) - featuredPriorityOf(a)
    if (pd !== 0) return pd
    return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
  })
  const slug = String(primarySlug || '').trim().toLowerCase()
  if (!slug) return rows
  const idx = rows.findIndex((p) => String(p.slug || '').toLowerCase() === slug)
  if (idx <= 0) return rows
  const [picked] = rows.splice(idx, 1)
  return [picked, ...rows]
}

/** Lead + up to two secondary cards for lead-with-stack layout. */
export function pickLeadStackProjects(
  projects: Project[] | undefined | null,
  opts: { limit?: number; primarySlug?: string } = {},
): LeadStackProjects {
  const limit = Math.max(1, Number(opts.limit || 3))
  const ordered = sortProjectsForShowcase(projects, opts.primarySlug).slice(0, limit)
  if (!ordered.length) return { primary: null, secondary: [] }
  return {
    primary: ordered[0],
    secondary: ordered.slice(1, 3),
  }
}

/**
 * Active portfolio projects for R&D autofill: published, not cancelled, sort_order.
 */
export function activeProjectsFeed(projects: Project[] | undefined | null): {
  cards: ProjectFeedCard[]
  tags: string[]
} {
  const rows = (projects || [])
    .filter((p) => isPublishedProject(p) && !isCancelledProject(p))
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))

  const cards: ProjectFeedCard[] = rows.map((p) => {
    const title = String(p.title || 'Проект')
    const blurb = shortBlurb(p)
    return {
      id: p.id,
      slug: String(p.slug || ''),
      title,
      label: blurb ? `${title} — ${blurb}` : title,
    }
  })

  const seen = new Set<string>()
  const tags: string[] = []
  for (const p of rows) {
    const list = Array.isArray(p.technologies) ? p.technologies : []
    for (const t of list) {
      const name = techName(t)
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tags.push(name)
    }
  }

  return { cards, tags }
}

export type PortfolioStat = {
  id: string
  value: number | string
  suffix?: string
  label: string
}

function activeRows(projects: Project[] | undefined | null): Project[] {
  return (projects || []).filter((p) => isPublishedProject(p) && !isCancelledProject(p))
}

function statusOf(p: Project): string {
  return String(p.project_status || '').toLowerCase()
}

/** Unique game-engine families mentioned in project tech / copy. */
export function countGameEngines(projects: Project[] | undefined | null): number {
  const found = new Set<string>()
  for (const p of activeRows(projects)) {
    const techBlob = (Array.isArray(p.technologies) ? p.technologies : [])
      .map(techName)
      .join(' ')
    const blob = `${p.title || ''} ${p.short_description || ''} ${techBlob}`.toLowerCase()
    if (/\bunity\b/.test(blob)) found.add('unity')
    if (/\bunreal\b/.test(blob)) found.add('unreal')
    if (/\bgodot\b/.test(blob)) found.add('godot')
    if (/\bsource\s*2\b/.test(blob)) found.add('source2')
  }
  return found.size
}

/**
 * Live portfolio KPIs for StatsStrip — derived from projects (excludes cancelled).
 * Labels match the classic about strip on iia3uk.
 */
export function projectPortfolioStats(projects: Project[] | undefined | null): PortfolioStat[] {
  const rows = activeRows(projects)
  const completed = rows.filter((p) => statusOf(p) === 'completed').length
  const inProgress = rows.filter((p) => statusOf(p) === 'in_progress').length
  const engines = countGameEngines(rows)

  return [
    { id: 'auto-total', value: rows.length, label: 'Проектов end-to-end' },
    { id: 'auto-completed', value: completed, label: 'Завершённых релизов' },
    { id: 'auto-wip', value: inProgress, label: 'В активной разработке' },
    { id: 'auto-engines', value: engines, label: 'Игровых движка' },
  ]
}
