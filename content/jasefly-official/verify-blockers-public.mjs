const checks = [
  ['/cms-modules', 'follow'],
  ['/modules', 'manual'],
  ['/modules', 'follow'],
  ['/api-docs', 'follow'],
  ['/terms', 'follow'],
  ['/', 'follow'],
  ['/features', 'follow'],
]

for (const [p, red] of checks) {
  const r = await fetch('https://jasefly.com' + p, {
    redirect: red,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const t = await r.text()
  const title = (t.match(/<title>([^<]+)/) || [])[1]
  const h1 = (t.match(/<h1[^>]*>([^<]+)/) || [])[1]
  const desc = (t.match(/name="description" content="([^"]*)"/) || [])[1]
  console.log(
    JSON.stringify({
      p,
      red,
      status: r.status,
      final: r.url,
      len: t.length,
      title,
      h1: h1?.slice(0, 80),
      desc: desc?.slice(0, 90),
    }),
  )
}

const site = await (await fetch('https://jasefly.com/api/v1/site')).json()
const d = site.data || site
console.log(
  'nav modules',
  (d.navigation || [])
    .filter((n) => /modul/i.test(n.href + n.label))
    .map((n) => ({ l: n.label, h: n.href })),
)
console.log('hero', {
  h: d.hero?.headline?.slice(0, 70),
  p: d.hero?.primary_cta_label,
  s: d.hero?.secondary_cta_label,
})
console.log('cookie', d.site_settings?.cookie_banner_text?.slice(0, 100))
const sm = await (await fetch('https://jasefly.com/sitemap.xml')).text()
console.log('sitemap cms-modules', sm.includes('/cms-modules'))
console.log('sitemap old /modules<', /jasefly\.com\/modules</.test(sm))
const terms = (await (await fetch('https://jasefly.com/api/v1/pages/terms')).json()).data
console.log('terms starts with h1', /^\s*<h1/i.test(terms.content || ''))
const footer = d.footer?.columns_json ? JSON.parse(d.footer.columns_json) : []
console.log(
  'footer modules href',
  footer.flatMap((c) => c.links || []).filter((l) => /modul/i.test(l.href + l.label)),
)
