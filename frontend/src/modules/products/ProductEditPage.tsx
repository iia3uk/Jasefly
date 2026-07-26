import { useCallback, useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAdminItem, useCrud, usePluginEnabled, usePluginsHydrated } from '@/hooks/useApi'
import { adminUrl } from '@/admin/adminBasePath'
import { useAdminRouteParams } from '@/admin/AdminRouteParams'
import { AdminSplitLayout, adminFormFullClass, adminFormGridClass } from '@/admin/components/AdminSplitLayout'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { RichTextEditor } from '@/admin/components/RichTextEditor'
import { useAdminSaveHotkey, useHydratedForm, useUnsavedGuard } from '@/admin/hooks/useAdminFormGuards'
import { useFormAutosave } from '@/admin/hooks/useFormAutosave'
import { clearDraft } from '@/admin/lib/prefs'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { normalizeProduct } from '@/modules/products/normalizeProduct'

type Data = Record<string, unknown>

type FormField = {
  key: string
  label: string
  widget: string
  help?: string | null
  column?: string
  attr_key?: string | null
  required?: boolean
}

type MetaPayload = {
  active: string
  page_slug: string
  form_fields: FormField[]
  base_fields: FormField[]
}

function SaveBar({ saving, error, onSave }: { saving?: boolean; error?: string; onSave: () => void }) {
  return (
    <div className="sticky bottom-4 z-20 mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#151518]/95 p-3 backdrop-blur">
      <Button type="button" disabled={saving} onClick={onSave}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
      {error ? <span className="text-sm text-red-400">{error}</span> : null}
    </div>
  )
}

function useDirtyForm(form: Data, baseline: Data | null) {
  const baselineJson = useMemo(() => JSON.stringify(baseline ?? {}), [baseline])
  const dirty = baseline != null && JSON.stringify(form) !== baselineJson
  return { dirty, baselineJson }
}

