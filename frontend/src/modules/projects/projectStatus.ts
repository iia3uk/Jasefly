/** Shared project lifecycle status labels (not publish draft/published). */
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  completed: 'Завершён',
  in_progress: 'В работе',
  on_hold: 'Заморожен',
  concept: 'Концепт',
  cancelled: 'Отменён',
}

export function projectStatusLabel(status?: string | null): string | null {
  if (!status) return null
  return PROJECT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

/** Soft tone per status for badges on cards. */
export function projectStatusTone(status?: string | null): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
    case 'in_progress':
      return 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]'
    case 'on_hold':
      return 'border-amber-400/35 bg-amber-500/15 text-amber-100'
    case 'concept':
      return 'border-violet-400/35 bg-violet-500/15 text-violet-100'
    case 'cancelled':
      return 'border-zinc-400/35 bg-zinc-500/20 text-zinc-300'
    default:
      return 'border-white/20 bg-black/50 text-zinc-100'
  }
}
