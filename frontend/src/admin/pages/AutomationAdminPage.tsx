import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, ChevronDown, Loader2, Play, Plus, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, GhostButton, GlassPanel } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { usePluginEnabled } from '@/hooks/useApi'
import { adminUrl } from '@/admin/adminBasePath'

type Automation = {
  id: number
  name: string
  description?: string
  status: string
  trigger_type: string
  trigger_available?: boolean
  definition: string | { conditions?: unknown; steps?: unknown[] }
  run_count: number
  last_run_at?: string
}
type Run = { id: number; status: string; trigger_event?: string; started_at: string; error?: string }
type TriggerOpt = {
  value: string
  id?: string
  label: string
  owner?: string
  category?: string
  available?: boolean
}

const STATUS_OPTS: Array<{ value: string; label: string }> = [
  { value: 'draft', label: 'Черновик — не запускается' },
  { value: 'active', label: 'Активна — слушает событие' },
  { value: 'paused', label: 'На паузе' },
  { value: 'archived', label: 'В архиве' },
]

const ACTIONS_HELP: Array<{ action: string; title: string; config: string }> = [
  { action: 'create_notification', title: 'Уведомление админам', config: 'title, body, notification_type?' },
  { action: 'send_email', title: 'Письмо', config: 'to, subject, html|body, text?' },
  { action: 'send_telegram', title: 'Telegram', config: 'text, bot_token?, chat_id?' },
  { action: 'send_webhook', title: 'HTTP webhook', config: 'url, payload?' },
  { action: 'update_submission', title: 'Статус заявки формы', config: 'status (new|in_progress|resolved|spam|archived)' },
  { action: 'delay', title: 'Пауза (через Планировщик)', config: 'seconds (1…2592000)' },
  { action: 'branch', title: 'Ветка if/else', config: 'conditions, then[], else[]' },
  { action: 'stop', title: 'Остановить сценарий', config: '—' },
]

const RECIPE_NOTIFY = `[
  {
    "action": "create_notification",
    "config": {
      "title": "Новая заявка с сайта",
      "body": "Событие {{_event}}"
    }
  }
]`

const RECIPE_FORM_EMAIL = `[
  {
    "action": "create_notification",
    "config": {
      "title": "Заявка с формы",
      "body": "ID {{submission.id}} · {{submission.email}}"
    }
  },
  {
    "action": "send_email",
    "config": {
      "to": "ops@example.com",
      "subject": "Заявка {{submission.public_id}}",
      "html": "<p>Сообщение: {{submission.message}}</p>"
    }
  },
  {
    "action": "update_submission",
    "config": { "status": "in_progress" }
  }
]`

const RECIPE_DELAY = `[
  {
    "action": "create_notification",
    "config": { "title": "Старт", "body": "{{_event}}" }
  },
  {
    "action": "delay",
    "config": { "seconds": 3600 }
  },
  {
    "action": "send_email",
    "config": {
      "to": "ops@example.com",
      "subject": "Напоминание через час",
      "body": "Проверьте заявку {{submission.id}}"
    }
  }
]`

const COND_EXAMPLE = `{
  "all": [
    { "path": "submission.status", "operator": "equals", "value": "new" }
  ]
}`

const empty = {
  name: 'Новая автоматизация',
  description: '',
  status: 'draft',
  trigger_type: 'form.submitted',
  conditions: '[]',
  actions: RECIPE_NOTIFY,
}

const data = <T,>(value: { data?: T } | T): T =>
  ('data' in (value as object) ? (value as { data: T }).data : value as T)

export function AutomationAdminPage() {
  return (
    <RequirePermission permission="automations.view">
      <AutomationEditor />
    </RequirePermission>
  )
}

