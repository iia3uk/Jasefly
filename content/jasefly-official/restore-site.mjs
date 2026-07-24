/**
 * Emergency restore: navigation + pages + blog after wipe.
 * node content/jasefly-official/restore-site.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'
import { posts } from './blog-posts.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadMcpEnv()
const client = clientFromEnv()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Soft pacing under hosting soft rate limit (~15/min). */
async function paced(fn) {
  const out = await fn()
  await sleep(4500)
  return out
}

const NAV = [
  { label: 'Возможности', href: '/features', location: 'header', sort_order: 1 },
  { label: 'Как это работает', href: '/workflow', location: 'header', sort_order: 2 },
  { label: 'Модули', href: '/modules', location: 'header', sort_order: 3 },
  { label: 'MCP', href: '/mcp', location: 'header', sort_order: 4 },
  { label: 'Документация', href: '/docs', location: 'header', sort_order: 5 },
  { label: 'Блог', href: '/blog', location: 'header', sort_order: 6 },
  { label: 'Обновления', href: '/updates', location: 'header', sort_order: 7 },
  { label: 'О проекте', href: '/about', location: 'header', sort_order: 8 },
  { label: 'Начать работу', href: '/docs', location: 'header', sort_order: 9 },
  { label: 'Контакты', href: '/contact', location: 'footer', sort_order: 1 },
  { label: 'Документация', href: '/docs', location: 'footer', sort_order: 2 },
  { label: 'Блог', href: '/blog', location: 'footer', sort_order: 3 },
  { label: 'Политика', href: '/privacy', location: 'footer', sort_order: 4 },
]

async function restoreNav() {
  const existing = await client.get('/admin/navigation')
  const list = existing?.data ?? existing ?? []
  const arr = Array.isArray(list) ? list : []
  console.log('nav existing', arr.length)
  if (arr.length > 0) {
    console.log('nav already present — skip create')
    return
  }
  for (const item of NAV) {
    await paced(() =>
      client.post('/admin/navigation', {
        ...item,
        is_visible: 1,
        target: '_self',
      }),
    )
    console.log('nav +', item.location, item.label)
  }
}

async function restorePages() {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  const homeLayout = JSON.parse(fs.readFileSync(path.join(__dirname, '_home_atoms_layout.json'), 'utf8'))
  homeLayout.meta = {
    ...(homeLayout.meta || {}),
    scroll_snap: 'none',
    scroll_smooth: false,
    revision: 'restore-no-snap-2026-07-22',
  }

  // Ensure home is correct + no document snap
  await paced(() =>
    client.put('/admin/pages/1', {
      title: 'Главная',
      slug: '__home',
      is_home: true,
      status: 'published',
      template: 'builder',
      layout: homeLayout,
      seo_title: 'Jasefly CMS — модульная CMS с MCP и AI',
      seo_description:
        'Jasefly CMS объединяет локальную сборку, Page Builder, MCP-доступ для AI-агентов, управляемые ZIP-обновления и развёртывание на PHP/MySQL-хостинге.',
    }),
  )
  console.log('home updated (snap off)')

  const pagesRes = await paced(() => client.get('/admin/pages'))
  const pages = pagesRes?.data ?? pagesRes ?? []
  const bySlug = new Map((Array.isArray(pages) ? pages : []).map((p) => [p.slug, p]))

  for (const item of manifest) {
    if (item.slug === '__home') continue
    const page = JSON.parse(fs.readFileSync(path.join(__dirname, item.file), 'utf8'))
    const data = {
      title: page.title || item.title,
      slug: page.slug || item.slug,
      status: 'published',
      seo_title: page.seo_title || null,
      seo_description: page.seo_description || null,
      layout: page.layout || null,
      template: page.slug === 'contact' || page.slug === 'blog' ? 'system' : 'builder',
    }
    const existing = bySlug.get(data.slug)
    if (existing?.id) {
      await paced(() => client.put(`/admin/pages/${existing.id}`, data))
      console.log('page update', data.slug, existing.id)
    } else {
      const res = await paced(() => client.post('/admin/pages', data))
      console.log('page create', data.slug, res?.data?.id ?? res?.id)
    }
  }
}

async function restoreBlog() {
  const blogRes = await paced(() => client.get('/admin/blog'))
  const existing = blogRes?.data ?? blogRes ?? []
  const arr = Array.isArray(existing) ? existing : []
  const bySlug = new Map(arr.map((p) => [p.slug, p]))
  console.log('blog existing', arr.length)

  for (const p of posts) {
    const data = {
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      content: p.content,
      seo_title: p.seo_title,
      seo_description: p.seo_description,
      status: 'published',
    }
    const ex = bySlug.get(p.slug)
    if (ex?.id) {
      await paced(() => client.put(`/admin/blog/${ex.id}`, data))
      console.log('blog update', p.slug)
    } else {
      const res = await paced(() => client.post('/admin/blog', data))
      const id = res?.data?.id ?? res?.id
      if (id) {
        try {
          await paced(() => client.post(`/admin/blog/${id}/publish`, { status: 'published' }))
        } catch {
          /* status may already be published */
        }
      }
      console.log('blog create', p.slug, id)
    }
  }
}

async function main() {
  await client.ensureAuth()
  await restoreNav()
  await restorePages()
  await restoreBlog()
  console.log('RESTORE DONE')
}

main().catch((e) => {
  console.error(e.message || e)
  if (e.payload) console.error(JSON.stringify(e.payload, null, 2))
  process.exit(1)
})
