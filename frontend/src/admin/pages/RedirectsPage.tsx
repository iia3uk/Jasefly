import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, GlassPanel, Skeleton } from '@/components/ui'

type PathRedirect = {
  id: number
  from_path: string
  to_path: string
  status_code: number
  is_active: number | boolean
  note?: string | null
  created_at?: string
}

function unwrapList(payload: unknown): PathRedirect[] {
  if (Array.isArray(payload)) return payload as PathRedirect[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: PathRedirect[] }).data
  }
  return []
}

type SlugRedirect = {
  id: number
  entity_type: string
  old_slug: string
  new_slug: string
  entity_id: number
  created_at?: string
}

function unwrapSlugList(payload: unknown): SlugRedirect[] {
  if (Array.isArray(payload)) return payload as SlugRedirect[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: SlugRedirect[] }).data
  }
  return []
}

export function RedirectsPage() {
  const qc = useQueryClient()
  const [fromPath, setFromPath] = useState('')
  const [toPath, setToPath] = useState('')
  const [statusCode, setStatusCode] = useState(301)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const list = useQuery({
    queryKey: ['admin', 'redirects'],
    queryFn: async () => unwrapList(await api.get('/admin/redirects')),
  })

  const slugList = useQuery({
    queryKey: ['admin', 'redirects', 'slug'],
    queryFn: async () => unwrapSlugList(await api.get('/admin/redirects/slug')),
  })

  const create = useMutation({
    mutationFn: async () =>
      api.post('/admin/redirects', {
        from_path: fromPath.trim(),
        to_path: toPath.trim(),
        status_code: statusCode,
        is_active: 1,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      setFromPath('')
      setToPath('')
      setNote('')
      setError('')
      void qc.invalidateQueries({ queryKey: ['admin', 'redirects'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Ошибка сохранения'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/redirects/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'redirects'] }),
  })

  const removeSlug = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/redirects/slug/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'redirects', 'slug'] }),
  })

  const toggle = useMutation({
    mutationFn: (row: PathRedirect) =>
      api.put(`/admin/redirects/${row.id}`, {
        is_active: row.is_active ? 0 : 1,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'redirects'] }),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!fromPath.trim() || !toPath.trim()) {
      setError('Укажите оба пути')
      return
    }
    create.mutate()
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Редиректы</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ручные 301/302 и авто-записи при смене slug страниц/проектов/постов.
        </p>
      </div>

      <GlassPanel className="mb-6 space-y-4 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Добавить вручную</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Откуда</span>
            <input
              className="w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2"
              placeholder="/old-page"
              value={fromPath}
              onChange={(e) => setFromPath(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Куда</span>
            <input
              className="w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2"
              placeholder="/new-page или https://…"
              value={toPath}
              onChange={(e) => setToPath(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Код</span>
            <select
              className="w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2"
              value={statusCode}
              onChange={(e) => setStatusCode(Number(e.target.value))}
            >
              <option value={301}>301 — постоянно</option>
              <option value={302}>302 — временно</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-zinc-400">Заметка</span>
            <input
              className="w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="опционально"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" className="admin-primary" disabled={create.isPending}>
              <Plus size={14} className="mr-1.5" />
              {create.isPending ? 'Сохранение…' : 'Добавить'}
            </Button>
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
        </form>
      </GlassPanel>

      <GlassPanel className="mb-6 overflow-hidden p-0">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Ручные</h2>
        </div>
        {list.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (list.data ?? []).length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">Ручных редиректов пока нет.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Откуда</th>
                <th className="px-4 py-3 font-medium">Куда</th>
                <th className="px-4 py-3 font-medium">Код</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="px-4 py-3 font-mono text-zinc-200">{row.from_path}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 font-mono text-zinc-400" title={row.to_path}>
                    {row.to_path}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{row.status_code}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        row.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/20 text-zinc-400'
                      }`}
                      onClick={() => toggle.mutate(row)}
                    >
                      {row.is_active ? 'Вкл' : 'Выкл'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-red-300"
                      aria-label="Удалить"
                      onClick={() => {
                        if (window.confirm(`Удалить редирект ${row.from_path}?`)) remove.mutate(row.id)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassPanel>

      <GlassPanel className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Авто (смена slug)</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Создаются при переименовании slug в админке или билдере.</p>
        </div>
        {slugList.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10" />
          </div>
        ) : (slugList.data ?? []).length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">Авто-редиректов нет.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Старый</th>
                <th className="px-4 py-3 font-medium">Новый</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(slugList.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="px-4 py-3 text-zinc-400">{row.entity_type}</td>
                  <td className="px-4 py-3 font-mono text-zinc-200">{row.old_slug}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{row.new_slug}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-red-300"
                      aria-label="Удалить"
                      onClick={() => {
                        if (window.confirm(`Удалить авто-редирект ${row.old_slug} → ${row.new_slug}?`)) {
                          removeSlug.mutate(row.id)
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassPanel>
    </div>
  )
}
