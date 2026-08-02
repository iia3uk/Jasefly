import { t } from '@/admin/i18n'

const rows = [
  ['Ctrl / ⌘ + K', 'Поиск и команды'],
  ['Ctrl / ⌘ + S', 'Сохранить форму'],
  ['Shift + / · ?', 'Эта справка'],
  ['Esc', 'Закрыть оверлеи'],
] as const

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[18vh]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121216] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t.shortcuts}
      >
        <h2 className="font-heading text-lg font-semibold">{t.shortcuts}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t.shortcutsHint}</p>
        <ul className="mt-5 space-y-2">
          {rows.map(([keys, label]) => (
            <li key={keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-zinc-400">{label}</span>
              <kbd className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-zinc-300">
                {keys}
              </kbd>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-5 w-full rounded-lg border border-white/10 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
          onClick={onClose}
        >
          Esc
        </button>
      </div>
    </div>
  )
}
