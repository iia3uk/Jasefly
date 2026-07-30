import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'

loadMcpEnv()
const c = clientFromEnv()
const GITHUB = 'https://github.com/iia3uk/jasefly'
const rows = (await c.get('/admin/navigation'))?.data || []

const footerById = {
  10: { label: 'Контакты', href: '/contact', sort_order: 1 },
  11: { label: 'Документация', href: '/docs', sort_order: 2 },
  12: { label: 'Блог', href: '/blog', sort_order: 3 },
  13: { label: 'Политика', href: '/privacy', sort_order: 4 },
  14: { label: 'Поддержать проект', href: 'https://pay.cloudtips.ru/p/4cbdc8ab', sort_order: 5 },
  15: { label: 'Условия', href: '/terms', sort_order: 6 },
}

for (const [id, meta] of Object.entries(footerById)) {
  console.log('footer', id, meta.label)
  await c.put(`/admin/navigation/${id}`, { ...meta, location: 'footer', is_visible: 1 })
}

const headerWant = [
  [1, 'Возможности', '/features', 0],
  [2, 'Как это работает', '/workflow', 1],
  [3, 'Модули', '/cms-modules', 2],
  [4, 'MCP и AI', '/mcp', 3],
  [5, 'Документация', '/docs', 4],
  [6, 'Блог', '/blog', 5],
  [7, 'Обновления', '/updates', 6],
  [8, 'О проекте', '/about', 7],
  [9, 'Открыть на GitHub', GITHUB, 8],
]

for (const [id, label, href, sort_order] of headerWant) {
  console.log('header', id, label)
  await c.put(`/admin/navigation/${id}`, { label, href, location: 'header', sort_order, is_visible: 1 })
}

const after = (await c.get('/admin/navigation'))?.data || []
const h = after.filter((n) => n.location === 'header' && Number(n.is_visible) === 1).sort((a, b) => a.sort_order - b.sort_order)
const f = after.filter((n) => n.location === 'footer' && Number(n.is_visible) === 1).sort((a, b) => a.sort_order - b.sort_order)
console.log('HEADER', h.map((n) => `${n.label}=>${n.href}`).join(' | '))
console.log('FOOTER', f.map((n) => `${n.label}=>${n.href}`).join(' | '))
