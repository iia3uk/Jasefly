import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Skeleton, SurfacePanel } from '@/components/ui'
import type { SkillCategory } from '@/types'
import { skillRankFromPercent } from '@/shared/skillRank'

export type SkillsPreset = 'tabs' | 'stacked' | 'minimal' | 'grid'
export type SkillsSize = 'sm' | 'md' | 'lg'

export const SKILLS_PRESETS: Array<{ value: SkillsPreset; label: string }> = [
  { value: 'tabs', label: 'Вкладки (классика)' },
  { value: 'stacked', label: 'Стек по категориям' },
  { value: 'minimal', label: 'Минимальный список' },
  { value: 'grid', label: 'Сетка карточек' },
]

export const SKILLS_SIZES: Array<{ value: SkillsSize; label: string }> = [
  { value: 'sm', label: 'Компактный' },
  { value: 'md', label: 'Обычный' },
  { value: 'lg', label: 'Крупный' },
]

type SizeTokens = {
  panelPad: string
  catPad: string
  catTitle: string
  catNum: string
  heading: string
  desc: string
  skillName: string
  rank: string
  rowGap: string
  barH: string
  barGap: string
  listMt: string
  sidebar: string
}

const SIZE: Record<SkillsSize, SizeTokens> = {
  sm: {
    panelPad: 'p-3 sm:p-4',
    catPad: 'px-2.5 py-2',
    catTitle: 'text-sm',
    catNum: 'text-[0.6rem] tracking-[0.16em]',
    heading: 'text-lg sm:text-xl',
    desc: 'text-xs sm:text-sm',
    skillName: 'text-sm',
    rank: 'text-[0.65rem] tracking-[0.1em]',
    rowGap: 'space-y-3',
    barH: 'h-1.5',
    barGap: 'gap-0.5',
    listMt: 'mt-4',
    sidebar: 'lg:grid-cols-[minmax(8.5rem,0.32fr)_1fr]',
  },
  md: {
    panelPad: 'p-4 sm:p-6',
    catPad: 'px-3 py-2.5',
    catTitle: 'text-sm sm:text-base',
    catNum: 'text-[0.65rem] tracking-[0.18em]',
    heading: 'text-xl sm:text-2xl',
    desc: 'text-sm',
    skillName: 'text-base',
    rank: 'text-xs tracking-[0.12em]',
    rowGap: 'space-y-4 sm:space-y-5',
    barH: 'h-2',
    barGap: 'gap-1',
    listMt: 'mt-6',
    sidebar: 'lg:grid-cols-[minmax(10rem,0.36fr)_1fr]',
  },
  lg: {
    panelPad: 'p-4 sm:p-8 lg:p-10',
    catPad: 'px-3 py-2.5 sm:px-4 sm:py-3',
    catTitle: 'text-base lg:text-lg',
    catNum: 'text-[0.65rem] tracking-[0.18em]',
    heading: 'text-2xl sm:text-3xl lg:text-4xl',
    desc: 'text-sm sm:text-base',
    skillName: 'text-base sm:text-lg lg:text-xl',
    rank: 'text-xs sm:text-[0.7rem] tracking-[0.12em]',
    rowGap: 'space-y-6 sm:space-y-8',
    barH: 'h-2.5 sm:h-3',
    barGap: 'gap-1 sm:gap-1.5',
    listMt: 'mt-8 sm:mt-10',
    sidebar: 'lg:grid-cols-[minmax(11rem,0.38fr)_1fr]',
  },
}

type Props = {
  categories?: SkillCategory[]
  /** Visual layout preset */
  preset?: SkillsPreset
  /** Density / typography scale — default compact */
  size?: SkillsSize
  /** Show rank labels (Специалист / …) */
  showRanks?: boolean
  /** Animate segment bars */
  animate?: boolean
}