function AutomationHelp({ triggers }: { triggers: TriggerOpt[] }) {
  const [open, setOpen] = useState(false)
  return (
    <GlassPanel className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          Как это работает — простыми словами
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-5 border-t border-zinc-800 px-4 py-4 text-sm leading-relaxed text-zinc-300">
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Зачем</h2>
            <p>
              Автоматизация — правило: <strong className="text-zinc-100">случилось событие → проверить условия → выполнить шаги</strong>.
              Например: пришла заявка с формы → уведомление админу + письмо на почту.
            </p>
            <p className="text-zinc-400">
              Чтобы правило реально срабатывало, статус должен быть <strong className="text-zinc-200">Активна</strong>.
              Черновик и пауза только хранят настройку. Модуль «Автоматизация» должен быть включён в Плагинах.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Пошагово</h2>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Слева выберите правило или нажмите «Новая».</li>
              <li>Укажите название и <strong className="text-zinc-100">событие-триггер</strong> (что запускает сценарий).</li>
              <li>
                Условия — фильтр (можно оставить <code className="text-zinc-200">[]</code> = всегда).
                Действия — список шагов JSON (кнопки «Пресет» ниже подставляют готовые примеры).
              </li>
              <li>Сохраните → поставьте статус «Активна» → при желании «Тестовый запуск».</li>
              <li>
                Пауза <code className="text-zinc-200">delay</code> крутится через{' '}
                <Link to={adminUrl('/scheduler')} className="text-emerald-400 hover:underline">Планировщик</Link>
                {' '}(нужен tick / cron).
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">События (триггеры)</h2>
            <p className="text-xs text-zinc-500">
              Каталог из EventCatalog: пакеты объявляют события через{' '}
              <code className="text-zinc-300">events.declare</code>. Встроенного whitelist продукта нет.
            </p>
            {!triggers.length ? (
              <p className="text-xs text-zinc-500">
                Пока нет объявленных событий — включите пакеты-источники (формы, заказы…).
              </p>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-2">
                {triggers.map((e) => (
                  <li key={e.value} className="rounded-lg bg-zinc-900/70 px-2.5 py-1.5 text-xs">
                    <code className="text-emerald-300/90">{e.value}</code>
                    <span className="mt-0.5 block text-zinc-500">{e.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Действия</h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead className="bg-zinc-900/80 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">action</th>
                    <th className="px-3 py-2">Что делает</th>
                    <th className="px-3 py-2">config</th>
                  </tr>
                </thead>
                <tbody>
                  {ACTIONS_HELP.map((row) => (
                    <tr key={row.action} className="border-t border-zinc-800/80">
                      <td className="px-3 py-2 font-mono text-emerald-300/90">{row.action}</td>
                      <td className="px-3 py-2">{row.title}</td>
                      <td className="px-3 py-2 font-mono text-zinc-500">{row.config}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-500">
              В текстах можно подставлять поля контекста: <code className="text-zinc-400">{'{{_event}}'}</code>,{' '}
              <code className="text-zinc-400">{'{{submission.email}}'}</code>,{' '}
              <code className="text-zinc-400">{'{{submission.id}}'}</code>.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Условия</h2>
            <p>
              Пустой массив <code className="text-zinc-200">[]</code> — без фильтра. Иначе объект с{' '}
              <code className="text-zinc-200">all</code> / <code className="text-zinc-200">any</code>:
            </p>
            <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300">
              {COND_EXAMPLE}
            </pre>
            <p className="text-xs text-zinc-500">
              Операторы: equals, not_equals, contains, greater_than, less_than, is_empty, is_not_empty, in, not_in.
            </p>
          </section>
        </div>
      ) : null}
    </GlassPanel>
  )
}

function AutomationEditor() {
  const qc = useQueryClient()
  const pluginOn = usePluginEnabled('automation')
  const [selected, setSelected] = useState<number | null>(null)
  const [form, setForm] = useState(empty)
  const [formError, setFormError] = useState('')

  const triggers = useQuery({
    queryKey: ['automation-triggers'],
    enabled: pluginOn,
    staleTime: 30_000,
    queryFn: async () => data<TriggerOpt[]>(await api.get('/admin/automations/triggers')),
  })
  const eventOpts = triggers.data ?? []
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
    const def = typeof current.definition === 'string'
      ? JSON.parse(current.definition || '{}')
      : current.definition
    setForm({
      name: current.name,
      description: current.description || '',
      status: current.status,
      trigger_type: current.trigger_type,
      conditions: JSON.stringify(def?.conditions ?? [], null, 2),
      actions: JSON.stringify(def?.steps ?? [], null, 2),
    })
    setFormError('')
  }, [current])

  const save = useMutation({
    mutationFn: async () => {
      let conditions: unknown
      let steps: unknown
      try {
        conditions = JSON.parse(form.conditions)
      } catch {
        throw new Error('Условия: невалидный JSON')
      }
      try {
        steps = JSON.parse(form.actions)
      } catch {
        throw new Error('Действия: невалидный JSON')
      }
      if (!Array.isArray(steps)) {
        throw new Error('Действия должны быть массивом шагов [...]')
      }
      const payload = {
        name: form.name,
        description: form.description,
        status: form.status,
        trigger_type: form.trigger_type,
        definition: { conditions, steps },
      }
      return selected
        ? api.put(`/admin/automations/${selected}`, payload)
        : api.post('/admin/automations', payload)
    },
    onSuccess: async (result) => {
      setFormError('')
      const created = data<Automation>(result as { data: Automation })
      if (!selected && created?.id) setSelected(created.id)
      await qc.invalidateQueries({ queryKey: ['automations'] })
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : String(e)),
  })

  const run = useMutation({
    mutationFn: () =>
      api.post(`/admin/automations/${selected}/test`, { context: { _event: 'manual.test' } }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['automation-runs', selected] }),
  })

  const eventKnown = eventOpts.some((e) => e.value === form.trigger_type)
  const selectedRow = list.data?.find((a) => a.id === selected)
  const triggerUnavailable = selectedRow ? selectedRow.trigger_available === false : false

  if (!pluginOn) {
    return (
      <GlassPanel className="p-6 text-sm text-zinc-400">
        Модуль «Автоматизация» выключен. Включите его в{' '}
        <Link to={adminUrl('/plugins')} className="text-emerald-400 hover:underline">Плагинах</Link>.
      </GlassPanel>
    )
  }

  return (
    <div className="space-y-4">
      <AdminPageHero
        title="Автоматизация"
        hint="Событие на сайте → условия → цепочка действий (уведомление, письмо, webhook, пауза…)."
        eyebrow="Система"
        accent="violet"
        actions={
          <GhostButton
            type="button"
            onClick={() => {
              setSelected(null)
              setForm(empty)
              setFormError('')
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Новая
          </GhostButton>
        }
      />

      <AutomationHelp triggers={eventOpts} />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <GlassPanel className="max-h-[70vh] overflow-y-auto p-2">
          {!list.data?.length ? (
            <p className="p-4 text-sm text-zinc-500">
              Правил пока нет. Нажмите «Новая», выберите пресет действий и сохраните.
            </p>
          ) : null}
          {list.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              className={`mb-1 w-full rounded-lg p-3 text-left transition ${
                selected === item.id ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <div className="text-sm text-zinc-100">{item.name}</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {item.trigger_type}
                {item.trigger_available === false ? ' · недоступен' : ''}
                {' · '}
                {STATUS_OPTS.find((s) => s.value === item.status)?.label.split('—')[0].trim() || item.status}
              </div>
            </button>
          ))}
        </GlassPanel>

        <div className="space-y-4">
          <GlassPanel className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-zinc-400">
                Название
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2 text-sm text-zinc-100"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block text-xs text-zinc-400">
                Статус
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 p-2 text-sm text-zinc-100"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUS_OPTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-xs text-zinc-400">
              Событие (триггер) — что запускает правило
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 p-2 text-sm text-zinc-100"
                value={eventKnown ? form.trigger_type : '__custom__'}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setForm({ ...form, trigger_type: eventKnown ? 'custom.event' : form.trigger_type })
                    return
                  }
                  setForm({ ...form, trigger_type: e.target.value })
                }}
              >
                {!eventOpts.length ? (
                  <option value="__custom__">Нет объявленных событий…</option>
                ) : null}
                {eventOpts.map((e) => (
                  <option key={e.value} value={e.value}>{e.label} ({e.value})</option>
                ))}
                <option value="__custom__">Свой код события…</option>
              </select>
              <input
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-xs text-zinc-100"
                value={form.trigger_type}
                onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
                placeholder="form.submitted"
              />
            </label>
            {triggerUnavailable ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Триггер недоступен (пакет-источник выключен или не объявил событие). Правило сохранено;
                активировать нельзя, пока событие снова появится в каталоге.
              </p>
            ) : null}

            <label className="block text-xs text-zinc-400">
              Описание (для себя)
              <textarea
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2 text-sm text-zinc-100"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-400">Условия JSON</span>
                <GhostButton
                  type="button"
                  className="!px-2 !py-1 text-[11px]"
                  onClick={() => setForm({ ...form, conditions: COND_EXAMPLE })}
                >
                  Пример фильтра
                </GhostButton>
              </div>
              <p className="mb-1 text-[11px] text-zinc-500">
                <code className="text-zinc-400">[]</code> — без условий (всегда). Или объект all/any — см. справку выше.
              </p>
              <textarea
                rows={6}
                className="w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-zinc-200"
                value={form.conditions}
                onChange={(e) => setForm({ ...form, conditions: e.target.value })}
              />
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-400">Действия JSON (шаги по порядку)</span>
                <div className="flex flex-wrap gap-1">
                  <GhostButton type="button" className="!px-2 !py-1 text-[11px]" onClick={() => setForm({ ...form, actions: RECIPE_NOTIFY })}>
                    Пресет: уведомление
                  </GhostButton>
                  <GhostButton type="button" className="!px-2 !py-1 text-[11px]" onClick={() => setForm({ ...form, actions: RECIPE_FORM_EMAIL })}>
                    Пресет: форма → email
                  </GhostButton>
                  <GhostButton type="button" className="!px-2 !py-1 text-[11px]" onClick={() => setForm({ ...form, actions: RECIPE_DELAY })}>
                    Пресет: пауза 1ч
                  </GhostButton>
                </div>
              </div>
              <p className="mb-1 text-[11px] text-zinc-500">
                Каждый элемент: <code className="text-zinc-400">{`{ "action": "…", "config": { … } }`}</code>
              </p>
              <textarea
                rows={14}
                className="w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-zinc-200"
                value={form.actions}
                onChange={(e) => setForm({ ...form, actions: e.target.value })}
              />
            </div>

            {formError || save.error ? (
              <p className="text-sm text-red-400">{formError || String(save.error)}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" className="admin-primary" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Сохранить
              </Button>
              {selected ? (
                <GhostButton type="button" onClick={() => run.mutate()} disabled={run.isPending}>
                  {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                  Тестовый запуск
                </GhostButton>
              ) : null}
            </div>
            {form.status !== 'active' ? (
              <p className="text-xs text-amber-400/90">
                Сейчас статус не «Активна» — на реальных событиях сайта правило не сработает, только тестовый запуск.
              </p>
            ) : null}
          </GlassPanel>

          {selected ? (
            <GlassPanel className="p-4">
              <h2 className="mb-2 font-medium text-zinc-100">Последние запуски</h2>
              <div className="space-y-2">
                {runs.data?.map((item) => (
                  <div key={item.id} className="rounded-lg bg-black/20 p-2 text-sm">
                    <span className="text-zinc-500">#{item.id}</span>
                    {' · '}
                    {item.status}
                    {' · '}
                    {item.started_at}
                    {item.error ? <div className="mt-1 text-red-400">{item.error}</div> : null}
                  </div>
                ))}
                {!runs.data?.length ? <p className="text-sm text-zinc-500">Запусков нет — сохраните и нажмите «Тестовый запуск».</p> : null}
              </div>
            </GlassPanel>
          ) : null}
        </div>
      </div>
    </div>
  )
}
