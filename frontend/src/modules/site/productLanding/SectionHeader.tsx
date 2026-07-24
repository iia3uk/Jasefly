import clsx from 'clsx'

type SectionHeaderProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  align?: 'left' | 'center'
  id?: string
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  id,
}: SectionHeaderProps) {
  return (
    <header className={clsx('mb-10 md:mb-12', align === 'center' ? 'mx-auto text-center' : '')}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--primary)]">
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className={clsx(
          'font-[family-name:var(--font-heading)] text-3xl font-semibold tracking-[-0.035em] text-[color:var(--text)] sm:text-4xl md:text-5xl',
          align === 'center' ? 'mx-auto max-w-3xl' : 'max-w-4xl',
        )}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className={clsx(
            'mt-4 max-w-2xl text-base leading-7 text-[color:var(--muted)] md:text-lg',
            align === 'center' ? 'mx-auto' : '',
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  )
}
