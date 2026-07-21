import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, RefreshCw, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { t } from '@/admin/i18n'

type ProviderStatus = {
  id: string
  label: string
  enabled: boolean
  configured: boolean
  enforce_edge: boolean
  cidrs: number
}

type DdosStatus = {
  protection_enabled: boolean
  under_attack: boolean
  under_attack_rpm: number
  normal_rpm: number
  challenge_enabled: boolean
  providers: ProviderStatus[]
  active_count: number
}

export function DdosPage() {
  const client = useQueryClient()
  const queryKey = ['admin', 'ddos', 'status']
  const { data, isLoading } = useQuery<DdosStatus>({
    queryKey,
    queryFn: async () => {
      const res = await api.get<{ data: DdosStatus }>('/admin/ddos/status')
      return (res as { data?: DdosStatus })?.data as DdosStatus
    },
  })

  const toggleProvider = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post(`/admin/ddos/providers/${id}/toggle`, { enabled }),
    onSuccess: () => void client.invalidateQueries({ queryKey }),
  })

  const underAttack = useMutation({
    mutationFn: (enabled: boolean) =>
      api.post('/admin/ddos/under-attack', { enabled, sync_remote: true }),
    onSuccess: () => void client.invalidateQueries({ queryKey }),
  })

  const syncCf = useMutation({
    mutationFn: () => api.post('/admin/ddos/sync-cloudflare-ips', {}),
    onSuccess: () => void client.invalidateQueries({ queryKey }),
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl">DDoS защита</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cloudflare, DDoS-Guard, StormWall, Qrator — включайте провайдеры независимо.
            Ключи и origin shield настраиваются в Плагины → DDoS Protection.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50"
            disabled={syncCf.isPending}
            onClick={() => syncCf.mutate()}
            title={t.ddosRefreshCloudflare}
          >
            <RefreshCw size={14} /> {t.ddosCloudflareIps}
          </button>
          <Button
            type="button"
            className={data.under_attack ? 'border-red-500/40 bg-red-500/15 text-red-200' : 'admin-primary'}
            disabled={underAttack.isPending}
            onClick={() => underAttack.mutate(!data.under_attack)}
          >
            <Zap size={14} className="mr-1.5" />
            {data.under_attack ? t.underAttackOff : t.underAttackOn}
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Ядро</p>
          <p className="mt-1 text-lg">{data.protection_enabled ? 'Включено' : 'Выключено'}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Режим</p>
          <p className={`mt-1 text-lg ${data.under_attack ? 'text-red-300' : 'text-emerald-300'}`}>
            {data.under_attack ? t.underAttackStatus : t.underAttackNormal}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {data.under_attack ? data.under_attack_rpm : data.normal_rpm} req/min · challenge{' '}
            {data.challenge_enabled ? 'on' : 'off'}
          </p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Активных провайдеров</p>
          <p className="mt-1 text-lg">{data.active_count}</p>
        </GlassPanel>
      </div>

      <div className="space-y-3">
        {data.providers.map((p) => (
          <GlassPanel key={p.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <Shield size={18} className={p.enabled ? 'text-emerald-300' : 'text-zinc-500'} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-lg">{p.label}</h2>
                <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-zinc-400">{p.id}</code>
              </div>
              <p className="mt-0.5 text-sm text-zinc-500">
                {p.enabled ? 'включён' : 'выключен'}
                {p.enforce_edge ? ' · origin shield' : ''}
                {' · '}
                {p.cidrs} CIDR
              </p>
            </div>
            <button
              type="button"
              disabled={toggleProvider.isPending && toggleProvider.variables?.id === p.id}
              onClick={() => toggleProvider.mutate({ id: p.id, enabled: !p.enabled })}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition ${
                p.enabled
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
            >
              {p.enabled ? 'Включён' : 'Выключен'}
            </button>
          </GlassPanel>
        ))}
      </div>

      <p className="mt-6 text-xs text-zinc-600">
        Webhook/edge: убедитесь, что DNS указывает на выбранный провайдер. Origin shield блокирует прямой доступ
        к серверу вне CIDR провайдера. Детальные ключи API — в настройках плагина.
      </p>
    </div>
  )
}
