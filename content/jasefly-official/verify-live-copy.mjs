/**
 * Verification: dump live page proofs (no writes).
 * node content/jasefly-official/verify-live-copy.mjs
 */
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'
import fs from 'node:fs'

loadMcpEnv()
const c = clientFromEnv()

function walk(nodes, acc = { h1: [], h2: [], ctas: [], links: [], paras: [], titles: [] }) {
  for (const n of nodes || []) {
    if (n.elType === 'widget') {
      const s = n.settings || {}
      const wt = n.widgetType
      if (wt === 'heading') {
        if (s.tag === 'h1') acc.h1.push(s.text)
        else acc.h2.push(s.text)
      }
      if (typeof s.html === 'string') {
        const t = s.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        if (t) acc.paras.push(t)
        for (const m of s.html.matchAll(/href="([^"]+)"/g)) acc.links.push(m[1])
      }
      if (s.cta_href) acc.ctas.push({ label: s.cta_label, href: s.cta_href })
      if (s.cta1_href) acc.ctas.push({ label: s.cta1_label, href: s.cta1_href })
      if (s.cta2_href) acc.ctas.push({ label: s.cta2_label, href: s.cta2_href })
      if (Array.isArray(s.items)) {
        for (const it of s.items) {
          if (it.title) acc.titles.push(it.title)
          if (it.body) acc.paras.push(`${it.title || ''}: ${it.body}`.trim())
          if (it.q) acc.h2.push(it.q)
          if (it.a) acc.paras.push(String(it.a))
          if (it.text && it.label) acc.paras.push(`${it.label}: ${it.text}`)
        }
      }
      if (wt === 'hero-block') {
        acc.h1.push([s.title_1, s.title_2].filter(Boolean).join(' / '))
        if (s.body) acc.paras.push(s.body)
        if (s.badge) acc.paras.push(s.badge)
      }
      if (['compare-block', 'showcase-block', 'cta-block', 'features-grid'].includes(wt)) {
        if (s.title) acc.h2.push(s.title)
        if (s.subtitle) acc.paras.push(s.subtitle)
        if (s.body) acc.paras.push(s.body)
      }
      if (wt === 'pipeline-panel' && Array.isArray(s.steps)) {
        for (const st of s.steps) acc.paras.push(`${st.label}: ${st.text}`)
      }
    }
    if (n.elements) walk(n.elements, acc)
  }
  return acc
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[«»""„]/g, '"')
    .trim()
}

const pageIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15]
const pages = {}
const allParas = []

for (const id of pageIds) {
  const r = await c.get(`/admin/pages/${id}`)
  const p = r?.data ?? r
  const layout = p.layout || (p.layout_json ? JSON.parse(p.layout_json) : null)
  const acc = layout?.elements ? walk(layout.elements) : { h1: [], h2: [], ctas: [], links: [], paras: [], titles: [] }
  if (p.content) {
    const t = String(p.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (t) acc.paras.push(t)
    for (const m of String(p.content).matchAll(/href="([^"]+)"/g)) acc.links.push(m[1])
  }
  for (const para of acc.paras) {
    if (para.length > 40) allParas.push({ slug: p.slug, text: para, n: norm(para) })
  }
  pages[p.slug] = {
    id: p.id,
    title: p.title,
    seo_title: p.seo_title,
    seo_description: p.seo_description,
    template: p.template,
    status: p.status,
    has_layout: !!(layout?.elements?.length),
    meta_useOnSite: layout?.meta?.useOnSite ?? null,
    meta_seed: layout?.meta?.seed ?? null,
    h1: acc.h1,
    headings: [...acc.h2, ...acc.titles].slice(0, 40),
    ctas: acc.ctas,
    links: [...new Set(acc.links)],
    para_count: acc.paras.length,
    sample_paras: acc.paras.slice(0, 6).map((x) => x.slice(0, 180)),
  }
  // hosting: max ~15 req/min — stay under with ~5s spacing
  await new Promise((r) => setTimeout(r, 5200))
}

// duplicate detection
const byNorm = new Map()
for (const row of allParas) {
  if (!byNorm.has(row.n)) byNorm.set(row.n, [])
  byNorm.get(row.n).push(row)
}
const exactDupes = [...byNorm.entries()]
  .filter(([, rows]) => new Set(rows.map((r) => r.slug)).size > 1)
  .map(([n, rows]) => ({
    excerpt: rows[0].text.slice(0, 160),
    pages: [...new Set(rows.map((r) => r.slug))],
  }))

// near-dupes: shared first 80 chars across pages
const near = []
const prefixes = new Map()
for (const row of allParas) {
  const pref = row.n.slice(0, 80)
  if (pref.length < 50) continue
  if (!prefixes.has(pref)) prefixes.set(pref, [])
  prefixes.get(pref).push(row)
}
for (const [pref, rows] of prefixes) {
  const slugs = [...new Set(rows.map((r) => r.slug))]
  if (slugs.length > 1) near.push({ excerpt: rows[0].text.slice(0, 160), pages: slugs })
}

const footer = (await c.get('/admin/footer'))?.data ?? (await c.get('/admin/footer'))
await new Promise((r) => setTimeout(r, 2200))
const hero = (await c.get('/admin/hero'))?.data ?? (await c.get('/admin/hero'))
await new Promise((r) => setTimeout(r, 2200))
const contact = (await c.get('/admin/contact-info'))?.data ?? (await c.get('/admin/contact-info'))
await new Promise((r) => setTimeout(r, 2200))
const blogRaw = (await c.get('/admin/blog'))?.data ?? (await c.get('/admin/blog'))
const blog = (Array.isArray(blogRaw) ? blogRaw : []).map((b) => ({
  id: b.id,
  slug: b.slug,
  title: b.title,
  seo_title: b.seo_title,
  seo_description: b.seo_description,
  excerpt: b.excerpt,
  status: b.status,
}))

const seoTitles = Object.values(pages).map((p) => p.seo_title)
const seoDescs = Object.values(pages).map((p) => p.seo_description)
const titleDupes = seoTitles.filter((t, i) => seoTitles.indexOf(t) !== i)
const descDupes = seoDescs.filter((t, i) => seoDescs.indexOf(t) !== i)

const result = {
  pages,
  exactDupes,
  nearDupes: near,
  seoTitleDupes: [...new Set(titleDupes)],
  seoDescDupes: [...new Set(descDupes)],
  footer: {
    tagline: footer?.tagline,
    columns: footer?.columns_json ? JSON.parse(footer.columns_json) : null,
  },
  hero,
  contact,
  blog,
}

fs.writeFileSync('content/jasefly-official/_verify-live-copy.json', JSON.stringify(result, null, 2))
console.log('wrote content/jasefly-official/_verify-live-copy.json')
console.log('pages', Object.keys(pages).length, 'exactDupes', exactDupes.length, 'nearDupes', near.length)
