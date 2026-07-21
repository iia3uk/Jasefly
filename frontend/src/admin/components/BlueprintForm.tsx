import { useMemo, type ReactNode } from 'react'
import type { Blueprint, ColumnDef } from '@/core/pluginTypes'
import { RichTextEditor } from '@/admin/components/RichTextEditor'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { adminFormFullClass } from '@/admin/components/AdminSplitLayout'
import { fieldLabel } from '@/admin/i18n'

type Data = Record<string, any>

const inputClass = 'w-full'

function Field({ label, help, children }: { label: string; help?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-zinc-300">
      <span>{label}</span>
      {children}
      {help && <span className="block text-xs text-zinc-500">{help}</span>}
    </label>
  )
}

/** Coerce a raw value into the column's native type for submission. */
function coerce(value: unknown, col: ColumnDef): unknown {
  if (value === '' || value == null) {
    return col.required ? value : null
  }
  switch (col.type) {
    case 'int':
    case 'bigint':
      return Number(value)
    case 'decimal':
      return Number(value)
    case 'bool':
      return Boolean(value)
    case 'json':
      return typeof value === 'string' ? safeJsonParse(value) : value
    default:
      return value
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

/** Render a single field based on its declared widget. */
function FieldRenderer({
  name,
  col,
  value,
  onChange,
}: {
  name: string
  col: ColumnDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const label = col.label ?? fieldLabel(name)

  switch (col.widget) {
    case 'textarea':
      return (
        <Field label={label} help={col.help}>
          <textarea
            className={inputClass}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
    case 'richtext':
      return (
        <Field label={label} help={col.help}>
          <RichTextEditor value={String(value ?? '')} onChange={onChange} />
        </Field>
      )
    case 'toggle':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          {label}
        </label>
      )
    case 'select':
      return (
        <Field label={label} help={col.help}>
          <select
            className={inputClass}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {(col.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Field>
      )
    case 'number':
      return (
        <Field label={label} help={col.help}>
          <input
            className={inputClass}
            type="number"
            min={col.min ?? undefined}
            max={col.max ?? undefined}
            value={value == null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </Field>
      )
    case 'url':
      return (
        <Field label={label} help={col.help}>
          <input
            className={inputClass}
            type="url"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
    case 'color':
      return (
        <Field label={label} help={col.help}>
          <input
            className={inputClass}
            type="color"
            value={String(value ?? '#000000')}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
    case 'media':
      return (
        <Field label={label} help={col.help}>
          <MediaPicker value={value as number | null} onChange={(v) => onChange(v)} />
        </Field>
      )
    case 'json':
    case 'code':
      return (
        <Field label={label} help={col.help}>
          <textarea
            className={`${inputClass} font-mono text-xs`}
            rows={6}
            value={typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2)}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
    case 'hidden':
      return null
    default:
      return (
        <Field label={label} help={col.help}>
          <input
            className={inputClass}
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
  }
}

/**
 * BlueprintForm — renders an editor form from a declarative blueprint.
 *
 * Fields are generated from the blueprint's `columns` map, respecting each
 * column's widget, label, help text, and visibility. Values are coerced to
 * the column's native type on change. Hidden fields are skipped.
 *
 * This is the generic, plugin-driven replacement for the hardcoded
 * `resourceFields` map in CrudEditPage: any blueprint-registered resource
 * gets a working editor with no hand-written form code.
 */
export function BlueprintForm({
  blueprint,
  form,
  set,
}: {
  blueprint: Blueprint
  form: Data
  set: (key: string, value: unknown) => void
}) {
  const columns = useMemo(
    () => Object.entries(blueprint.columns).filter(([, col]) => col.visible && col.widget !== 'hidden'),
    [blueprint],
  )

  return (
    <>
      {columns.map(([name, col]) => {
        const wide = col.widget === 'textarea' || col.widget === 'richtext' || col.widget === 'json' || col.widget === 'media'
        const field = (
          <FieldRenderer
            name={name}
            col={col}
            value={form[name]}
            onChange={(v) => set(name, coerce(v, col))}
          />
        )
        return wide ? (
          <div key={name} className={adminFormFullClass}>{field}</div>
        ) : (
          <div key={name}>{field}</div>
        )
      })}
    </>
  )
}

/** Build initial form defaults from a blueprint (applied for new records). */
export function blueprintDefaults(blueprint: Blueprint): Data {
  const out: Data = {}
  for (const [name, col] of Object.entries(blueprint.columns)) {
    if (col.default !== null && col.default !== undefined) {
      out[name] = col.default
    }
  }
  return out
}
