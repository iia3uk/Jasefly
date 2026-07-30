import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { GlassPanel } from '@/components/ui'

export const unpack = <T,>(v: { data?: T } | T): T =>
  (v && typeof v === 'object' && 'data' in v ? (v as { data: T }).data : v as T)

export const ACTION_LABELS: Record<string, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  force_delete: 'Удаление навсегда',
  restore: 'Восстановление',
  publish: 'Публикация',
  login: 'Вход',
  logout: 'Выход',
  settings_change: 'Настройки',
  password_change: 'Пароль',
  empty_trash: 'Очистка корзины',
  webhook: 'Webhook',
  mcp_changelog: 'Changelog',
}

export function WidgetChrome({
  title,
  hint,
  href,
  icon: Icon,
  accent = 'teal',
  children,
  className = '',
}: {
  title: string
  hint?: string
  href?: string
  icon?: LucideIcon
  accent?: 'teal' | 'cyan' | 'amber' | 'violet' | 'sky' | 'rose' | 'emerald'
  children: ReactNode
  className?: string
}) {
  const glow =
    accent === 'cyan'
      ? 'radial-gradient(ellipse 55% 90% at 0% 0%, rgb(34 211 238 / 0.12), transparent 55%)'
      : accent === 'amber'
        ? 'radial-gradient(ellipse 55% 90% at 0% 0%, rgb(251 191 36 / 0.12), transparent 55%)'
        : accent === 'violet'
          ? 'radial-gradient(ellipse 55% 90% at 0% 0%, rgb(167 139 250 / 0.14), transparent 55%)'
          : accent === 'sky'
            ? 'radial-gradient(ellipse 55% 90% at 0% 0%, rgb(56 189 248 / 0.12), transparent 55%)'
            : accent === 'rose'
              ? 'radial-gradient(ellipse 55% 90% at 0% 0%, rgb(251 113 133 / 0.12), transparent 55%)'
              : accent === 'emerald'
                ? 'radial-gradient(ellipse 55% 90% at 0% 0%, rgb(52 211 153 / 0.12), transparent 55%)'
                : 'radial-gradient(ellipse 55% 90% at 0% 0%, rgb(45 212 191 / 0.12), transparent 55%)'

  const linkTone =
    accent === 'amber'
      ? 'border-amber-400/25 bg-amber-500/10 text-amber-100 hover:border-amber-300/40'
      : accent === 'cyan'
        ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/40'
        : accent === 'violet'
          ? 'border-violet-400/25 bg-violet-500/10 text-violet-100 hover:border-violet-300/40'
          : accent === 'rose'
            ? 'border-rose-400/25 bg-rose-500/10 text-rose-100 hover:border-rose-300/40'
            : accent === 'sky'
              ? 'border-sky-400/25 bg-sky-500/10 text-sky-100 hover:border-sky-300/40'
              : 'border-teal-400/25 bg-teal-500/10 text-teal-100 hover:border-teal-300/40'

  return (
    <GlassPanel className={`relative h-full overflow-hidden p-0 ${className}`}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: glow }}
        aria-hidden
      />
      <div className="relative flex h-full flex-col p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {Icon ? <Icon size={15} className="shrink-0 text-zinc-500" aria-hidden /> : null}
              <h2 className="font-heading text-lg text-zinc-100">{title}</h2>
            </div>
            {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
          </div>
          {href ? (
            <Link
              to={href}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${linkTone}`}
            >
              Открыть
              <ArrowUpRight size={12} aria-hidden />
            </Link>
          ) : null}
        </div>
        <div className="mt-4 min-h-0 flex-1">{children}</div>
      </div>
    </GlassPanel>
  )
}
