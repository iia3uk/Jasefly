import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Button, GlassPanel, Skeleton } from '@/shared/ui'

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function SaveBar({
  saving,
  error,
  onSave,
  label = 'Сохранить изменения',
  children,
}: {
  saving?: boolean
  error?: string
  onSave: () => void
  label?: string
  children?: ReactNode
}) {
  return (
    <div className="sticky bottom-4 z-20 mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#151518]/95 p-3 backdrop-blur">
      <Button type="button" disabled={saving} onClick={onSave}>{saving ? 'Сохранение…' : label}</Button>
      {children}
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  )
}

export function DataTable({
  loading,
  rows,
  empty = 'Пока нет элементов.',
  renderTitle,
  href,
  onDelete,
}: {
  loading?: boolean
  rows: Array<Record<string, unknown>>
  empty?: string
  renderTitle: (row: Record<string, unknown>) => string
  href: (row: Record<string, unknown>) => string
  onDelete?: (id: string | number) => void
}) {
  if (loading) return <Skeleton className="h-64" />
  if (!rows.length) return <GlassPanel className="p-10 text-center text-zinc-500">{empty}</GlassPanel>
  return (
    <GlassPanel className="divide-y divide-white/10 overflow-hidden">
      {rows.map((row) => (
        <div key={String(row.id)} className="flex items-center justify-between gap-4 p-4">
          <Link className="min-w-0 flex-1 rounded-lg py-0.5 hover:bg-white/[0.03]" to={href(row)}>
            <b className={!renderTitle(row)?.trim() ? 'text-zinc-400' : undefined}>
              {renderTitle(row)?.trim() || `Без названия #${row.id}`}
            </b>
          </Link>
          {onDelete && (
            <Button
              type="button"
              className="px-2 text-red-300"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (confirm('Удалить этот элемент?')) onDelete(row.id as string | number)
              }}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      ))}
    </GlassPanel>
  )
}

export function CreateButton({ to, label = 'Новый элемент' }: { to: string; label?: string }) {
  return (
    <Link to={to}>
      <Button type="button"><Plus size={16} />{label}</Button>
    </Link>
  )
}

export function FormField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value?: unknown
  onChange: (v: string | number) => void
  type?: string
}) {
  return (
    <label className="block space-y-2 text-sm text-zinc-300">
      <span>{label}</span>
      <input
        className="w-full"
        type={type}
        value={String(value ?? '')}
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </label>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Подтвердить',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[var(--radius)] border border-white/10 bg-[#151518] p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-heading text-xl">{title}</h2>
        {body && <p className="mt-3 text-sm text-zinc-400">{body}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" className="button-ghost" onClick={onCancel}>Отмена</Button>
          <Button type="button" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
