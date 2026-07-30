/**
 * Live CMS blocker fixes only (no copy rewrite).
 * - rename modules → cms-modules
 * - patch hrefs /modules → /cms-modules
 * - hero fallback aligned with builder home
 * - terms H1
 * - cookie banner text without analytics
 * - path redirect /modules → /cms-modules (for PHP-reachable requests)
 *
 * node content/jasefly-official/fix-blockers-live.mjs
 */
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'

loadMcpEnv()
const client = clientFromEnv()

const OLD = '/modules'
const NEW_SLUG = 'cms-modules'
const NEW = `/${NEW_SLUG}`

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function listPages() {
  const res = await client.get('/admin/pages')
  const rows = res?.data ?? res
  return Array.isArray(rows) ? rows : []
}

function rewriteModulesHref(value) {
  if (typeof value === 'string') {
    return value
      .replaceAll('href="/modules"', `href="${NEW}"`)
      .replaceAll("href='/modules'", `href='${NEW}'`)
      .replaceAll('"/modules"', `"${NEW}"`)
      .replaceAll("'/modules'", `'${NEW}'`)
  }
  if (Array.isArray(value)) return value.map(rewriteModulesHref)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = rewriteModulesHref(v)
    return out
  }
  return value
}

async function renameModulesPage(pages) {
  const page = pages.find((p) => p.slug === 'modules' || p.slug === NEW_SLUG)
  if (!page) throw new Error('modules page not found')
  if (page.slug === NEW_SLUG) {
    console.log('page already', NEW_SLUG, 'id=' + page.id)
    return page
  }
  console.log('rename page id=' + page.id, 'modules →', NEW_SLUG)
  await client.put(`/admin/pages/${page.id}`, { slug: NEW_SLUG })
  await sleep(2200)
  return { ...page, slug: NEW_SLUG }
}

async function patchNav() {
  const res = await client.get('/admin/navigation')
  const rows = res?.data ?? res
  const list = Array.isArray(rows) ? rows : []
  for (const n of list) {
    if (String(n.href || '').replace(/\/$/, '') === OLD) {
      console.log('nav', n.id, n.label, '→', NEW)
      await client.put(`/admin/navigation/${n.id}`, {
        label: n.label,
        href: NEW,
        location: n.location,
        sort_order: n.sort_order,
        is_visible: n.is_visible,
      })
      await sleep(2200)
    }
  }
}

async function patchFooter() {
  const res = await client.get('/admin/footer')
  const footer = res?.data ?? res
  let columns = []
  try {
    columns = footer.columns_json ? JSON.parse(footer.columns_json) : []
  } catch {
    columns = []
  }
  const next = rewriteModulesHref(columns)
  console.log('footer columns_json rewrite /modules →', NEW)
  await client.put('/admin/footer', {
    copyright_text: footer.copyright_text,
    tagline: footer.tagline,
    show_social: footer.show_social,
    columns_json: JSON.stringify(next),
  })
  await sleep(4500)
}

async function patchPageHrefs(pages) {
  for (const p of pages) {
    const full = (await client.get(`/admin/pages/${p.id}`))?.data ?? (await client.get(`/admin/pages/${p.id}`))
    await sleep(2200)
    const layout = full.layout || (full.layout_json ? JSON.parse(full.layout_json) : null)
    const content = full.content || ''
    const layoutStr = layout ? JSON.stringify(layout) : ''
    const needs =
      layoutStr.includes(OLD) || String(content).includes(OLD) || String(content).includes('href="/modules"')
    if (!needs) continue
    console.log('rewrite hrefs in page', full.slug, 'id=' + full.id)
    const data = {}
    if (layout) data.layout = rewriteModulesHref(layout)
    if (content && String(content).includes(OLD)) data.content = rewriteModulesHref(String(content))
    await client.put(`/admin/pages/${full.id}`, data)
    await sleep(2200)
  }
}

async function patchHeroFallback() {
  console.log('hero singleton ← builder home messaging')
  await client.put('/admin/hero', {
    headline: 'Не ищите ещё один плагин. Соберите сайт таким, каким он нужен именно вам.',
    subheadline:
      'Jasefly — готовая модульная CMS. Ведите сайт через админку или развивайте проект вместе с AI. Большинство нужных возможностей уже есть после установки.',
    badge_text: 'Работает на обычном PHP-хостинге',
    primary_cta_label: 'Попробовать Jasefly',
    primary_cta_href: 'https://github.com/iia3uk/jasefly',
    secondary_cta_label: 'Посмотреть, как это работает',
    secondary_cta_href: '/workflow',
  })
  await sleep(4500)
}

async function patchTermsH1(pages) {
  const page = pages.find((p) => p.slug === 'terms')
  if (!page) throw new Error('terms page missing')
  const full = (await client.get(`/admin/pages/${page.id}`))?.data ?? (await client.get(`/admin/pages/${page.id}`))
  await sleep(2200)
  let content = String(full.content || '')
  if (/<h1[\s>]/i.test(content)) {
    console.log('terms already has H1')
    return
  }
  content = `<h1>Условия использования</h1>\n${content}`
  console.log('terms add H1 id=' + page.id)
  await client.put(`/admin/pages/${page.id}`, { content })
  await sleep(4500)
}

async function patchCookieBannerText() {
  const res = await client.get('/admin/site-settings')
  const s = res?.data ?? res
  const next =
    'Мы используем необходимые cookies для работы сайта. Подробнее — в политике конфиденциальности.'
  console.log('site_settings.cookie_banner_text → necessary-only')
  await client.put('/admin/site-settings', {
    ...s,
    cookie_banner_text: next,
  })
  await sleep(4500)
}

async function ensureRedirect() {
  try {
    const list = await client.get('/admin/redirects')
    const rows = list?.data ?? list
    const existing = Array.isArray(rows)
      ? rows.find((r) => String(r.from_path || '').replace(/\/$/, '') === OLD)
      : null
    if (existing) {
      console.log('update redirect', existing.id)
      await client.put(`/admin/redirects/${existing.id}`, {
        from_path: OLD,
        to_path: NEW,
        status_code: 301,
        is_active: 1,
        note: 'Avoid collision with /modules/ package assets',
      })
    } else {
      console.log('create redirect', OLD, '→', NEW)
      await client.post('/admin/redirects', {
        from_path: OLD,
        to_path: NEW,
        status_code: 301,
        is_active: 1,
        note: 'Avoid collision with /modules/ package assets',
      })
    }
  } catch (e) {
    console.warn('redirect API unavailable (ok if htaccess handles it):', e.message || e)
  }
  await sleep(4500)
}

async function main() {
  // Hosting: ~15 req/min — keep spacing high; script is idempotent for re-run.
  let pages = await listPages()
  await sleep(4500)
  await renameModulesPage(pages)
  pages = await listPages()
  await sleep(4500)
  await patchNav()
  await patchFooter()
  await patchPageHrefs(pages)
  await patchHeroFallback()
  await patchTermsH1(pages)
  await patchCookieBannerText()
  await ensureRedirect()
  console.log('DONE blockers live CMS')
}

main().catch((e) => {
  console.error(e.message || e)
  if (e.payload) console.error(JSON.stringify(e.payload, null, 2))
  process.exit(1)
})
