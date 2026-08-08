import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, GhostButton, GlassPanel } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { usePluginEnabled } from '@/hooks/useApi'

type Subscriber = { id: number; email: string; name?: string; status: string; source?: string; created_at: string }
type Campaign = { id: number; name: string; subject: string; html: string; text_body?: string; list_id?: number; status: string; sent_count: number }
const unpack = <T,>(v: { data?: T } | T): T => ('data' in (v as object) ? (v as { data: T }).data : v as T)

export function NewsletterSubscribersPage() {
  return <RequirePermission permission="newsletter.view"><Subscribers /></RequirePermission>
}
function Subscribers() {
  const qc = useQueryClient()
  const pluginOn = usePluginEnabled('newsletter')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [exporting, setExporting] = useState(false)
  const rows = useQuery({
    queryKey: ['newsletter-subscribers'],
    enabled: pluginOn,
    queryFn: async () => unpack<Subscriber[]>(await api.get('/admin/newsletter/subscribers')),
  })
  const add = useMutation({ mutationFn: () => api.post('/admin/newsletter/subscribers', { email, name }),
    onSuccess: async () => { setEmail(''); setName(''); await qc.invalidateQueries({ queryKey: ['newsletter-subscribers'] }) } })
  const exportCsv = async () => {
    setExporting(true)
    try { await api.download('/admin/newsletter/subscribers/export', 'subscribers.csv') }
    finally { setExporting(false) }
  }
  return <div className="space-y-4"><AdminPageHero title="Подписчики" hint="База рассылки, double opt-in и статусы." eyebrow="Коммуникации" accent="rose" />
    <GlassPanel className="flex flex-wrap gap-2 p-4"><input className="min-w-64 flex-1 rounded-lg border border-white/10 bg-black/20 p-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
      <input className="rounded-lg border border-white/10 bg-black/20 p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
      <Button onClick={() => add.mutate()} disabled={!email || add.isPending}>Добавить</Button>
      <GhostButton onClick={() => void exportCsv()} disabled={exporting}>{exporting ? 'CSV…' : 'CSV'}</GhostButton></GlassPanel>
    <GlassPanel className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="text-zinc-500"><tr><th className="p-3">Email</th><th>Имя</th><th>Статус</th><th>Источник</th><th>Дата</th></tr></thead>
      <tbody>{rows.data?.map((s) => <tr key={s.id} className="border-t border-white/10"><td className="p-3">{s.email}</td><td>{s.name || '—'}</td><td>{s.status}</td><td>{s.source || '—'}</td><td>{s.created_at}</td></tr>)}</tbody></table></GlassPanel>
  </div>
}

const blank = { name: 'Новая рассылка', subject: '', html: '<h1>Здравствуйте, {{name}}!</h1>', text_body: '', list_id: '' }
export function NewsletterCampaignsPage() {
  return <RequirePermission permission="newsletter.view"><Campaigns /></RequirePermission>
}
function Campaigns() {
  const qc = useQueryClient()
  const pluginOn = usePluginEnabled('newsletter')
  const [selected, setSelected] = useState<number | null>(null)
  const [form, setForm] = useState(blank)
  const [testEmail, setTestEmail] = useState('')
  const rows = useQuery({
    queryKey: ['newsletter-campaigns'],
    enabled: pluginOn,
    queryFn: async () => unpack<Campaign[]>(await api.get('/admin/newsletter/campaigns')),
  })
  const save = useMutation({ mutationFn: () => selected
    ? api.put(`/admin/newsletter/campaigns/${selected}`, { ...form, list_id: form.list_id || null })
    : api.post('/admin/newsletter/campaigns', { ...form, list_id: form.list_id || null }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['newsletter-campaigns'] }) })
  const send = useMutation({ mutationFn: () => api.post(`/admin/newsletter/campaigns/${selected}/send`, {}),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['newsletter-campaigns'] }) })
  const test = useMutation({ mutationFn: () => api.post(`/admin/newsletter/campaigns/${selected}/test`, { email: testEmail }) })
  const choose = (c: Campaign) => { setSelected(c.id); setForm({ name: c.name, subject: c.subject, html: c.html, text_body: c.text_body || '', list_id: c.list_id ? String(c.list_id) : '' }) }
  return <div className="space-y-4"><AdminPageHero title="Рассылки" hint="Кампании и отправка через планировщик." eyebrow="Коммуникации" accent="rose" actions={<GhostButton onClick={() => { setSelected(null); setForm(blank) }}>Новая</GhostButton>} />
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]"><GlassPanel className="p-2">{rows.data?.map((c) => <button key={c.id} onClick={() => choose(c)} className={`mb-1 w-full rounded-lg p-3 text-left ${selected === c.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
      <div>{c.name}</div><div className="text-xs text-zinc-500">{c.status} · отправлено {c.sent_count}</div></button>)}</GlassPanel>
      <GlassPanel className="space-y-3 p-4"><input className="w-full rounded-lg border border-white/10 bg-black/20 p-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название" />
        <input className="w-full rounded-lg border border-white/10 bg-black/20 p-2" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Тема письма" />
        <input className="w-full rounded-lg border border-white/10 bg-black/20 p-2" value={form.list_id} onChange={(e) => setForm({ ...form, list_id: e.target.value })} placeholder="ID списка (пусто = все)" />
        <textarea rows={14} className="w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs" value={form.html} onChange={(e) => setForm({ ...form, html: e.target.value })} />
        <div className="flex flex-wrap gap-2"><Button onClick={() => save.mutate()}>Сохранить</Button>{selected ? <Button onClick={() => send.mutate()}>Запланировать сейчас</Button> : null}
          {selected ? <><input className="rounded-lg border border-white/10 bg-black/20 p-2" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="Тестовый email" /><GhostButton onClick={() => test.mutate()}>Тест</GhostButton></> : null}</div>
      </GlassPanel></div>
  </div>
}
