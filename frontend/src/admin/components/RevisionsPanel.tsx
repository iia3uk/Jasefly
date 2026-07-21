import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { t } from '@/admin/i18n'

type Revision = {
  id: number
  page_id: number
  title: string | null
  note: string | null
  author_id: number | null
  created_at: string
}

/** Extract the data payload from an API envelope (or pass through if already unwrapped). */
function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>))
    ? (payload as { data: T }).data
    : (payload as T)
}

/**
 * RevisionsPanel — page revision history with snapshot + restore.
 *
 * Mounted inside the page builder's left panel. Lists existing revisions,
 * lets the user create a manual snapshot, and restore any revision (which
 * auto-snapshots the current state first, so restore is reversible).
 */
export function RevisionsPanel({ pageId, onRestored }: { pageId: string; onRestored?: () => void }) {
  const qc = useQueryClient()
  const key = ['admin', 'pages', pageId, 'revisions']

  const { data: revisions = [], isLoading } = useQuery<Revision[]>({
    queryKey: key,
    queryFn: async () => asData<Revision[]>(await api.get(`/admin/pages/${pageId}/revisions`)),
    enabled: !!pageId,
  })

  const snapshot = useMutation({
    mutationFn: async () =>
      asData<{ id: number }>(await api.post(`/admin/pages/${pageId}/revisions`, { note: t.revisionManualSnapshot })),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const restore = useMutation({
    mutationFn: async (revisionId: number) =>
      asData<unknown>(await api.post(`/admin/pages/revisions/${revisionId}/restore`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      onRestored?.()
    },
  })

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">История</p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          disabled={snapshot.isPending}
          onClick={() => snapshot.mutate()}
        >
          <Save size={13} /> Снимок
        </button>
      </div>

      {isLoading ? (
        <p className="text-zinc-500">Загрузка…</p>
      ) : revisions.length === 0 ? (
        <p className="text-zinc-500">Ревизий нет. Снимок создаётся автоматически при сохранении и публикации.</p>
      ) : (
        <ul className="space-y-1.5">
          {revisions.map((rev) => (
            <li
              key={rev.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-zinc-300">{rev.note ?? 'Ревизия'}</p>
                <p className="text-[11px] text-zinc-600">
                  {new Date(rev.created_at).toLocaleString('ru-RU')}
                  {rev.title ? ` · ${rev.title}` : ''}
                </p>
              </div>
              <button
                type="button"
                title="Восстановить"
                disabled={restore.isPending}
                onClick={() => restore.mutate(rev.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <RotateCcw size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {restore.isPending && <p className="text-xs text-zinc-500">Восстановление…</p>}
      {restore.isError && <p className="text-xs text-red-400">Не удалось восстановить</p>}
    </div>
  )
}
