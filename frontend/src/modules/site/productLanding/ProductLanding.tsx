import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { EditableText } from '@/builder/edit/Editable'
import { AppIcon } from '@/shared/icons'
import { ImagePlaceholder } from './ImagePlaceholder'
import { mergeProductLandingSettings, pl, plFieldLabel, type PlSectionId } from './contentDefaults'
import heroImg from './assets/hero.png'
import pageBuilderImg from './assets/page-builder.png'
import mcpWorkflowImg from './assets/mcp-workflow.png'
import updateZipImg from './assets/update-zip.png'
import mcpInspectorImg from './assets/mcp-inspector.png'
import updatePipelineImg from './assets/update-pipeline.png'
import modulesImg from './assets/modules.png'
import finalCtaImg from './assets/final-cta.png'

const showcaseImages: Record<string, string> = {
  'page-builder-interface': pageBuilderImg,
  'mcp-ai-workflow': mcpWorkflowImg,
  'update-package-interface': updateZipImg,
}

const featureIcons = ['layers', 'layout-template', 'bot', 'rocket', 'package', 'server', 'search', 'shopping-bag', 'shield', 'gauge'] as const
const audienceIcons = ['code-xml', 'users', 'layers', 'bot', 'server'] as const
const showcaseIds = ['page-builder-interface', 'mcp-ai-workflow', 'update-package-interface'] as const

const containerClass = 'mx-auto max-w-6xl px-5 sm:px-6'
const surfaceClass = 'border border-white/10 bg-[color:var(--surface)]'
const ctaPrimary =
  'inline-flex rounded-[var(--radius)] bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-[color:var(--background)] transition-opacity hover:opacity-90'
const ctaGhost =
  'inline-flex rounded-[var(--radius)] border border-white/15 px-5 py-3 text-sm font-semibold text-[color:var(--text)] transition-colors hover:bg-white/5'

function RevealSection({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.section
      id={id}
      className={clsx('py-16 md:py-20', className)}
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {children}
    </motion.section>
  )
}

function SectionHead({
  settings,
  titleKey,
  subtitleKey,
  align = 'left',
  editMode,
}: {
  settings: Record<string, unknown>
  titleKey: string
  subtitleKey?: string
  align?: 'left' | 'center'
  editMode?: boolean
}) {
  const title = pl(settings, titleKey)
  const subtitle = subtitleKey ? pl(settings, subtitleKey) : ''
  return (
    <header className={clsx('mb-10 md:mb-12', align === 'center' ? 'mx-auto text-center' : '')}>
      {(title || editMode) && (
        <EditableText
          field={titleKey}
          label={plFieldLabel(titleKey)}
          value={title}
          as="h2"
          className={clsx(
            'font-[family-name:var(--font-heading)] text-3xl font-semibold tracking-[-0.035em] text-[color:var(--text)] sm:text-4xl md:text-5xl',
            align === 'center' ? 'mx-auto max-w-3xl' : 'max-w-4xl',
          )}
          placeholder="Заголовок"
        />
      )}
      {subtitleKey && (subtitle || editMode) ? (
        <EditableText
          field={subtitleKey}
          label={plFieldLabel(subtitleKey)}
          value={subtitle}
          as="p"
          multiline
          className={clsx(
            'mt-4 max-w-2xl text-base leading-7 text-[color:var(--muted)] md:text-lg',
            align === 'center' ? 'mx-auto' : '',
          )}
          placeholder="Подзаголовок"
        />
      ) : null}
    </header>
  )
}

function CtaLink({
  settings,
  labelKey,
  hrefKey,
  className,
  editMode,
}: {
  settings: Record<string, unknown>
  labelKey: string
  hrefKey: string
  className: string
  editMode?: boolean
}) {
  const label = pl(settings, labelKey)
  const href = pl(settings, hrefKey)
  if (editMode) {
    return (
      <EditableText
        field={labelKey}
        label={plFieldLabel(labelKey)}
        value={label}
        as="span"
        className={className}
        placeholder="Текст кнопки"
      />
    )
  }
  if (!label) return null
  return (
    <a href={href || '#'} className={className}>
      {label}
    </a>
  )
}

