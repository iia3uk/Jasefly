import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { AppIcon, popularIcons, searchIcons } from '@/shared/icons'
import { t } from '@/admin/i18n'

type Props = {
  value?: string | null
  onChange: (value: string) => void
  label?: string
}

export function IconPicker({ value = '', onChange, label = t.iconField }: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value ?? '')

  useEffect(() => {
    setQuery(value ?? '')
  }, [value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const trimmed = query.trim()
  const suggestions = useMemo(() => {
    if (trimmed.length >= 2) return searchIcons(trimmed)
    if (open && trimmed.length === 0) return popularIcons()
    return []
  }, [trimmed, open])

  const showPanel = open

  return (
    <div ref={rootRef} className="relative space-y-2">
      <span className="block text-sm text-zinc-300">{label}</span>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
          <AppIcon name={value || query} size={22} />
        </div>
        <div className="relative min-w-0 flex-1">
          <input
            value={query}
            autoComplete="off"
            spellCheck={false}
            placeholder={t.iconPlaceholder}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={showPanel}
            className="w-full"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              const next = e.target.value
              setQuery(next)
              onChange(next)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'Enter' && suggestions[0]) {
                e.preventDefault()
                const slug = suggestions[0].slug
                setQuery(slug)
                onChange(slug)
                setOpen(false)
              }
            }}
          />
          {!!value && (
            <button
              type="button"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
              title={t.clearMedia}
              onClick={() => {
                setQuery('')
                onChange('')
                setOpen(false)
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-500">{t.iconHint}</p>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-white/10 bg-[#121216] p-2 shadow-2xl"
        >
          {trimmed.length > 0 && trimmed.length < 2 ? (
            <p className="px-2 py-4 text-sm text-zinc-500">{t.iconTypeMore}</p>
          ) : trimmed.length >= 2 && !suggestions.length ? (
            <p className="px-2 py-4 text-sm text-zinc-500">{t.iconNoResults}</p>
          ) : (
            <>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
                {trimmed.length >= 2 ? t.iconSuggestions : t.iconPopular}
              </p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {suggestions.map((item) => {
                  const active = (value ?? '').toLowerCase() === item.slug
                  return (
                    <button
                      key={`${item.kind}-${item.slug}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                        active ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                      }`}
                      onClick={() => {
                        setQuery(item.slug)
                        onChange(item.slug)
                        setOpen(false)
                      }}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
                        <AppIcon name={item.slug} size={16} />
                      </span>
                      <span className="min-w-0 truncate font-mono text-xs">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
