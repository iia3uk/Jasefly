import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { endpoints } from '@/lib/api'
import { t } from '@/admin/i18n'
import { adminUrl } from '@/admin/adminBasePath'

type Command = { id: string; label: string; subtitle: string; run: () => void }

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // KeyK — works on EN (K) and RU (Л) layouts
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commands = useMemo<Command[]>(() => [
    {
      id: 'new-page',
      label: 'Новая страница (билдер)',
      subtitle: t.commands,
      run: () => navigate(adminUrl('/pages')),
    },
    {
      id: 'new-project',
      label: t.newProjectCmd,
      subtitle: t.commands,
      run: () => navigate(adminUrl('/projects/new')),
    },
    {
      id: 'new-post',
      label: t.newPostCmd,
      subtitle: t.commands,
      run: () => navigate(adminUrl('/blog/new')),
    },
    {
      id: 'toggle-sidebar',
      label: t.toggleSidebarCmd,
      subtitle: t.commands,
      run: () => window.dispatchEvent(new Event('admin:toggle-sidebar')),
    },
    {
      id: 'view-site',
      label: t.viewSite,
      subtitle: t.commands,
      run: () => window.open('/', '_blank'),
    },
  ], [navigate])

  const { data = [] } = useQuery({
    queryKey: ['admin-search', q],
    queryFn: () => endpoints.search(q),
    enabled: open && q.length >= 2,
  })

  const filteredCommands = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(needle) || c.subtitle.toLowerCase().includes(needle))
  }, [commands, q])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-400 hover:text-white"
      >
        <Search size={15} />
        <span className="hidden sm:inline">{t.search}</span>
        <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#121216] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search size={18} className="text-zinc-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="flex-1 border-none bg-transparent outline-none"
          />
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">Esc</kbd>
        </div>
        <div className="admin-quiet-scroll max-h-80 overflow-y-auto p-2">
          {!!filteredCommands.length && (
            <div className="mb-2">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{t.commands}</p>
              {filteredCommands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  className="flex w-full flex-col rounded-lg px-3 py-2.5 text-left hover:bg-white/5"
                  onClick={() => { cmd.run(); setOpen(false); setQ('') }}
                >
                  <span className="text-sm font-medium">{cmd.label}</span>
                  <span className="text-xs text-zinc-500">{cmd.subtitle}</span>
                </button>
              ))}
            </div>
          )}
          {q.length < 2 && <p className="px-3 py-4 text-sm text-zinc-500">{t.searchHint}</p>}
          {q.length >= 2 && !data.length && <p className="px-3 py-4 text-sm text-zinc-500">{t.noResults}</p>}
          {data.map((item, i) => (
            <button
              key={`${item.type}-${item.id}-${i}`}
              type="button"
              className="flex w-full flex-col rounded-lg px-3 py-2.5 text-left hover:bg-white/5"
              onClick={() => { navigate(adminUrl(item.href)); setOpen(false); setQ('') }}
            >
              <span className="text-sm font-medium">{item.label}</span>
              <span className="text-xs text-zinc-500">{item.type}{item.subtitle ? ` · ${item.subtitle}` : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
