import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { useAuth } from '@/context/AuthContext'
import { adminUrl } from '@/admin/adminBasePath'
import { usePluginEnabled } from '@/hooks/useApi'

type FormField = {
  name: string
  label: string
  type: string
  placeholder?: string
  help_text?: string
  default_value?: string
  required?: boolean | number
  options?: unknown
  width?: string
}

type FormRow = {
  id: number
  name: string
  slug: string
  status: string
  description?: string | null
  success_message?: string | null
  submit_button_text?: string | null
  submissions_count?: number
  fields?: FormField[]
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Черновик' },
  { value: 'active', label: 'Активна' },
  { value: 'disabled', label: 'Выключена' },
  { value: 'archived', label: 'Архив' },
]

const FIELD_TYPES = ['text', 'email', 'textarea', 'phone', 'number', 'select', 'checkbox', 'hidden']

const emptyField = (): FormField => ({
  name: '',
  label: '',
  type: 'text',
  placeholder: '',
  required: false,
  width: 'full',
})

export function FormsAdminPage() {
  return (
    <RequirePermission permission="forms.view">
      <FormsAdminInner />
    </RequirePermission>
  )
}

function FormsAdminInner() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const canManage = can('forms.manage')
  const pluginOn = usePluginEnabled('forms')
  const [editId, setEditId] = useState<number | 'new' | null>(null)
  const [useJson, setUseJson] = useState(false)
  const [fieldsJson, setFieldsJson] = useState('[]')
  const [draft, setDraft] = useState({
    name: '',
    slug: '',
    status: 'draft',
    description: '',
    success_message: 'Спасибо!',
    submit_button_text: 'Отправить',
    fields: [emptyField()] as FormField[],
  })

  const forms = useQuery({
    queryKey: ['admin', 'forms'],
    enabled: pluginOn,
    queryFn: async () => asData<FormRow[]>(await api.get('/admin/forms')),
  })

  const detail = useQuery({
    queryKey: ['admin', 'forms', editId],
    enabled: pluginOn && typeof editId === 'number',
    queryFn: async () => asData<FormRow>(await api.get(`/admin/forms/${editId}`)),
  })

  useEffect(() => {
    if (editId === 'new') {
      setDraft({
        name: '',
        slug: '',
        status: 'draft',
        description: '',
        success_message: 'Спасибо!',
        submit_button_text: 'Отправить',
        fields: [emptyField()],
      })
      setFieldsJson('[]')
      setUseJson(false)
      return
    }
    if (detail.data) {
      const f = detail.data
      setDraft({
        name: f.name || '',
        slug: f.slug || '',
        status: f.status || 'draft',
        description: f.description || '',
        success_message: f.success_message || 'Спасибо!',
        submit_button_text: f.submit_button_text || 'Отправить',
        fields: (f.fields?.length ? f.fields : [emptyField()]).map((row) => ({
          name: row.name || '',
          label: row.label || row.name || '',
          type: row.type || 'text',
          placeholder: row.placeholder || '',
          help_text: row.help_text || '',
          default_value: row.default_value || '',
          required: Boolean(row.required),
          width: row.width || 'full',
        })),
      })
      setFieldsJson(JSON.stringify(f.fields ?? [], null, 2))
    }
  }, [editId, detail.data])

  const save = useMutation({
    mutationFn: async () => {
      let fields: FormField[] = draft.fields
      if (useJson) {
        fields = JSON.parse(fieldsJson) as FormField[]
      }
      const body = {
        name: draft.name,
        slug: draft.slug,
        status: draft.status,
        description: draft.description || null,
        success_message: draft.success_message,
        submit_button_text: draft.submit_button_text,
        fields: fields.filter((f) => f.name.trim()),
      }
      if (editId === 'new') {
        return asData<FormRow>(await api.post('/admin/forms', body))
      }
      return asData<FormRow>(await api.put(`/admin/forms/${editId}`, body))
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'forms'] })
      setEditId(saved.id)
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/forms/${id}`),
    onSuccess: async () => {
      setEditId(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'forms'] })
    },
  })

  const rows = forms.data ?? []
  const editing = editId != null

  const statusLabel = useMemo(() => Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label])), [])

  return (
    <div className="space-y-4">
      <AdminPageHero
        title="Формы"
        hint="Конструктор форм для виджета «Форма» в Page Builder. Legacy contact-form (mail) не затронут."
        eyebrow="Контент"
        accent="teal"
        actions={
          canManage ? (
            <Button type="button" className="admin-primary" onClick={() => setEditId('new')}>
              <Plus className="mr-1.5 h-4 w-4" />
              Новая форма
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <GlassPanel className="max-h-[75vh] overflow-y-auto p-2">
          {forms.isLoading ? <Skeleton className="m-2 h-40" /> : null}
          {!forms.isLoading && !rows.length ? (
            <p className="p-4 text-sm text-zinc-500">Форм пока нет</p>
          ) : null}
          {rows.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setEditId(f.id)}
              className={`mb-1 w-full rounded-xl px-3 py-2 text-left transition ${
                editId === f.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-zinc-100">{f.name}</span>
                <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                  {statusLabel[f.status] || f.status}
                </span>
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">{f.slug}</p>
              <p className="mt-1 text-xs text-zinc-600">{f.submissions_count ?? 0} заявок</p>
            </button>
          ))}
        </GlassPanel>

        <GlassPanel className="p-5">
          {!editing ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-500">
              <FileText className="h-8 w-8" />
              <p className="text-sm">Выберите форму или создайте новую</p>
            </div>
          ) : (typeof editId === 'number' && detail.isLoading) ? (
            <Skeleton className="h-64" />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-sm">
                  <span className="text-zinc-400">Название</span>
                  <input
                    required
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                    value={draft.name}
                    onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-zinc-400">Slug</span>
                  <input
                    required
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-white"
                    value={draft.slug}
                    onChange={(e) => setDraft((p) => ({ ...p, slug: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-zinc-400">Статус</span>
                  <select
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                    value={draft.status}
                    onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm sm:col-span-2">
                  <span className="text-zinc-400">Описание</span>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                    value={draft.description}
                    onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-zinc-400">Сообщение успеха</span>
                  <input
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                    value={draft.success_message}
                    onChange={(e) => setDraft((p) => ({ ...p, success_message: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-zinc-400">Текст кнопки</span>
                  <input
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                    value={draft.submit_button_text}
                    onChange={(e) => setDraft((p) => ({ ...p, submit_button_text: e.target.value }))}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-200">Поля</h2>
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={useJson} onChange={(e) => setUseJson(e.target.checked)} />
                  JSON редактор
                </label>
              </div>

              {useJson ? (
                <textarea
                  rows={12}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200"
                  value={fieldsJson}
                  onChange={(e) => setFieldsJson(e.target.value)}
                />
              ) : (
                <div className="space-y-2">
                  {draft.fields.map((field, idx) => (
                    <div key={idx} className="grid gap-2 rounded-lg border border-zinc-800 p-3 sm:grid-cols-6">
                      <input
                        placeholder="name"
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm font-mono"
                        value={field.name}
                        onChange={(e) => setDraft((p) => {
                          const fields = [...p.fields]
                          fields[idx] = { ...fields[idx], name: e.target.value }
                          return { ...p, fields }
                        })}
                      />
                      <input
                        placeholder="label"
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm sm:col-span-2"
                        value={field.label}
                        onChange={(e) => setDraft((p) => {
                          const fields = [...p.fields]
                          fields[idx] = { ...fields[idx], label: e.target.value }
                          return { ...p, fields }
                        })}
                      />
                      <select
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                        value={field.type}
                        onChange={(e) => setDraft((p) => {
                          const fields = [...p.fields]
                          fields[idx] = { ...fields[idx], type: e.target.value }
                          return { ...p, fields }
                        })}
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-zinc-400">
                        <input
                          type="checkbox"
                          checked={Boolean(field.required)}
                          onChange={(e) => setDraft((p) => {
                            const fields = [...p.fields]
                            fields[idx] = { ...fields[idx], required: e.target.checked }
                            return { ...p, fields }
                          })}
                        />
                        req
                      </label>
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={() => setDraft((p) => ({
                          ...p,
                          fields: p.fields.filter((_, i) => i !== idx),
                        }))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <GhostButton
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, fields: [...p.fields, emptyField()] }))}
                  >
                    + Поле
                  </GhostButton>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
                {canManage ? (
                  <Button type="submit" className="admin-primary" disabled={save.isPending}>
                    {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                    {editId === 'new' ? 'Создать' : 'Сохранить'}
                  </Button>
                ) : null}
                {typeof editId === 'number' ? (
                  <>
                    <Link
                      to={adminUrl(`form-submissions?form_id=${editId}`)}
                      className="text-sm text-emerald-400 underline hover:text-emerald-300"
                    >
                      Заявки формы
                    </Link>
                    {canManage ? (
                      <GhostButton
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm('Удалить форму?')) remove.mutate(editId)
                        }}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Удалить
                      </GhostButton>
                    ) : null}
                  </>
                ) : null}
                <GhostButton type="button" onClick={() => setEditId(null)}>Закрыть</GhostButton>
              </div>
            </form>
          )}
        </GlassPanel>
      </div>
    </div>
  )
}