function SkillBars({
  name,
  filled,
  total,
  barH,
  barGap,
  animate,
  delayBase,
}: {
  name: string
  filled: number
  total: number
  barH: string
  barGap: string
  animate: boolean
  delayBase: number
}) {
  return (
    <div className={`flex ${barGap}`} role="img" aria-label={`${name}`}>
      {Array.from({ length: total }, (_, seg) => {
        const on = seg < filled
        const cls = `${barH} flex-1 rounded-[2px] ${
          on ? 'bg-[linear-gradient(180deg,var(--accent),var(--primary))]' : 'bg-white/[0.08]'
        }`
        if (!animate) {
          return <span key={seg} className={cls} />
        }
        return (
          <motion.span
            key={seg}
            className={cls}
            initial={{ opacity: 0, scaleY: 0.4 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{
              duration: 0.22,
              delay: delayBase + 0.028 * seg,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        )
      })}
    </div>
  )
}

function SkillRow({
  skill,
  index,
  sz,
  showRanks,
  animate,
}: {
  skill: NonNullable<SkillCategory['skills']>[number]
  index: number
  sz: SizeTokens
  showRanks: boolean
  animate: boolean
}) {
  const rank = skillRankFromPercent(skill.percentage)
  return (
    <li>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 sm:mb-2 sm:gap-3">
        <span className={`min-w-0 font-heading font-medium tracking-[-0.02em] ${sz.skillName}`}>
          {skill.name}
        </span>
        {showRanks ? (
          <span className={`shrink-0 font-heading font-semibold uppercase text-[var(--accent)] ${sz.rank}`}>
            {rank.label}
          </span>
        ) : null}
      </div>
      <SkillBars
        name={skill.name}
        filled={rank.filled}
        total={rank.total}
        barH={sz.barH}
        barGap={sz.barGap}
        animate={animate}
        delayBase={0.04 * index}
      />
    </li>
  )
}

function CategorySkills({
  category,
  sz,
  showRanks,
  animate,
}: {
  category: SkillCategory
  sz: SizeTokens
  showRanks: boolean
  animate: boolean
}) {
  return (
    <ul className={`${sz.listMt} ${sz.rowGap}`}>
      {category.skills?.map((skill, i) => (
        <SkillRow
          key={String(skill.id)}
          skill={skill}
          index={i}
          sz={sz}
          showRanks={showRanks}
          animate={animate}
        />
      ))}
    </ul>
  )
}

/** Один блок навыков — пресеты визуала + масштаб размера. */
export function SkillsBlock({
  categories,
  preset = 'tabs',
  size = 'sm',
  showRanks = true,
  animate = true,
}: Props) {
  const [active, setActive] = useState(0)
  if (!categories?.length) return <Skeleton className="h-32" />

  const sz = SIZE[size] ?? SIZE.sm
  const safeIndex = Math.min(active, categories.length - 1)
  const current = categories[safeIndex]

  if (preset === 'minimal') {
    return (
      <div className={`space-y-6 ${sz.panelPad} rounded-[var(--radius)] border border-white/[0.08] bg-white/[0.02]`}>
        {categories.map((cat) => (
          <div key={String(cat.id)}>
            <p className={`font-heading font-semibold tracking-[-0.03em] ${sz.heading}`}>{cat.name}</p>
            {cat.description ? (
              <p className={`mt-1 text-[var(--muted)] ${sz.desc}`}>{cat.description}</p>
            ) : null}
            <CategorySkills category={cat} sz={sz} showRanks={showRanks} animate={animate} />
          </div>
        ))}
      </div>
    )
  }

  if (preset === 'stacked') {
    return (
      <div className="space-y-3">
        {categories.map((cat, i) => {
          const open = i === safeIndex
          return (
            <SurfacePanel key={String(cat.id)} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 text-left transition ${sz.panelPad} ${
                  open ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span>
                  <span className={`block font-heading text-[var(--muted)] ${sz.catNum}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={`mt-0.5 block font-heading font-semibold tracking-[-0.02em] ${sz.catTitle}`}>
                    {cat.name}
                  </span>
                </span>
                <span className="text-xs text-[var(--muted)]">{open ? '−' : '+'}</span>
              </button>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className={`border-t border-white/[0.06] ${sz.panelPad}`}>
                      {cat.description ? (
                        <p className={`text-[var(--muted)] ${sz.desc}`}>{cat.description}</p>
                      ) : null}
                      <CategorySkills category={cat} sz={sz} showRanks={showRanks} animate={animate} />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </SurfacePanel>
          )
        })}
      </div>
    )
  }

  if (preset === 'grid') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((cat) => (
          <SurfacePanel key={String(cat.id)} className={sz.panelPad}>
            <p className={`font-heading font-semibold tracking-[-0.03em] ${sz.heading}`}>{cat.name}</p>
            {cat.description ? (
              <p className={`mt-1 text-[var(--muted)] ${sz.desc}`}>{cat.description}</p>
            ) : null}
            <CategorySkills category={cat} sz={sz} showRanks={showRanks} animate={animate} />
          </SurfacePanel>
        ))}
      </div>
    )
  }

  // preset === 'tabs' (default)
  return (
    <SurfacePanel>
      <div className={`relative grid ${sz.sidebar}`}>
        <div className="-mx-0 flex gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth border-b border-white/[0.06] p-2 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:border-b-0 lg:border-r lg:border-white/[0.06] lg:p-3 [&::-webkit-scrollbar]:hidden">
          {categories.map((cat, i) => {
            const isActive = i === safeIndex
            return (
              <button
                key={String(cat.id)}
                type="button"
                onClick={() => setActive(i)}
                className={`shrink-0 rounded-[calc(var(--radius)-2px)] border text-left transition lg:w-full ${sz.catPad} ${
                  isActive
                    ? 'border-white/15 bg-white/[0.08] text-[var(--text)]'
                    : 'border-transparent text-[var(--muted)] hover:border-white/10 hover:bg-white/[0.05] hover:text-[var(--text)]'
                }`}
              >
                <span className={`block font-heading text-[var(--muted)] ${sz.catNum}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`mt-0.5 block font-heading font-semibold tracking-[-0.02em] ${sz.catTitle} ${isActive ? 'text-[var(--text)]' : ''}`}>
                  {cat.name}
                </span>
              </button>
            )
          })}
        </div>

        <div className={`relative min-h-[10rem] ${sz.panelPad}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={String(current.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className={`font-heading font-semibold tracking-[-0.04em] ${sz.heading}`}>
                {current.name}
              </p>
              {current.description ? (
                <p className={`mt-1.5 max-w-xl text-[var(--muted)] ${sz.desc}`}>{current.description}</p>
              ) : null}
              <CategorySkills category={current} sz={sz} showRanks={showRanks} animate={animate} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </SurfacePanel>
  )
}