function parseJsonInput(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function jsonDisplay(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getFieldValue(form: Data, field: FormField): unknown {
  if (field.attr_key) {
    const attrs = (form.attrs && typeof form.attrs === 'object' && !Array.isArray(form.attrs))
      ? (form.attrs as Record<string, unknown>)
      : {}
    return attrs[field.attr_key] ?? ''
  }
  return form[field.column || field.key]
}

function setFieldValue(form: Data, field: FormField, value: unknown): Data {
  if (field.attr_key) {
    const attrs = (form.attrs && typeof form.attrs === 'object' && !Array.isArray(form.attrs))
      ? { ...(form.attrs as Record<string, unknown>) }
      : {}
    attrs[field.attr_key] = value
    return { ...form, attrs }
  }
  return { ...form, [field.column || field.key]: value }
}

function FieldShell({ label, help, children }: { label: string; help?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-zinc-300">
      <span>{label}</span>
      {children}
      {help ? <span className="block text-xs text-zinc-500">{help}</span> : null}
    </label>
  )
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FormField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const inputClass = 'w-full'
  switch (field.widget) {
    case 'textarea':
      return (
        <FieldShell label={field.label} help={field.help}>
          <textarea className={inputClass} rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </FieldShell>
      )
    case 'richtext':
      return (
        <FieldShell label={field.label} help={field.help}>
          <RichTextEditor value={String(value ?? '')} onChange={onChange} />
        </FieldShell>
      )
    case 'toggle':
      return (
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      )
    case 'media':
      return (
        <MediaPicker
          label={field.label}
          value={value as string | number | null | undefined}
          onChange={onChange}
        />
      )
    case 'json':
      return (
        <FieldShell label={field.label} help={field.help}>
          <textarea
            className={`${inputClass} font-mono text-xs`}
            rows={6}
            value={jsonDisplay(value)}
            onChange={(e) => onChange(parseJsonInput(e.target.value))}
          />
        </FieldShell>
      )
    case 'number':
      return (
        <FieldShell label={field.label} help={field.help}>
          <input
            className={inputClass}
            type="number"
            value={value == null || value === '' ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        </FieldShell>
      )
    case 'url':
      return (
        <FieldShell label={field.label} help={field.help}>
          <input className={inputClass} type="url" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </FieldShell>
      )
    default:
      return (
        <FieldShell label={field.label} help={field.help}>
          <input className={inputClass} type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </FieldShell>
      )
  }
}

export function ProductEditPage() {
  const { id = 'new' } = useAdminRouteParams()
  const nav = useNavigate()
  const pluginsReady = usePluginsHydrated()
  const productsOn = usePluginEnabled('products')
  const { data: raw, isLoading } = useAdminItem<Data>('products', id, productsOn)
  const { save } = useCrud('products')
  const { data: meta } = useQuery({
    queryKey: ['products-templates-meta'],
    enabled: productsOn,
    queryFn: async () => {
      const res = await api.get<{ data: MetaPayload }>('/admin/products-meta/templates')
      return (res as { data?: MetaPayload })?.data ?? null
    },
  })

  const { form, setForm, baseline } = useHydratedForm<Data>(
    raw as Data | undefined,
    String(id),
    {
      createEmpty: () => ({ currency: 'RUB', is_purchasable: true, is_visible: true, price: 0, attrs: {} }),
      transform: (d) => (normalizeProduct(d as never) ?? d) as Data,
    },
  )

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }))
  const patchField = (field: FormField, value: unknown) => setForm((prev) => setFieldValue(prev, field, value))

  const { dirty, baselineJson } = useDirtyForm(form, baseline)
  useUnsavedGuard(dirty)
  const { bannerNode, clearDraftLocal } = useFormAutosave('products', id, form, baselineJson, dirty, (d) => setForm(d))

  const baseFields = meta?.base_fields ?? []
  const templateFields = meta?.form_fields ?? []

  const submit = useCallback(() => {
    const payload: Data = {
      ...form,
      price: form.price != null && form.price !== '' ? Number(form.price) : 0,
      sort_order: form.sort_order != null && form.sort_order !== '' ? Number(form.sort_order) : 0,
      sold_count: form.sold_count != null && form.sold_count !== '' ? Number(form.sold_count) : 0,
      media_id: form.media_id != null && form.media_id !== '' ? Number(form.media_id) : null,
      stock: form.stock === '' || form.stock == null ? null : Number(form.stock),
    }
    save.mutate(
      { data: payload, id: id === 'new' ? undefined : id },
      {
        onSuccess: () => {
          clearDraftLocal()
          clearDraft('products', id)
          nav('/admin/products')
        },
      },
    )
  }, [form, id, save, clearDraftLocal, nav])

  useAdminSaveHotkey(submit)

  const templateLabel = useMemo(() => meta?.active ?? '…', [meta?.active])

  if (!pluginsReady) return <Skeleton className="h-96" />
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
  if (isLoading) return <Skeleton className="h-96" />

  return (
    <AdminSplitLayout
      title={id === 'new' ? 'Новый товар' : 'Редактирование товара'}
      contextKey="products"
      form={
        <>
          {bannerNode}
          <p className="mb-3 text-xs text-zinc-500">
            Шаблон витрины: <span className="text-zinc-300">{templateLabel}</span>
            {meta?.page_slug ? <> · layout <code className="text-zinc-400">{meta.page_slug}</code></> : null}
            {' · '}
            <Link to={adminUrl('/products-templates')} className="link-text">сменить</Link>
          </p>
          <GlassPanel className={adminFormGridClass}>
            <div className={adminFormFullClass}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Основные</h3>
            </div>
            {baseFields.map((field) => (
              <div key={field.key} className={field.widget === 'richtext' || field.widget === 'json' ? adminFormFullClass : undefined}>
                <DynamicField
                  field={field}
                  value={getFieldValue(form, field)}
                  onChange={(v) => patchField(field, v)}
                />
              </div>
            ))}
            {id !== 'new' || form.slug != null ? (
              <FieldShell label="Slug (URL)">
                <input
                  className="w-full"
                  value={String(form.slug ?? '')}
                  onChange={(e) => set('slug', e.target.value)}
                />
              </FieldShell>
            ) : null}

            {templateFields.length ? (
              <>
                <div className={`${adminFormFullClass} mt-2 border-t border-white/10 pt-4`}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Поля шаблона «{templateLabel}»
                  </h3>
                </div>
                {templateFields.map((field) => (
                  <div key={field.key} className={field.widget === 'richtext' || field.widget === 'json' ? adminFormFullClass : undefined}>
                    <DynamicField
                      field={field}
                      value={getFieldValue(form, field)}
                      onChange={(v) => patchField(field, v)}
                    />
                  </div>
                ))}
              </>
            ) : null}
          </GlassPanel>
          <SaveBar saving={save.isPending} error={save.error?.message} onSave={submit} />
        </>
      }
    />
  )
}
