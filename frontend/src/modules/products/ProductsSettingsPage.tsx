import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { usePluginEnabled, usePluginsHydrated } from '@/hooks/useApi'
import { adminUrl } from '@/admin/adminBasePath'

type TemplateField = {
  key: string
  label: string
  widget: string
  help?: string | null
}

type TemplateInfo = {
  id: string
  title: string
  description: string
  preview: [string, string]
  page_slug: string
  fields: TemplateField[]
}

type MetaPayload = {
  active: string
  page_slug: string
  templates: TemplateInfo[]
  form_fields: TemplateField[]
}

function WirePreview({ id, colors }: { id: string; colors: [string, string] }) {
  const [bg, accent] = colors
  return (
    <div
      className="relative h-28 overflow-hidden rounded-xl border border-white/10 p-2"
      style={{ background: `linear-gradient(145deg, ${bg} 40%, color-mix(in srgb, ${accent} 35%, ${bg}))` }}
    >
      {id === 'simple' && (
        <div className="flex h-full gap-2">
          <div className="w-2/5 rounded-md bg-white/10" />
          <div className="flex flex-1 flex-col gap-1.5 pt-1">
            <div className="h-2.5 w-4/5 rounded bg-white/40" />
            <div className="h-1.5 w-full rounded bg-white/15" />
            <div className="h-1.5 w-3/4 rounded bg-white/15" />
            <div className="mt-auto h-5 w-16 rounded" style={{ background: accent }} />
          </div>
        </div>
      )}
      {id === 'storefront' && (
        <div className="flex h-full gap-1.5">
          <div className="w-[28%] rounded-md bg-white/10" />
          <div className="flex flex-1 flex-col gap-1 pt-0.5">
            <div className="h-2 w-10 rounded" style={{ background: '#34d399' }} />
            <div className="h-2.5 w-3/4 rounded bg-white/40" />
            <div className="flex gap-1">
              <div className="h-2 flex-1 rounded bg-white/15" />
              <div className="h-2 flex-1 rounded bg-white/15" />
            </div>
            <div className="h-1.5 w-full rounded bg-white/10" />
          </div>
          <div className="flex w-[30%] flex-col gap-1 rounded-md border border-white/15 bg-black/30 p-1">
            <div className="h-2 rounded bg-white/20" />
            <div className="h-2 rounded bg-white/15" />
            <div className="mt-auto h-4 rounded" style={{ background: accent }} />
          </div>
        </div>
      )}
      {id === 'digital' && (
        <div className="flex h-full flex-col items-center gap-1.5 pt-1">
          <div className="h-8 w-4/5 rounded-md bg-white/10" />
          <div className="h-2 w-12 rounded" style={{ background: accent }} />
          <div className="h-2.5 w-2/3 rounded bg-white/40" />
          <div className="h-1.5 w-1/2 rounded bg-white/15" />
          <div className="mt-auto h-5 w-20 rounded" style={{ background: accent }} />
        </div>
      )}
      {id === 'landing' && (
        <div className="flex h-full flex-col gap-1.5">
          <div className="h-10 w-full rounded-md bg-white/10" />
          <div className="mx-auto h-2.5 w-2/3 rounded bg-white/40" />
          <div className="mx-auto h-1.5 w-1/2 rounded bg-white/15" />
          <div className="mx-auto mt-auto h-5 w-24 rounded" style={{ background: accent }} />
        </div>
      )}
      {id === 'marketplace' && (
        <div className="flex h-full gap-1.5">
          <div className="flex w-[34%] gap-1">
            <div className="flex w-3 flex-col gap-0.5">
              <div className="h-3 rounded-sm bg-white/25" />
              <div className="h-3 rounded-sm bg-white/15" />
              <div className="h-3 rounded-sm bg-white/15" />
            </div>
            <div className="flex-1 rounded-md bg-white/20" />
          </div>
          <div className="flex flex-1 flex-col gap-1 pt-0.5">
            <div className="h-2 w-12 rounded bg-white/30" />
            <div className="h-2.5 w-4/5 rounded bg-white/45" />
            <div className="h-1.5 w-full rounded bg-white/15" />
            <div className="h-1.5 w-3/4 rounded bg-white/15" />
            <div className="mt-auto h-2 w-20 rounded" style={{ background: accent }} />
          </div>
          <div className="flex w-[28%] flex-col gap-1 rounded-md border border-white/15 bg-black/25 p-1">
            <div className="h-3 w-3/4 rounded" style={{ background: accent }} />
            <div className="mt-auto h-4 rounded" style={{ background: accent }} />
            <div className="h-3 rounded border border-white/20" />
          </div>
        </div>
      )}
      {!['simple', 'storefront', 'digital', 'landing', 'marketplace'].includes(id) && (
        <div className="flex h-full items-center justify-center text-xs text-white/50">Превью</div>
      )}
    </div>
  )
}

