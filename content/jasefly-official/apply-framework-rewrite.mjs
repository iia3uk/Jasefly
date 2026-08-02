/**
 * Apply framework-first EN layouts + chrome to live CMS.
 * node content/jasefly-official/apply-framework-rewrite.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const layoutsDir = path.join(__dirname, 'layouts')

loadMcpEnv()
const client = clientFromEnv()

const PAGE_FILES = [
  { file: 'features.json', id: 2 },
  { file: 'workflow.json', id: 3 },
  { file: 'modules.json', id: 4 },
  { file: 'mcp.json', id: 5 },
  { file: 'shared-hosting.json', id: 6 },
  { file: 'docs.json', id: 7 },
  { file: 'updates.json', id: 8 },
  { file: 'about.json', id: 9 },
]

const HEADER_NAV = [
  { id: 1, label: 'Features', href: '/features', sort_order: 0 },
  { id: 2, label: 'Architecture', href: '/workflow', sort_order: 1 },
  { id: 3, label: 'Modules', href: '/cms-modules', sort_order: 2 },
  { id: 4, label: 'MCP', href: '/mcp', sort_order: 3 },
  { id: 5, label: 'Docs', href: '/docs', sort_order: 4 },
  { id: 6, label: 'Blog', href: '/blog', sort_order: 5 },
  { id: 7, label: 'Updates', href: '/updates', sort_order: 6 },
  { id: 8, label: 'About', href: '/about', sort_order: 7 },
  { id: 9, label: 'GitHub', href: 'https://github.com/iia3uk/jasefly', sort_order: 8 },
]

const FOOTER_NAV = [
  { id: 16, label: 'GitHub', href: 'https://github.com/iia3uk/jasefly', sort_order: 0 },
  { id: 11, label: 'Documentation', href: '/docs', sort_order: 1 },
  { id: 10, label: 'Portfolio', href: 'https://iia3uk.ru', sort_order: 2 },
  { id: 14, label: 'Support Development', href: 'https://pay.cloudtips.ru/p/4cbdc8ab', sort_order: 3 },
  { id: 12, label: 'Blog', href: '/blog', sort_order: 4 },
  { id: 13, label: 'Privacy', href: '/privacy', sort_order: 5 },
  { id: 15, label: 'Terms', href: '/terms', sort_order: 6 },
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeLayout(node) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach(normalizeLayout)
    return
  }
  if (node.elType === 'widget' && node.settings) {
    const s = node.settings
    if (node.widgetType === 'cta-block') {
      if (s.body && !s.subtitle) {
        s.subtitle = s.body
        delete s.body
      }
      if (s.show_media === undefined) s.show_media = false
      if (!s.layout) s.layout = 'center'
    }
    if (node.widgetType === 'architecture-stack' && s.items && !s.layers) {
      s.layers = s.items
      delete s.items
    }
    if (node.widgetType === 'steps-row' && s.steps && !s.items) {
      s.items = s.steps.map((step, i) => ({
        badge: String(step.badge || i + 1),
        title: step.title || '',
        text: step.text || step.body || '',
      }))
      delete s.steps
    }
  }
  for (const c of node.elements || []) normalizeLayout(c)
}

async function putPage(id, pack) {
  normalizeLayout(pack.layout)
  const data = {
    title: pack.title,
    slug: pack.slug,
    status: 'published',
    template: 'builder',
    seo_title: pack.seo_title,
    seo_description: pack.seo_description,
    layout: pack.layout,
  }
  console.log('page', pack.slug, 'id=' + id)
  await client.put(`/admin/pages/${id}`, data)
  await sleep(200)
}

async function putNav(items, location) {
  for (const item of items) {
    console.log('nav', location, item.id, item.label)
    await client.put(`/admin/navigation/${item.id}`, {
      label: item.label,
      href: item.href,
      location,
      sort_order: item.sort_order,
      is_visible: 1,
    })
    await sleep(120)
  }
}

async function putSingletons() {
  const pairs = [
    [
      'seo',
      {
        site_title: 'Jasefly — AI-first Modular PHP Framework',
        site_description:
          'Open-source modular PHP framework with React, visual Builder, Platform SDK, MCP, ZIP modules, Access Layer, and shared-hosting updates. CMS is one surface on the platform.',
      },
    ],
    [
      'hero',
      {
        headline: 'AI-first Modular PHP Framework',
        subheadline:
          'PHP core, React frontend, Builder, Platform SDK, MCP, and ZIP modules — one platform for real web products. CMS is included, not the product definition.',
        badge_text: 'Open-source · PHP · React · MCP',
        primary_cta_label: 'Get Started',
        primary_cta_href: '/docs',
        secondary_cta_label: 'Live Demo',
        secondary_cta_href: 'https://iia3uk.ru',
      },
    ],
    [
      'profile',
      {
        name: 'Jasefly',
        job_title: 'IIA3UK',
        short_bio:
          'AI-first modular PHP framework with React, Builder, Platform SDK, MCP, and ZIP modules. Built and maintained by IIA3UK.',
      },
    ],
  ]
  for (const [key, value] of pairs) {
    console.log('singleton', key)
    await client.put(`/admin/${key}`, value)
    await sleep(4500)
  }
}

async function main() {
  for (const { file, id } of PAGE_FILES) {
    const pack = JSON.parse(fs.readFileSync(path.join(layoutsDir, file), 'utf8'))
    await putPage(id, pack)
  }
  await putNav(HEADER_NAV, 'header')
  await putNav(FOOTER_NAV, 'footer')
  await putSingletons()

  // Light API docs SEO (keep existing layout; update voice)
  console.log('page api-docs seo')
  await client.put('/admin/pages/15', {
    title: 'API',
    seo_title: 'Jasefly REST API & Platform Surfaces',
    seo_description:
      'Overview of Jasefly public and admin REST APIs, OpenAPI docs, and Platform SDK integration points for modules and agents.',
  })

  console.log('DONE')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
