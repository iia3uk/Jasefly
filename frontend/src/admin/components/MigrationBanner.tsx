import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { endpoints, type MigrationStatusPayload } from '@/lib/api'
import { Button } from '@/components/ui'

export type MigrationStatus = MigrationStatusPayload

export function MigrationBanner() {
  const client = useQueryClient()
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-migrations'],
    queryFn: () => endpoints.migrations(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const retry = useMutation({
    mutationFn: () => endpoints.migrationsRetry(),
    onSuccess: (next) => {
      client.setQueryData(['admin-migrations'], next)
    },
  })

  if (isLoading && !data) return null

  const status = data as MigrationStatus | undefined
  if (!status) return null

  // Healthy: nothing to show
  if (status.ok && !status.error && !status.blocked && !(status.pending?.length)) {
    return null
  }

  const err = status.error
  const pending = status.pending ?? []

  return (
    <div className="border-b border-red-500/40 bg-red-950/90 text-red-50">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-300" size={22} />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-white">
                База данных требует миграции
              </h2>
              <p className="mt-1 text-sm text-red-100/90">
                CMS пыталась автоматически обновить схему при входе в админку.
                {err
                  ? ' Миграция упала — пока схема не починится, часть функций (например page builder) может не работать.'
                  : ' Есть незавершённые SQL-файлы.'}
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-red-400/30 bg-black/30">
              <table className="min-w-full text-left text-sm">
                <tbody className="divide-y divide-red-400/20">
                  {err?.file && (
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-red-200/80">Файл</th>
                      <td className="px-3 py-2 font-mono text-red-50">{err.file}</td>
                    </tr>
                  )}
                  {err?.message && (
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 align-top font-medium text-red-200/80">Ошибка</th>
                      <td className="px-3 py-2 font-mono text-[13px] leading-5 text-red-50 whitespace-pre-wrap break-words">
                        {err.message}
                      </td>
                    </tr>
                  )}
                  {err?.sql_preview && (
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 align-top font-medium text-red-200/80">SQL</th>
                      <td className="px-3 py-2 font-mono text-[12px] leading-5 text-amber-100/90 whitespace-pre-wrap break-words">
                        {err.sql_preview}
                      </td>
                    </tr>
                  )}
                  {err?.at && (
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-red-200/80">Время (UTC)</th>
                      <td className="px-3 py-2 font-mono text-red-50">{err.at}</td>
                    </tr>
                  )}
                  {!!pending.length && (
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 align-top font-medium text-red-200/80">Ожидают</th>
                      <td className="px-3 py-2 font-mono text-red-50">{pending.join(', ')}</td>
                    </tr>
                  )}
                  {err?.hint && (
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-red-200/80">Что делать</th>
                      <td className="px-3 py-2 text-red-50">{err.hint}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="admin-primary"
                disabled={retry.isPending || isFetching}
                onClick={() => retry.mutate()}
              >
                <RefreshCw size={14} className={retry.isPending ? 'animate-spin' : undefined} />
                {retry.isPending ? 'Повтор…' : 'Повторить миграции'}
              </Button>
              <Button type="button" disabled={isFetching} onClick={() => void refetch()}>
                Обновить статус
              </Button>
            </div>
            {retry.isError && (
              <p className="text-sm text-red-200">
                {retry.error instanceof Error ? retry.error.message : 'Не удалось повторить'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
