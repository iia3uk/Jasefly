import { useState, type CSSProperties } from 'react'
import type { LabExperimentProps } from '../../experimentRegistry'
import { referenceManifest } from './manifest'
import styles from './styles.module.css'

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/**
 * Lab "reference" entry — isolated style/hierarchy demo.
 * Content/settings shape matches LabService::defaultContentForEntry('reference').
 */
export default function ReferenceExperiment({ content, settings }: LabExperimentProps) {
  const c = asRecord(content)
  const s = asRecord(settings)
  const initialTheme = s.theme === 'light' ? 'light' : 'dark'
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)

  const accent = str(s.accent, '#5bdf6f')
  const brand = str(c.brand, "Cheater's Market")
  const kicker = str(c.kicker, 'Marketplace live · Active')
  const headline = str(c.headline, 'Curated game cheats, spoofers & accounts')
  const lede = str(c.lede, 'Hand-picked tools from vetted developers.')
  const ctaPrimary = str(c.cta_primary, 'Browse Catalog')
  const ctaSecondary = str(c.cta_secondary, 'View Accounts')

  return (
    <div
      className={`${referenceManifest.rootClass} ${styles.root}`}
      data-theme={theme}
      style={{ ['--lab-accent' as string]: accent } as CSSProperties}
    >
      <div className={styles.plane} aria-hidden />
      <div className={styles.inner}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.themeBtn}
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </button>
        </div>

        <p className={styles.brand}>{brand}</p>
        <p className={styles.kicker}>{kicker}</p>
        <h1 className={styles.headline}>{headline}</h1>
        {lede ? <p className={styles.lede}>{lede}</p> : null}

        <div className={styles.actions}>
          <a className={styles.ctaPrimary} href="#catalog">{ctaPrimary}</a>
          <a className={styles.ctaSecondary} href="#accounts">{ctaSecondary}</a>
        </div>
      </div>
    </div>
  )
}
