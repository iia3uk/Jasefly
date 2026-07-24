import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'

loadMcpEnv()
const here = path.dirname(fileURLToPath(import.meta.url))
const layout = JSON.parse(fs.readFileSync(path.join(here, '_home_atoms_layout.json'), 'utf8'))
const client = clientFromEnv()
await client.ensureAuth()
const res = await client.put('/admin/pages/1', {
  title: 'Главная',
  slug: '__home',
  is_home: true,
  layout,
  status: 'published',
  template: 'builder',
})
const id = res?.data?.id ?? res?.id ?? '?'
const slug = res?.data?.slug ?? res?.slug
const home = res?.data?.is_home ?? res?.is_home
console.log('updated', id, slug, 'is_home=', home, layout.meta.revision, 'sections', layout.elements.length)
