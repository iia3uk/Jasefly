/**
 * Finish remaining blocker CMS ops (href scan + redirect).
 * node content/jasefly-official/fix-blockers-remain.mjs
 */
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'

loadMcpEnv()
const c = clientFromEnv()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const pages = (await c.get('/admin/pages'))?.data || []
await sleep(5000)

for (const p of pages) {
  const full = (await c.get(`/admin/pages/${p.id}`))?.data || {}
  await sleep(5000)
  const blob = JSON.stringify(full)
  if (blob.includes('"/modules"') || blob.includes('\\"/modules\\"') || blob.includes('href=\\"/modules\\"')) {
    console.log('OLD_HREF', p.slug, p.id)
  } else {
    console.log('ok', p.slug)
  }
}

try {
  const list = await c.get('/admin/redirects')
  await sleep(5000)
  const rows = list?.data || list || []
  const existing = Array.isArray(rows)
    ? rows.find((r) => String(r.from_path || '').replace(/\/$/, '') === '/modules')
    : null
  if (existing) {
    console.log('update redirect', existing.id)
    await c.put(`/admin/redirects/${existing.id}`, {
      from_path: '/modules',
      to_path: '/cms-modules',
      status_code: 301,
      is_active: 1,
      note: 'Avoid /modules asset dir collision',
    })
  } else {
    console.log('create redirect')
    await c.post('/admin/redirects', {
      from_path: '/modules',
      to_path: '/cms-modules',
      status_code: 301,
      is_active: 1,
      note: 'Avoid /modules asset dir collision',
    })
  }
} catch (e) {
  console.warn('redirect fail', e.message || e)
}

console.log('DONE remain')
