import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, GhostButton, GlassPanel } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { usePluginEnabled } from '@/hooks/useApi'

type Automation = {
  id: number; name: string; description?: string; status: string; trigger_type: string
  definition: string | { conditions?: unknown; steps?: unknown[] }; run_count: number; last_run_at?: string
}
type Run = { id: number; status: string; trigger_event?: string; started_at: string; error?: string }
const empty = { name: 'Новая автоматизация', description: '', status: 'draft', trigger_type: 'form.submitted',
  conditions: '[]', actions: '[\n  { "action": "create_notification", "config": { "title": "Новое событие", "body": "{{_event}}" } }\n]' }
const data = <T,>(value: { data?: T } | T): T => ('data' in (value as object) ? (value as { data: T }).data : value as T)

export function AutomationAdminPage() {
  return <RequirePermission permission="automations.view"><AutomationEditor /></RequirePermission>
}

function AutomationEditor() {
  const qc = useQueryClient()
  const pluginOn = usePluginEnabled('automation')
  const [selected, setSelected] = useState<number | null>(null)
  const [form, setForm] = useState(empty)
  const list = useQuery({
    queryKey: ['automations'],
    enabled: pluginOn,
    queryFn: async () => data<Automation[]>(await api.get('/admin/automations')),
  })
  const runs = useQuery({
    queryKey: ['automation-runs', selected],
    enabled: pluginOn && !!selected,
    queryFn: async () => data<Run[]>(await api.get(`/admin/automations/${selected}/runs`)),
  })
  const current = list.data?.find((item) => item.id === selected)
  useEffect(() => {
    if (!current) return
    const def = typeof current.definition === 'string' ? JSON.parse(current.definition || '{}') : current.definition
    setForm({ name: current.name, description: current.description || '', status: current.status,
      trigger_type: current.trigger_type, conditions: JSON.stringify(def.conditions ?? [], null, 2),
      actions: JSON.stringify(def.steps ?? [], null, 2) })
  }, [current])
  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name, description: form.description, status: form.status,
        trigger_type: form.trigger_type, definition: { conditions: JSON.parse(form.conditions), steps: JSON.parse(form.actions) } }
      return selected ? api.put(`/admin/automations/${selected}`, payload) : api.post('/admin/automations', payload)
    },
    onSuccess: async (result) => {
      const created = data<Automation>(result as { data: Automation })
      if (!selected && created?.id) setSelected(created.id)
      await qc.invalidateQueries({ queryKey: ['automations'] })
    },
  })
  const run = useMutation({ mutationFn: () => api.post(`/admin/automations/${selected}/test`, { context: { _event: 'manual.test' } }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['automation-runs', selected] }) })

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h1 className="font-heading text-2xl">Автоматизация</h1>
      <p className="text-sm text-zinc-400">Триггеры, условия и последовательности действий.</p></div>
      <GhostButton onClick={() => { setSelected(null); setForm(empty) }}>Новая</GhostButton></div>
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <GlassPanel className="p-2">{list.data?.map((item) => <button key={item.id} onClick={() => setSelected(item.id)}
        className={`mb-1 w-full rounded-lg p-3 text-left ${selected === item.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
        <div className="text-sm">{item.name}</div><div className="text-xs text-zinc-500">{item.trigger_type} · {item.status}</div>
      </button>)}</GlassPanel>
      <div className="space-y-4">
        <GlassPanel className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="rounded-lg border border-white/10 bg-black/20 p-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название" />
            <select className="rounded-lg border border-white/10 bg-zinc-900 p-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['draft','active','paused','archived'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <input className="w-full rounded-lg border border-white/10 bg-black/20 p-2" value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })} placeholder="form.submitted" />
          <textarea className="w-full rounded-lg border border-white/10 bg-black/20 p-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Описание" />
          <label className="block text-xs text-zinc-400">Условия JSON<textarea rows={8} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs" value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} /></label>
          <label className="block text-xs text-zinc-400">Действия JSON<textarea rows={14} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs" value={form.actions} onChange={(e) => setForm({ ...form, actions: e.target.value })} /></label>
          {save.error ? <p className="text-sm text-red-400">{String(save.error)}</p> : null}
          <div className="flex gap-2"><Button onClick={() => save.mutate()} disabled={save.isPending}>Сохранить</Button>
            {selected ? <GhostButton onClick={() => run.mutate()} disabled={run.isPending}>Тестовый запуск</GhostButton> : null}</div>
        </GlassPanel>
        {selected ? <GlassPanel className="p-4"><h2 className="mb-2 font-medium">Последние запуски</h2>
          <div className="space-y-2">{runs.data?.map((item) => <div key={item.id} className="rounded-lg bg-black/20 p-2 text-sm">
            <span className="text-zinc-500">#{item.id}</span> · {item.status} · {item.started_at}{item.error ? <div className="text-red-400">{item.error}</div> : null}
          </div>)}{!runs.data?.length ? <p className="text-sm text-zinc-500">Запусков нет</p> : null}</div>
        </GlassPanel> : null}
      </div>
    </div>
  </div>
}
