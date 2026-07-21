import { useAdminLocale } from '@/admin/i18n'

/** Compact RU | EN switcher for the admin sidebar. */
export function AdminLocaleSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { locale, setLocale, t } = useAdminLocale()

  if (collapsed) {
    return (
      <button
        type="button"
        title={t.language}
        onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')}
        className="mt-3 flex w-full items-center justify-center rounded-lg px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 hover:bg-white/5 hover:text-white"
      >
        {locale === 'ru' ? 'EN' : 'RU'}
      </button>
    )
  }

  return (
    <div className="mt-3 px-3" title={t.language}>
      <div className="flex overflow-hidden rounded-lg border border-white/10 text-[11px] font-semibold uppercase tracking-wide">
        <button
          type="button"
          onClick={() => setLocale('ru')}
          className={`flex-1 px-2 py-1.5 transition ${
            locale === 'ru' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
          }`}
        >
          RU
        </button>
        <button
          type="button"
          onClick={() => setLocale('en')}
          className={`flex-1 px-2 py-1.5 transition ${
            locale === 'en' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
          }`}
        >
          EN
        </button>
      </div>
    </div>
  )
}
