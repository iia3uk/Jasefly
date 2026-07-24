import { adminUrl } from '@/admin/adminBasePath'
import { isPluginEnabledReady } from '@/core/moduleRegistry'
import { endpoints } from '@/lib/api'
import type { BlogPost, MediaAsset, Page, Project } from '@/types'

export type HealthKind = 'cover' | 'seo' | 'slug' | 'summary' | 'draft' | 'scheduled' | 'alt'

export type HealthIssue = {
  kind: HealthKind
  resource: 'projects' | 'blog' | 'pages' | 'media'
  id: string | number
  title: string
  href: string
  label: string
}

export type ContentHealthReport = {
  issues: HealthIssue[]
  counts: Record<HealthKind, number>
  projectGaps: number
  blogGaps: number
  pageGaps: number
  mediaAltGaps: number
}

const KIND_LABEL: Record<HealthKind, string> = {
  cover: 'Нет обложки',
  seo: 'Нет SEO',
  slug: 'Нет slug',
  summary: 'Нет краткого описания',
  draft: 'Черновик',
  scheduled: 'Ждёт публикации',
  alt: 'Нет alt',
}

function empty(v: unknown): boolean {
  return v == null || String(v).trim() === ''
}

function scanProject(p: Project): HealthIssue[] {
  const id = p.id
  const title = String(p.title || `#${id}`)
  const href = adminUrl(`/projects/${id}`)
  const out: HealthIssue[] = []
  if (empty(p.cover_media_id)) {
    out.push({ kind: 'cover', resource: 'projects', id, title, href, label: KIND_LABEL.cover })
  }
  if (empty(p.seo_title) || empty(p.seo_description)) {
    out.push({ kind: 'seo', resource: 'projects', id, title, href, label: KIND_LABEL.seo })
  }
  if (empty(p.slug)) {
    out.push({ kind: 'slug', resource: 'projects', id, title, href, label: KIND_LABEL.slug })
  }
  if (String(p.status) === 'published' && empty(p.short_description)) {
    out.push({ kind: 'summary', resource: 'projects', id, title, href, label: KIND_LABEL.summary })
  }
  return out
}

function scanPost(p: BlogPost): HealthIssue[] {
  const id = p.id
  const title = String(p.title || `#${id}`)
  const href = adminUrl(`/blog/${id}`)
  const out: HealthIssue[] = []
  if (empty(p.cover_media_id)) {
    out.push({ kind: 'cover', resource: 'blog', id, title, href, label: KIND_LABEL.cover })
  }
  if (empty(p.seo_title) || empty(p.seo_description)) {
    out.push({ kind: 'seo', resource: 'blog', id, title, href, label: KIND_LABEL.seo })
  }
  if (empty(p.slug)) {
    out.push({ kind: 'slug', resource: 'blog', id, title, href, label: KIND_LABEL.slug })
  }
  if (String(p.status) === 'published' && empty(p.excerpt)) {
    out.push({ kind: 'summary', resource: 'blog', id, title, href, label: KIND_LABEL.summary })
  }
  return out
}

function scanPage(p: Page): HealthIssue[] {
  const id = p.id
  const title = String(p.title || `#${id}`)
  const href = adminUrl(`/pages/${id}/builder`)
  const out: HealthIssue[] = []
  const status = String(p.status || '')
  const scheduled = p.scheduled_at ? String(p.scheduled_at) : ''

  if (status === 'draft' && scheduled) {
    const when = new Date(scheduled.includes('T') ? scheduled : scheduled.replace(' ', 'T'))
    if (!Number.isNaN(when.getTime()) && when.getTime() > Date.now()) {
      out.push({ kind: 'scheduled', resource: 'pages', id, title, href, label: KIND_LABEL.scheduled })
    }
  }
  if (status === 'draft' && !scheduled) {
    out.push({ kind: 'draft', resource: 'pages', id, title, href, label: KIND_LABEL.draft })
  }
  if (empty(p.seo_title) || empty(p.seo_description)) {
    out.push({ kind: 'seo', resource: 'pages', id, title, href, label: KIND_LABEL.seo })
  }
  if (!p.is_home && empty(p.slug)) {
    out.push({ kind: 'slug', resource: 'pages', id, title, href, label: KIND_LABEL.slug })
  }
  return out
}

export async function fetchContentHealth(): Promise<ContentHealthReport> {
  const [projects, posts, pages, media] = await Promise.all([
    isPluginEnabledReady('projects')
      ? endpoints.adminList<Project>('projects').catch(() => [] as Project[])
      : Promise.resolve([] as Project[]),
    isPluginEnabledReady('blog')
      ? endpoints.adminList<BlogPost>('blog').catch(() => [] as BlogPost[])
      : Promise.resolve([] as BlogPost[]),
    endpoints.adminList<Page>('pages').catch(() => [] as Page[]),
    endpoints.mediaList({}).catch(() => [] as MediaAsset[]),
  ])

  const projectIssues = projects.flatMap(scanProject)
  const blogIssues = posts.flatMap(scanPost)
  const pageIssues = pages.flatMap(scanPage)
  const mediaAltIssues: HealthIssue[] = media
    .filter((m) => empty(m.alt_text) && String(m.mime_type || '').startsWith('image/'))
    .slice(0, 40)
    .map((m) => ({
      kind: 'alt' as const,
      resource: 'media' as const,
      id: m.id,
      title: String(m.original_name || m.filename || `#${m.id}`),
      href: adminUrl('/media?missing_alt=1'),
      label: KIND_LABEL.alt,
    }))

  const issues = [...pageIssues, ...projectIssues, ...blogIssues, ...mediaAltIssues]

  const counts: Record<HealthKind, number> = {
    cover: 0,
    seo: 0,
    slug: 0,
    summary: 0,
    draft: 0,
    scheduled: 0,
    alt: 0,
  }
  for (const issue of issues) counts[issue.kind] += 1

  return {
    issues,
    counts,
    projectGaps: new Set(projectIssues.map((i) => String(i.id))).size,
    blogGaps: new Set(blogIssues.map((i) => String(i.id))).size,
    pageGaps: new Set(pageIssues.map((i) => String(i.id))).size,
    mediaAltGaps: mediaAltIssues.length,
  }
}