function SequentialPipeline({ settings }: { settings: Record<string, unknown> }) {
  const reducedMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.35 })
  const [active, setActive] = useState(reducedMotion ? 6 : 0)

  useEffect(() => {
    if (!inView || reducedMotion) return
    const timers = [0, 1, 2, 3, 4, 5].map((index) => setTimeout(() => setActive(index + 1), index * 220))
    return () => timers.forEach(clearTimeout)
  }, [inView, reducedMotion])

  return (
    <div ref={ref} className="relative grid gap-4 md:grid-cols-6 md:gap-2">
      <div className="absolute left-[8%] right-[8%] top-6 hidden h-px bg-white/10 md:block" aria-hidden />
      {[0, 1, 2, 3, 4, 5].map((index) => {
        const badgeKey = `pipeline_${index}_badge`
        const nameKey = `pipeline_${index}_name`
        const descKey = `pipeline_${index}_desc`
        const badgeClass = clsx(
          'flex size-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-300 md:mx-auto md:mb-5',
          index < active
            ? 'border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--background)]'
            : 'border-white/15 bg-[color:var(--background)] text-[color:var(--muted)]',
        )
        return (
          <div key={nameKey} className="relative z-10 flex gap-4 md:block md:text-center">
            <EditableText
              field={badgeKey}
              label={plFieldLabel(badgeKey)}
              value={pl(settings, badgeKey)}
              as="span"
              className={badgeClass}
              placeholder={String(index + 1)}
            />
            <div>
              <EditableText
                field={nameKey}
                label={plFieldLabel(nameKey)}
                value={pl(settings, nameKey)}
                as="h3"
                className="font-semibold text-[color:var(--text)]"
                placeholder="Шаг"
              />
              <EditableText
                field={descKey}
                label={plFieldLabel(descKey)}
                value={pl(settings, descKey)}
                as="p"
                multiline
                className="mt-1 text-sm leading-6 text-[color:var(--muted)]"
                placeholder="Описание"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProductShowcase({
  settings,
  index,
  reverse = false,
  editMode,
}: {
  settings: Record<string, unknown>
  index: number
  reverse?: boolean
  editMode?: boolean
}) {
  const titleKey = `showcase_${index}_title`
  const descKey = `showcase_${index}_desc`
  const title = pl(settings, titleKey)
  const placeholderId = showcaseIds[index]
  return (
    <article className={clsx('grid items-center gap-8 md:grid-cols-2 md:gap-14', reverse ? 'md:[&>*:first-child]:order-2' : '')}>
      <div>
        <EditableText
          field={titleKey}
          label={plFieldLabel(titleKey)}
          value={title}
          as="h3"
          className="font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-[-0.025em] text-[color:var(--text)] md:text-3xl"
        />
        <EditableText
          field={descKey}
          label={plFieldLabel(descKey)}
          value={pl(settings, descKey)}
          as="p"
          multiline
          className="mt-4 max-w-xl leading-7 text-[color:var(--muted)]"
        />
        <ul className="mt-6 space-y-3">
          {[0, 1, 2].map((pi) => {
            const key = `showcase_${index}_point_${pi}`
            const point = pl(settings, key)
            if (!point && !editMode) return null
            return (
              <li key={key} className="flex gap-3 text-sm leading-6 text-[color:var(--text)]">
                <AppIcon name="check" size={18} className="mt-1 shrink-0 text-[color:var(--primary)]" />
                <EditableText field={key} label={plFieldLabel(key)} value={point} as="span" placeholder="Пункт" />
              </li>
            )
          })}
        </ul>
      </div>
      <ImagePlaceholder
        id={placeholderId}
        title={title}
        recommendedSize="1600 × 1000"
        aspectRatio="16/10"
        src={showcaseImages[placeholderId]}
        altHint={title}
      />
    </article>
  )
}

type ProductLandingProps = {
  settings?: Record<string, unknown>
  editMode?: boolean
  /** Render one landing block (builder section) or the full page. */
  section?: PlSectionId | 'all'
}

export default function ProductLanding({
  settings: rawSettings,
  editMode,
  section = 'all',
}: ProductLandingProps) {
  const settings = mergeProductLandingSettings(rawSettings)
  const [selectedGroup, setSelectedGroup] = useState(0)
  const moduleTabCount = [6, 6, 5, 4, 5]
  const show = (id: PlSectionId) => section === 'all' || section === id

  return (
    <div className="bg-transparent text-[color:var(--text)]">
      {show('hero') ? (
      <RevealSection id="top" className="relative isolate overflow-visible pt-14 md:pt-20">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{
            background: [
              'radial-gradient(ellipse 55% 60% at 22% 18%, color-mix(in srgb, var(--primary) 22%, transparent) 0%, transparent 68%)',
              'radial-gradient(ellipse 48% 52% at 78% 28%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 70%)',
            ].join(','),
          }}
        />
        <div className={clsx(containerClass, 'relative z-10')}>
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
            <div>
              <EditableText
                field="hero_badge"
                label={plFieldLabel('hero_badge')}
                value={pl(settings, 'hero_badge')}
                as="p"
                className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]"
                placeholder="Бейдж"
              />
              <h1 className="mt-5 font-[family-name:var(--font-heading)] text-4xl font-semibold leading-[1.05] tracking-[-0.05em] text-[color:var(--text)] sm:text-5xl lg:text-6xl">
                <EditableText
                  field="hero_title_1"
                  label={plFieldLabel('hero_title_1')}
                  value={pl(settings, 'hero_title_1')}
                  as="span"
                  className="block"
                  placeholder="Заголовок"
                />
                <EditableText
                  field="hero_title_2"
                  label={plFieldLabel('hero_title_2')}
                  value={pl(settings, 'hero_title_2')}
                  as="span"
                  className="mt-2 block text-[color:var(--accent)]"
                  placeholder="Заголовок 2"
                />
              </h1>
              <EditableText
                field="hero_body"
                label={plFieldLabel('hero_body')}
                value={pl(settings, 'hero_body')}
                as="p"
                multiline
                className="mt-6 max-w-2xl text-base leading-7 text-[color:var(--muted)] md:text-lg"
                placeholder="Текст"
              />
              <div className="mt-8 flex flex-wrap gap-3">
                <CtaLink settings={settings} labelKey="hero_cta1_label" hrefKey="hero_cta1_href" className={ctaPrimary} editMode={editMode} />
                <CtaLink settings={settings} labelKey="hero_cta2_label" hrefKey="hero_cta2_href" className={ctaGhost} editMode={editMode} />
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((i) => {
                  const key = `hero_chip_${i}`
                  const item = pl(settings, key)
                  if (!item && !editMode) return null
                  return (
                    <EditableText
                      key={key}
                      field={key}
                      label={plFieldLabel(key)}
                      value={item}
                      as="span"
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-[color:var(--muted)]"
                      placeholder="Чип"
                    />
                  )
                })}
              </div>
            </div>
            <ImagePlaceholder
              id="hero-product-overview"
              title={pl(settings, 'hero_image_title')}
              recommendedSize="1440 × 1000"
              aspectRatio="4/3"
              variant="hero"
              src={heroImg}
              altHint="Конструктор Jasefly CMS с AI-агентом"
            />
          </div>
        </div>
      </RevealSection>
      ) : null}

      {show('how') ? (
      <RevealSection id="how-it-works">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="how_title" subtitleKey="how_subtitle" align="center" editMode={editMode} />
          <SequentialPipeline settings={settings} />
        </div>
      </RevealSection>
      ) : null}

      {show('compare') ? (
      <RevealSection id="compare-vps" className="bg-white/[0.015]">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="compare_title" subtitleKey="compare_subtitle" editMode={editMode} />
          <div className="grid gap-5 md:grid-cols-2">
            {([
              ['compare_left_title', 'compare_left_', 8, false],
              ['compare_right_title', 'compare_right_', 6, true],
            ] as const).map(([titleKey, prefix, count, accent], col) => (
              <article
                key={titleKey}
                className={clsx(surfaceClass, 'rounded-[var(--radius)] p-6 md:p-8', accent ? 'border-[color:var(--primary)]/35' : '')}
              >
                <EditableText
                  field={titleKey}
                  label={plFieldLabel(titleKey)}
                  value={pl(settings, titleKey)}
                  as="h3"
                  className="text-xl font-semibold text-[color:var(--text)]"
                />
                <ul className="mt-6 space-y-3">
                  {Array.from({ length: count }, (_, i) => {
                    const key = `${prefix}${i}`
                    const item = pl(settings, key)
                    if (!item && !editMode) return null
                    return (
                      <li key={key} className="flex gap-3 text-sm leading-6 text-[color:var(--muted)]">
                        <AppIcon name={col ? 'check' : 'server'} size={17} className="mt-1 shrink-0 text-[color:var(--primary)]" />
                        <EditableText field={key} label={plFieldLabel(key)} value={item} as="span" placeholder="Пункт" />
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
          <EditableText
            field="compare_footnote"
            label={plFieldLabel('compare_footnote')}
            value={pl(settings, 'compare_footnote')}
            as="p"
            multiline
            className="mt-6 text-sm leading-6 text-[color:var(--muted)]"
          />
        </div>
      </RevealSection>
      ) : null}

      {show('showcase') ? (
      <RevealSection id="product-in-action">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="action_title" editMode={editMode} />
          <div className="space-y-16 md:space-y-24">
            <ProductShowcase settings={settings} index={0} editMode={editMode} />
            <ProductShowcase settings={settings} index={1} reverse editMode={editMode} />
            <ProductShowcase settings={settings} index={2} editMode={editMode} />
          </div>
        </div>
      </RevealSection>
      ) : null}

      {show('features') ? (
      <RevealSection id="features" className="bg-white/[0.015]">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="features_title" subtitleKey="features_subtitle" align="center" editMode={editMode} />
          <div className="grid gap-4 md:grid-cols-4">
            {featureIcons.map((icon, i) => {
              const titleKey = `feature_${i}_title`
              const descKey = `feature_${i}_desc`
              const wide = i < 6
              return (
                <article
                  key={titleKey}
                  tabIndex={0}
                  className={clsx(
                    surfaceClass,
                    'group rounded-[var(--radius)] p-5 transition duration-200 hover:-translate-y-1 hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--primary)]',
                    wide ? 'md:col-span-2' : '',
                  )}
                >
                  <AppIcon name={icon} size={24} className="text-[color:var(--primary)]" />
                  <EditableText
                    field={titleKey}
                    label={plFieldLabel(titleKey)}
                    value={pl(settings, titleKey)}
                    as="h3"
                    className="mt-5 text-base font-semibold text-[color:var(--text)]"
                  />
                  <EditableText
                    field={descKey}
                    label={plFieldLabel(descKey)}
                    value={pl(settings, descKey)}
                    as="p"
                    multiline
                    className="mt-2 text-sm leading-6 text-[color:var(--muted)]"
                  />
                </article>
              )
            })}
          </div>
        </div>
      </RevealSection>
      ) : null}

      {show('mcp') ? (
      <RevealSection id="mcp-ai">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="mcp_title" subtitleKey="mcp_subtitle" editMode={editMode} />
          <div className={clsx(surfaceClass, 'rounded-[var(--radius)] p-5 md:p-8')}>
            <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
              {[0, 1, 2, 3, 4].map((i, index, items) => {
                const key = `mcp_flow_${i}`
                return (
                  <div key={key} className="flex items-center gap-3">
                    <EditableText
                      field={key}
                      label={plFieldLabel(key)}
                      value={pl(settings, key)}
                      as="span"
                      className="rounded-lg border border-white/15 bg-[color:var(--background)] px-3 py-3 text-center text-xs font-semibold text-[color:var(--text)]"
                    />
                    {index < items.length - 1 ? <span className="hidden text-[color:var(--primary)] md:block">→</span> : null}
                  </div>
                )
              })}
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <EditableText
                    field={`mcp_card_${i}_title`}
                    label={plFieldLabel(`mcp_card_${i}_title`)}
                    value={pl(settings, `mcp_card_${i}_title`)}
                    as="h3"
                    className="font-semibold text-[color:var(--text)]"
                  />
                  <EditableText
                    field={`mcp_card_${i}_desc`}
                    label={plFieldLabel(`mcp_card_${i}_desc`)}
                    value={pl(settings, `mcp_card_${i}_desc`)}
                    as="p"
                    multiline
                    className="mt-2 text-sm leading-6 text-[color:var(--muted)]"
                  />
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((i) => (
                <EditableText
                  key={i}
                  field={`mcp_cmd_${i}`}
                  label={plFieldLabel(`mcp_cmd_${i}`)}
                  value={pl(settings, `mcp_cmd_${i}`)}
                  as="code"
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-[color:var(--accent)]"
                />
              ))}
            </div>
          </div>
          <ImagePlaceholder
            id="mcp-inspector-interface"
            title={pl(settings, 'mcp_image_title')}
            recommendedSize="1500 × 950"
            aspectRatio="16/10"
            className="mt-6"
            src={mcpInspectorImg}
            altHint="Инспектор MCP: операции, права и превью"
          />
        </div>
      </RevealSection>
      ) : null}

      {show('updates') ? (
      <RevealSection id="updates" className="bg-white/[0.015]">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="updates_title" editMode={editMode} />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[color:var(--text)]">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="flex items-center gap-2">
                <EditableText
                  field={`updates_step_${i}`}
                  label={plFieldLabel(`updates_step_${i}`)}
                  value={pl(settings, `updates_step_${i}`)}
                  as="span"
                  className="rounded-full border border-white/15 px-3 py-1.5"
                />
                {i < 5 ? <span className="text-[color:var(--primary)]">→</span> : null}
              </span>
            ))}
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {([
              ['updates_keep_title', 'updates_keep_', 4],
              ['updates_new_title', 'updates_new_', 4],
            ] as const).map(([titleKey, prefix, count]) => (
              <article key={titleKey} className={clsx(surfaceClass, 'rounded-[var(--radius)] p-6')}>
                <EditableText
                  field={titleKey}
                  label={plFieldLabel(titleKey)}
                  value={pl(settings, titleKey)}
                  as="h3"
                  className="text-lg font-semibold text-[color:var(--text)]"
                />
                <ul className="mt-4 space-y-2">
                  {Array.from({ length: count }, (_, i) => {
                    const key = `${prefix}${i}`
                    return (
                      <li key={key} className="flex gap-2 text-sm text-[color:var(--muted)]">
                        <AppIcon name="check" size={16} className="mt-0.5 text-[color:var(--primary)]" />
                        <EditableText field={key} label={plFieldLabel(key)} value={pl(settings, key)} as="span" />
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
          <ImagePlaceholder
            id="update-pipeline-dashboard"
            title={pl(settings, 'updates_image_title')}
            recommendedSize="1600 × 900"
            aspectRatio="16/9"
            className="mt-6"
            src={updatePipelineImg}
            altHint="Пайплайн обновления Jasefly CMS"
          />
        </div>
      </RevealSection>
      ) : null}

      {show('modules') ? (
      <RevealSection id="modules">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="modules_title" editMode={editMode} />
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
            <div role="tablist" aria-label="Категории модулей" className="flex gap-2 overflow-x-auto lg:flex-col">
              {[0, 1, 2, 3, 4].map((index) => {
                const key = `modules_tab_${index}`
                const name = pl(settings, key)
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={selectedGroup === index}
                    onClick={() => setSelectedGroup(index)}
                    className={clsx(
                      'whitespace-nowrap rounded-[var(--radius)] border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--primary)]',
                      selectedGroup === index
                        ? 'border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--background)]'
                        : 'border-white/10 text-[color:var(--muted)] hover:bg-white/5',
                    )}
                  >
                    {editMode ? (
                      <EditableText field={key} label={plFieldLabel(key)} value={name} as="span" />
                    ) : (
                      name
                    )}
                  </button>
                )
              })}
            </div>
            <div role="tabpanel" className={clsx(surfaceClass, 'rounded-[var(--radius)] p-6 md:p-8')}>
              <EditableText
                field={`modules_tab_${selectedGroup}`}
                label={plFieldLabel(`modules_tab_${selectedGroup}`)}
                value={pl(settings, `modules_tab_${selectedGroup}`)}
                as="p"
                className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]"
              />
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: moduleTabCount[selectedGroup] }, (_, i) => {
                  const key = `modules_${selectedGroup}_${i}`
                  return (
                    <li key={key} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 text-sm text-[color:var(--text)]">
                      <AppIcon name="check" size={17} className="text-[color:var(--primary)]" />
                      <EditableText field={key} label={plFieldLabel(key)} value={pl(settings, key)} as="span" />
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
          <ImagePlaceholder
            id="modules-management-interface"
            title={pl(settings, 'modules_image_title')}
            recommendedSize="1500 × 950"
            aspectRatio="16/10"
            className="mt-6"
            src={modulesImg}
            altHint="Менеджер модулей Jasefly CMS"
          />
        </div>
      </RevealSection>
      ) : null}

      {show('audience') ? (
      <RevealSection id="audience" className="bg-white/[0.015]">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="audience_title" align="center" editMode={editMode} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {audienceIcons.map((icon, i) => (
              <article key={i} className={clsx(surfaceClass, 'rounded-[var(--radius)] p-5')}>
                <AppIcon name={icon} size={22} className="text-[color:var(--primary)]" />
                <EditableText
                  field={`audience_${i}_title`}
                  label={plFieldLabel(`audience_${i}_title`)}
                  value={pl(settings, `audience_${i}_title`)}
                  as="h3"
                  className="mt-4 font-semibold text-[color:var(--text)]"
                />
                <EditableText
                  field={`audience_${i}_desc`}
                  label={plFieldLabel(`audience_${i}_desc`)}
                  value={pl(settings, `audience_${i}_desc`)}
                  as="p"
                  multiline
                  className="mt-2 text-sm leading-6 text-[color:var(--muted)]"
                />
              </article>
            ))}
          </div>
        </div>
      </RevealSection>
      ) : null}

      {show('tech') ? (
      <RevealSection id="tech">
        <div className={containerClass}>
          <SectionHead settings={settings} titleKey="tech_title" editMode={editMode} />
          <div className="grid gap-5 md:grid-cols-2">
            {([
              ['tech_dev_title', 'tech_dev_', 6],
              ['tech_prod_title', 'tech_prod_', 4],
            ] as const).map(([titleKey, prefix, count]) => (
              <article key={titleKey} className={clsx(surfaceClass, 'rounded-[var(--radius)] p-6')}>
                <EditableText
                  field={titleKey}
                  label={plFieldLabel(titleKey)}
                  value={pl(settings, titleKey)}
                  as="h3"
                  className="text-lg font-semibold text-[color:var(--text)]"
                />
                <div className="mt-5 flex flex-wrap gap-2">
                  {Array.from({ length: count }, (_, i) => {
                    const key = `${prefix}${i}`
                    return (
                      <EditableText
                        key={key}
                        field={key}
                        label={plFieldLabel(key)}
                        value={pl(settings, key)}
                        as="span"
                        className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-[color:var(--muted)]"
                      />
                    )
                  })}
                </div>
              </article>
            ))}
          </div>
          <EditableText
            field="tech_footnote"
            label={plFieldLabel('tech_footnote')}
            value={pl(settings, 'tech_footnote')}
            as="p"
            multiline
            className="mt-5 max-w-3xl text-sm leading-6 text-[color:var(--muted)]"
          />
        </div>
      </RevealSection>
      ) : null}

      {show('cta') ? (
      <RevealSection id="cta" className="relative isolate overflow-visible">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{
            background: [
              'radial-gradient(ellipse 50% 55% at 15% 25%, color-mix(in srgb, var(--primary) 18%, transparent) 0%, transparent 70%)',
              'radial-gradient(ellipse 45% 50% at 85% 80%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 68%)',
            ].join(','),
          }}
        />
        <div className={containerClass}>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <SectionHead settings={settings} titleKey="cta_title" subtitleKey="cta_subtitle" editMode={editMode} />
              <div className="flex flex-wrap gap-3">
                <CtaLink settings={settings} labelKey="cta_btn1_label" hrefKey="cta_btn1_href" className={ctaPrimary} editMode={editMode} />
                <CtaLink settings={settings} labelKey="cta_btn2_label" hrefKey="cta_btn2_href" className={ctaGhost} editMode={editMode} />
              </div>
            </div>
            <ImagePlaceholder
              id="final-product-composition"
              title={pl(settings, 'cta_image_title')}
              recommendedSize="1600 × 900"
              aspectRatio="16/9"
              src={finalCtaImg}
              altHint="Админка, MCP и сайт в одной схеме"
            />
          </div>
        </div>
      </RevealSection>
      ) : null}
    </div>
  )
}

type PlBlockProps = { settings?: Record<string, unknown>; editMode?: boolean }

export function PlHero(props: PlBlockProps) {
  return <ProductLanding {...props} section="hero" />
}
export function PlHow(props: PlBlockProps) {
  return <ProductLanding {...props} section="how" />
}
export function PlCompare(props: PlBlockProps) {
  return <ProductLanding {...props} section="compare" />
}
export function PlShowcase(props: PlBlockProps) {
  return <ProductLanding {...props} section="showcase" />
}
export function PlFeatures(props: PlBlockProps) {
  return <ProductLanding {...props} section="features" />
}
export function PlMcp(props: PlBlockProps) {
  return <ProductLanding {...props} section="mcp" />
}
export function PlUpdates(props: PlBlockProps) {
  return <ProductLanding {...props} section="updates" />
}
export function PlModules(props: PlBlockProps) {
  return <ProductLanding {...props} section="modules" />
}
export function PlAudience(props: PlBlockProps) {
  return <ProductLanding {...props} section="audience" />
}
export function PlTech(props: PlBlockProps) {
  return <ProductLanding {...props} section="tech" />
}
export function PlCta(props: PlBlockProps) {
  return <ProductLanding {...props} section="cta" />
}
