/** Map 0–100 skill percentage to RPG-style rank labels (RU). */

export type SkillRank = {
  /** Filled segments out of total */
  filled: number
  total: number
  label: string
  short: string
}

const RANKS: Array<{ min: number; label: string; short: string }> = [
  { min: 90, label: 'Мастер', short: 'Master' },
  { min: 80, label: 'Эксперт', short: 'Expert' },
  { min: 65, label: 'Специалист', short: 'Pro' },
  { min: 50, label: 'Адепт', short: 'Adept' },
  { min: 35, label: 'Подмастерье', short: 'Journeyman' },
  { min: 20, label: 'Ученик', short: 'Apprentice' },
  { min: 0, label: 'Новичок', short: 'Novice' },
]

export const SKILL_SEGMENTS = 10

export function clampSkillPercent(value?: number | null): number {
  const n = Number(value ?? 0)
  if (Number.isNaN(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function skillRankFromPercent(value?: number | null, total = SKILL_SEGMENTS): SkillRank {
  const pct = clampSkillPercent(value)
  const filled = Math.min(total, Math.max(0, Math.round((pct / 100) * total)))
  const rank = RANKS.find((r) => pct >= r.min) ?? RANKS[RANKS.length - 1]
  return {
    filled,
    total,
    label: rank.label,
    short: rank.short,
  }
}
