/**
 * Apply jasefly-official layouts via CMS API (same auth as MCP token).
 * Usage: node content/jasefly-official/apply-layouts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadMcpEnv()
const client = clientFromEnv()

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  for (const item of manifest) {
    const page = JSON.parse(fs.readFileSync(path.join(__dirname, item.file), 'utf8'))
    const data = {
      title: page.title,
      slug: page.slug,
      status: 'published',
      seo_title: page.seo_title,
      seo_description: page.seo_description,
      layout: page.layout,
    }
    if (page.slug === 'contact' || page.slug === 'blog') data.template = 'system'
    else data.template = 'builder'

    if (page.id) {
      console.log('update', page.slug, 'id=' + page.id)
      const res = await client.put(`/admin/pages/${page.id}`, data)
      console.log('  ok', res?.data?.id ?? res?.id ?? 'saved')
    } else {
      console.log('create', page.slug)
      const res = await client.post('/admin/pages', data)
      const id = res?.data?.id ?? res?.id
      console.log('  -> id', id)
    }
  }
  console.log('done pages')
}

main().catch((e) => {
  console.error(e.message || e)
  if (e.payload) console.error(JSON.stringify(e.payload, null, 2))
  process.exit(1)
})
