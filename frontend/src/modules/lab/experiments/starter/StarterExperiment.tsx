import { useMemo, useState, type CSSProperties } from 'react'
import type { LabExperimentProps } from '../../experimentRegistry'
import { starterManifest } from './manifest'
import { StarterCard } from './components/StarterCard'
import styles from './styles.module.css'

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function asCards(v: unknown): Array<{ title?: string; text?: string }> {
  if (!Array.isArray(v)) return []
  return v.map((item) => {
    const r = asRecord(item)
    return {
      title: typeof r.title === 'string' ? r.title : undefined,
      text: typeof r.text === 'string' ? r.text : undefined,
    }
  })
}

export default function StarterExperiment({ content, settings }: LabExperimentProps) {
  const c = asRecord(content)
  const s = asRecord(settings)
  const initialTheme = s.theme === 'dark' ? 'dark' : 'light'
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)

  const accent = typeof s.accent === 'string' ? s.accent : undefined
  const title = typeof c.title === 'string' ? c.title : 'Jasefly Lab Starter'
  const subtitle = typeof c.subtitle === 'string' ? c.subtitle : ''
  const ctaLabel = typeof c.cta_label === 'string' ? c.cta_label : 'Действие'
  const ctaHref = typeof c.cta_href === 'string' ? c.cta_href : '#'
  const cards = useMemo(() => asCards(c.cards), [c.cards])

  return (
    <div
      className={`${starterManifest.rootClass} ${styles.root}`}
      data-theme={theme}
      style={accent ? ({ ['--lab-accent' as string]: accent } as CSSProperties) : undefined}
    >
      <div className={styles.inner}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.themeBtn}
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
          </button>
        </div>

        <header className={styles.hero}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          <a className={styles.cta} href={ctaHref}>{ctaLabel}</a>
        </header>

        <section className={styles.grid} aria-label="Карточки">
          {cards.length
            ? cards.map((card, i) => <StarterCard key={i} title={card.title} text={card.text} />)
            : (
              <>
                <StarterCard title="Карточка 1" text="Добавьте cards в content_json." />
                <StarterCard title="Карточка 2" text="Тема переключается локально." />
                <StarterCard title="Карточка 3" text="Глобальная тема сайта не меняется." />
              </>
            )}
        </section>
      </div>
    </div>
  )
}
