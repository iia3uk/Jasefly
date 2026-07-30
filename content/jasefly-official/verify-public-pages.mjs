/**
 * Read-only public API dump for verification (no admin token).
 * node content/jasefly-official/verify-public-pages.mjs
 */
import fs from 'node:fs'

const BASE = 'https://jasefly.com/api/v1'

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
        if (s.cta1_href) acc.ctas.push({ label: s.cta1_label, href: s.cta1_href })
        if (s.cta2_href) acc.ctas.push({ label: s.cta2_label, href: s.cta2_href })
      }
      if (['compare-block', 'showcase-block', 'cta-block', 'features-grid', 'cta-banner'].includes(wt)) {
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

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

const siteRaw = await getJson('/site')
const site = siteRaw?.data ?? siteRaw
const home = site.home_page
const pages = {}
const allParas = []

function ingest(p, slugOverride) {
  const slug = slugOverride || p.slug
  const layout = p.layout || (p.layout_json ? JSON.parse(p.layout_json) : null)
  const acc = layout?.elements ? walk(layout.elements) : { h1: [], h2: [], ctas: [], links: [], paras: [], titles: [] }
  if (p.content) {
    const t = String(p.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (t) acc.paras.push(t)
    for (const m of String(p.content).matchAll(/href="([^"]+)"/g)) acc.links.push(m[1])
  }
  for (const para of acc.paras) {
    if (para.length > 40) allParas.push({ slug, text: para, n: norm(para) })
  }
  pages[slug] = {
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
    headings: [...acc.h2, ...acc.titles],
    ctas: acc.ctas,
    links: [...new Set(acc.links)],
    para_count: acc.paras.length,
    sample_paras: acc.paras.slice(0, 8).map((x) => x.slice(0, 220)),
    all_paras: acc.paras,
  }
}

if (home) ingest({ ...home, slug: '__home' }, '__home')

const slugs = [
  'features', 'workflow', 'modules', 'mcp', 'shared-hosting', 'docs', 'updates',
  'about', 'contact', 'privacy', 'terms', 'blog', 'api-docs',
]
for (const s of slugs) {
  const raw = await getJson(`/pages/${s}`)
  const p = raw?.data ?? raw
  ingest(p)
  await new Promise((r) => setTimeout(r, 250))
}

const byNorm = new Map()
for (const row of allParas) {
  if (!byNorm.has(row.n)) byNorm.set(row.n, [])
  byNorm.get(row.n).push(row)
}
const exactDupes = [...byNorm.entries()]
  .filter(([, rows]) => new Set(rows.map((r) => r.slug)).size > 1)
  .map(([, rows]) => ({
    excerpt: rows[0].text.slice(0, 180),
    pages: [...new Set(rows.map((r) => r.slug))],
  }))

const near = []
const prefixes = new Map()
for (const row of allParas) {
  const pref = row.n.slice(0, 80)
  if (pref.length < 50) continue
  if (!prefixes.has(pref)) prefixes.set(pref, [])
  prefixes.get(pref).push(row)
}
for (const [, rows] of prefixes) {
  const slugsSet = [...new Set(rows.map((r) => r.slug))]
  if (slugsSet.length > 1) near.push({ excerpt: rows[0].text.slice(0, 180), pages: slugsSet })
}

const seoTitles = Object.values(pages).map((p) => p.seo_title)
const seoDescs = Object.values(pages).map((p) => p.seo_description)
const titleDupes = seoTitles.filter((t, i) => t && seoTitles.indexOf(t) !== i)
const descDupes = seoDescs.filter((t, i) => t && seoDescs.indexOf(t) !== i)

// collect internal links from pages + footer
const footer = site.footer || {}
let columns = []
try { columns = footer.columns_json ? JSON.parse(footer.columns_json) : [] } catch { columns = [] }
const footerLinks = columns.flatMap((c) => (c.links || []).map((l) => ({ col: c.title, ...l })))
const nav = (site.navigation || site.nav || []).map((n) => ({ label: n.label, href: n.href, location: n.location }))

const allInternal = new Set()
for (const p of Object.values(pages)) {
  for (const l of p.links) if (l.startsWith('/')) allInternal.add(l)
  for (const c of p.ctas) if ((c.href || '').startsWith('/')) allInternal.add(c.href)
}
for (const l of footerLinks) if ((l.href || '').startsWith('/')) allInternal.add(l.href)
for (const n of nav) if ((n.href || '').startsWith('/')) allInternal.add(n.href)

const linkChecks = {}
for (const href of [...allInternal].sort()) {
  const path = href.split('#')[0]
  if (!path || path === '/') { linkChecks[href] = 'home'; continue }
  const slug = path.replace(/^\//, '')
  try {
    const res = await fetch(`${BASE}/pages/${slug}`)
    linkChecks[href] = res.status
  } catch (e) {
    linkChecks[href] = String(e)
  }
  await new Promise((r) => setTimeout(r, 150))
}

// blog list
let blog = []
try {
  const br = await getJson('/blog')
  const list = br?.data ?? br
  blog = (Array.isArray(list) ? list : []).map((b) => ({
    id: b.id, slug: b.slug, title: b.title, seo_title: b.seo_title, seo_description: b.seo_description, excerpt: b.excerpt, status: b.status,
  }))
} catch (e) {
  blog = { error: String(e) }
}

const result = {
  source: 'public_api',
  pages,
  exactDupes,
  nearDupes: near,
  seoTitleDupes: [...new Set(titleDupes)],
  seoDescDupes: [...new Set(descDupes)],
  footer: { tagline: footer.tagline, columns, copyright: footer.copyright_text },
  hero: site.hero,
  contact: site.contact_info || site.contact,
  nav,
  footerLinks,
  linkChecks,
  blog,
  profile: site.profile,
  seo_settings: site.seo_settings,
}

fs.writeFileSync('content/jasefly-official/_verify-public-pages.json', JSON.stringify(result, null, 2))
console.log('wrote content/jasefly-official/_verify-public-pages.json')
console.log('pages', Object.keys(pages).length, 'exactDupes', exactDupes.length, 'nearDupes', near.length)
console.log('seoTitleDupes', result.seoTitleDupes.length, 'broken?', Object.entries(linkChecks).filter(([, v]) => v !== 200 && v !== 'home'))