export function ProductsSettingsPage() {
  const qc = useQueryClient()
  const pluginsReady = usePluginsHydrated()
  const productsOn = usePluginEnabled('products')
  const { data, isLoading } = useQuery({
    queryKey: ['products-templates-meta'],
    enabled: productsOn,
    queryFn: async () => {
      const res = await api.get<{ data: MetaPayload }>('/admin/products-meta/templates')
      return (res as { data?: MetaPayload })?.data ?? null
    },
  })
  const [active, setActive] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (data?.active) setActive(data.active)
  }, [data?.active])

  const save = useMutation({
    mutationFn: (storefront_template: string) =>
      api.put<{ data: MetaPayload }>('/admin/products-meta/templates', { storefront_template }),
    onSuccess: (res) => {
      const next = (res as { data?: MetaPayload })?.data
      if (next) {
        void qc.setQueryData(['products-templates-meta'], next)
        setActive(next.active)
      }
      void qc.invalidateQueries({ queryKey: ['products-config'] })
      void qc.invalidateQueries({ queryKey: ['page'] })
      setMsg('Шаблон сохранён')
      setTimeout(() => setMsg(''), 2500)
    },
  })

  if (!pluginsReady) return <Skeleton className="h-64" />
  if (!productsOn) {
    return (
      <GlassPanel className="p-10 text-center">
        <h1 className="font-heading text-xl">Товары</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Плагин «products» выключен.{' '}
          <Link to={adminUrl('/plugins')} className="text-[var(--accent)] underline-offset-2 hover:underline">
            Плагины
          </Link>
        </p>
      </GlassPanel>
    )
  }
  if (isLoading || !data) {
    return <Skeleton className="h-64" />
  }

  const selected = data.templates.find((t) => t.id === active) ?? data.templates[0]
  const dirty = active !== data.active

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Шаблоны витрины</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Выберите layout страницы товара. От шаблона зависят поля в карточке товара и вид{' '}
          <code className="text-zinc-300">/products/&#123;slug&#125;</code>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.templates.map((t) => {
          const on = t.id === active
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`rounded-2xl border p-3 text-left transition ${
                on
                  ? 'border-[var(--accent,#8eb6ff)] bg-[var(--accent,#8eb6ff)]/10 ring-1 ring-[var(--accent,#8eb6ff)]/40'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <WirePreview id={t.id} colors={t.preview} />
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{t.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t.description}</p>
                </div>
                {on ? <Check size={16} className="shrink-0 text-[var(--accent,#8eb6ff)]" /> : null}
              </div>
            </button>
          )
        })}
      </div>

      {selected ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Поля шаблона «{selected.title}»</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Эти поля появятся при создании/редактировании товара. Layout:{' '}
                <code className="text-zinc-400">{selected.page_slug}</code>
              </p>
            </div>
            <Link
              to="/admin/pages"
              className="inline-flex items-center gap-1 text-xs text-[var(--accent)]"
            >
              Страницы CMS <ExternalLink size={12} />
            </Link>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selected.fields.map((f) => (
              <li key={f.key} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-sm text-zinc-200">{f.label}</p>
                <p className="font-mono text-[10px] text-zinc-500">{f.key} · {f.widget}</p>
                {f.help ? <p className="mt-1 text-[11px] text-zinc-600">{f.help}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="admin-primary"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(active)}
        >
          <Save size={15} className="mr-1.5" />
          {save.isPending ? 'Сохранение…' : 'Применить шаблон'}
        </Button>
        {msg ? <span className="text-sm text-emerald-400">{msg}</span> : null}
        {save.isError ? <span className="text-sm text-red-400">{(save.error as Error)?.message}</span> : null}
        {!dirty ? <span className="text-xs text-zinc-500">Активен: {data.active}</span> : null}
      </div>
    </div>
  )
}
