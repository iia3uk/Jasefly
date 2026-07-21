import { useState } from 'react'
import { ArrowDown, ArrowUp, Film, Plus, Trash2 } from 'lucide-react'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { isVideoFileUrl, isVideoMime } from '@/builder/lib/videoEmbed'
import { mediaUrl } from '@/lib/api'
import type { ID } from '@/types'

type Row = Record<string, unknown>

type FieldDef =
  | { key: string; label: string; kind: 'text' | 'textarea' | 'url' }
  | { key: string; label: string; kind: 'media' }
  | { key: string; label: string; kind: 'toggle' }

type Props = {
  value: unknown
  onChange: (v: unknown) => void
  fields: FieldDef[]
  blank: () => Row
  addLabel?: string
  /** Multiple add buttons (e.g. image vs video). Falls back to single addLabel+blank. */
  addActions?: Array<{ label: string; blank: () => Row }>
}

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return []
  return value.filter((x) => x && typeof x === 'object') as Row[]
}

export function ItemsEditor({ value, onChange, fields, blank, addLabel = 'Добавить', addActions }: Props) {
  const rows = asRows(value)
  const [pickerFor, setPickerFor] = useState<number | null>(null)

  const setRows = (next: Row[]) => onChange(next)

  const update = (index: number, key: string, v: unknown) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, [key]: v } : row)))
  }

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    setRows(next)
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">#{index + 1}</span>
            <div className="flex gap-0.5">
              <button type="button" className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-white" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp size={12} />
              </button>
              <button type="button" className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-white" disabled={index >= rows.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown size={12} />
              </button>
              <button type="button" className="rounded p-1 text-red-300/80 hover:bg-red-500/10" onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {fields.map((f) => {
            if (f.kind === 'media') {
              const id = row[f.key] as ID | null | undefined
              const mime = String(row.media_mime || '')
              const nameHint = String(row.original_name || row.filename || '')
              const asVideo = isVideoMime(mime) || isVideoFileUrl(nameHint) || isVideoFileUrl(mediaUrl(id ?? null))
              const thumb = id ? mediaUrl(id) : undefined
              return (
                <div key={f.key} className="space-y-1">
                  <p className="text-[11px] text-zinc-500">{f.label}</p>
                  <div className="flex items-center gap-2">
                    {id && thumb ? (
                      asVideo ? (
                        <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-black/50">
                          <video src={thumb} className="h-full w-full object-cover" muted preload="metadata" />
                          <Film size={12} className="pointer-events-none absolute text-white drop-shadow" />
                        </span>
                      ) : (
                        <img src={thumb} alt="" className="h-10 w-10 rounded-md object-cover" />
                      )
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-white/15 text-[10px] text-zinc-600">—</span>
                    )}
                    <button type="button" className="text-[11px] text-[var(--accent,#8eb6ff)] hover:underline" onClick={() => setPickerFor(index)}>
                      {id ? 'Сменить' : 'Выбрать'}
                    </button>
                    {id ? (
                      <button
                        type="button"
                        className="text-[11px] text-zinc-500 hover:text-white"
                        onClick={() => {
                          setRows(rows.map((r, i) => (i === index ? { ...r, [f.key]: null, media_mime: null } : r)))
                        }}
                      >
                        убрать
                      </button>
                    ) : null}
                  </div>
                  {pickerFor === index && (
                    <MediaPicker
                      value={id ?? null}
                      onChange={(v, asset) => {
                        setRows(rows.map((r, i) => (
                          i === index
                            ? {
                                ...r,
                                [f.key]: v,
                                media_mime: asset?.mime_type ?? (v == null ? null : r.media_mime),
                                original_name: asset?.original_name ?? (v == null ? null : r.original_name),
                              }
                            : r
                        )))
                        setPickerFor(null)
                      }}
                      triggerless
                      defaultOpen
                      onClose={() => setPickerFor(null)}
                    />
                  )}
                </div>
              )
            }
            if (f.kind === 'toggle') {
              return (
                <label key={f.key} className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <input type="checkbox" checked={Boolean(row[f.key])} onChange={(e) => update(index, f.key, e.target.checked)} />
                  {f.label}
                </label>
              )
            }
            if (f.kind === 'textarea') {
              return (
                <label key={f.key} className="block space-y-1 text-[11px] text-zinc-500">
                  {f.label}
                  <textarea
                    className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200"
                    rows={2}
                    value={String(row[f.key] ?? '')}
                    onChange={(e) => update(index, f.key, e.target.value)}
                  />
                </label>
              )
            }
            return (
              <label key={f.key} className="block space-y-1 text-[11px] text-zinc-500">
                {f.label}
                <input
                  className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200"
                  type={f.kind === 'url' ? 'url' : 'text'}
                  value={String(row[f.key] ?? '')}
                  onChange={(e) => update(index, f.key, e.target.value)}
                />
              </label>
            )
          })}
        </div>
      ))}
      {(addActions?.length ? addActions : [{ label: addLabel, blank }]).map((action) => (
        <button
          key={action.label}
          type="button"
          className="mr-3 inline-flex items-center gap-1 text-[11px] text-[var(--accent,#8eb6ff)] hover:underline"
          onClick={() => setRows([...rows, action.blank()])}
        >
          <Plus size={12} /> {action.label}
        </button>
      ))}
    </div>
  )
}
