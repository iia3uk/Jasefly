/**
 * Extra framework marketing widgets:
 * dev-journey · repo-tree · status-timeline · github-pulse · explore-doors
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { EditableText } from '@/builder/edit/Editable'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import { AppIcon } from '@/shared/icons'
import sitePulse from '@/generated/sitePulse.json'

function fields(...items: SettingsField[]) {
  return items
}

type Row = Record<string, unknown>

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return []
  return value.filter((x) => x && typeof x === 'object') as Row[]
}

const DEFAULT_JOURNEY = [
  { title: 'Idea', text: 'A product need appears' },
  { title: 'Build', text: 'Extend the platform' },
  { title: 'ZIP', text: 'Package the module' },
  { title: 'Production', text: 'Ship on shared hosting' },
  { title: 'Update', text: 'Safe SiteUpdater release' },
  { title: 'AI', text: 'MCP-assisted ops' },
  { title: 'Next', text: 'Another feature' },
]

function DevJourneyRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const items = asRows(settings.items)
  const list: Row[] = items.length ? items : (DEFAULT_JOURNEY as Row[])

  return (
    <div style={styles} className="fw-journey w-full">
      {(settings.title || editMode) ? (
        <EditableText
          field="title"
          label="Title"
          value={String(settings.title || '')}
          as="h2"
          className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-[color:var(--text)] md:text-3xl"
          placeholder="Developer journey"
        />
      ) : null}
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Subtitle"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mb-8 max-w-2xl text-sm leading-6 text-[color:var(--muted)]"
          placeholder="Product lifecycle"
        />
      ) : null}
      <ol className="fw-journey-track flex list-none gap-0 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((item, i) => {
          const last = i === list.length - 1
          return (
            <li key={i} className="fw-journey-step relative flex min-w-[9.5rem] flex-1 flex-col items-center px-2 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--primary)]/35 bg-[color:var(--primary)]/10 text-xs font-semibold text-[color:var(--primary)] shadow-[0_0_24px_-8px_var(--primary)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="mt-3 text-sm font-semibold text-[color:var(--text)]">{String(item.title || '')}</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{String(item.text ?? item.body ?? '')}</p>
              {!last ? (
                <span className="pointer-events-none absolute top-5 left-[calc(50%+1.4rem)] right-[calc(-50%+1.4rem)] hidden h-px bg-gradient-to-r from-[color:var(--primary)]/50 to-[color:var(--accent)]/30 md:block" aria-hidden />
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function RepoTreeRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const tree = String(settings.tree || `jasefly/
├── backend/          PHP core · Platform SDK · modules
├── frontend/         React admin · public · builder
├── modules-src/      ZIP package sources
├── content/          Content packs
├── docs/             Engineer documentation
└── mcp-cms/          MCP server for agents`)

  return (
    <div style={styles} className="fw-repo-tree w-full">
      {(settings.title || editMode) ? (
        <EditableText
          field="title"
          label="Title"
          value={String(settings.title || '')}
          as="h2"
          className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-[color:var(--text)] md:text-3xl"
          placeholder="Real project structure"
        />
      ) : null}
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Subtitle"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mb-6 max-w-2xl text-sm leading-6 text-[color:var(--muted)]"
          placeholder="As in the repository"
        />
      ) : null}
      <div className="overflow-hidden rounded-[var(--radius)] border border-white/10 bg-[#0c0c14] shadow-[0_0_48px_-22px_var(--primary)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">repository</p>
          <a
            href={String(settings.repo_href || 'https://github.com/iia3uk/jasefly')}
            className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Open on GitHub →
          </a>
        </div>
        {editMode ? (
          <EditableText
            field="tree"
            label="Tree"
            value={tree}
            as="pre"
            multiline
            className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-zinc-200 whitespace-pre-wrap"
            placeholder="project tree"
          />
        ) : (
          <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-zinc-200">
            <code>{tree}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

function StatusTimelineRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const columns = [
    { key: 'completed', title: String(settings.completed_title || 'Completed'), tone: 'done' as const, items: asRows(settings.completed) },
    { key: 'current', title: String(settings.current_title || 'Current'), tone: 'progress' as const, items: asRows(settings.current) },
    { key: 'next', title: String(settings.next_title || 'Next'), tone: 'next' as const, items: asRows(settings.next) },
    { key: 'future', title: String(settings.future_title || 'Future'), tone: 'planned' as const, items: asRows(settings.future) },
  ]

  return (
    <div style={styles} className="fw-timeline w-full">
      {(settings.title || editMode) ? (
        <EditableText
          field="title"
          label="Title"
          value={String(settings.title || '')}
          as="h2"
          className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-[color:var(--text)] md:text-3xl"
          placeholder="Roadmap"
        />
      ) : null}
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Subtitle"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mb-8 max-w-2xl text-sm leading-6 text-[color:var(--muted)]"
          placeholder="Direction of travel"
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map((col, idx) => (
          <div
            key={col.key}
            className={clsx(
              'relative rounded-[var(--radius)] border bg-[color:var(--surface)]/55 p-5 transition duration-300 hover:-translate-y-0.5',
              col.tone === 'done' && 'border-[color:var(--primary)]/30 shadow-[0_0_36px_-20px_var(--primary)]',
              col.tone === 'progress' && 'border-[color:var(--accent)]/35 shadow-[0_0_36px_-18px_var(--accent)]',
              col.tone === 'next' && 'border-white/15',
              col.tone === 'planned' && 'border-white/10',
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              {String(idx + 1).padStart(2, '0')} · {col.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {(col.items.length ? col.items : editMode ? [{ text: 'Item' }] : []).map((item, i) => (
                <li key={i} className="text-sm leading-5 text-[color:var(--muted)]">
                  {String(item.text || item.title || '')}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatMetric(value: unknown, suffix = ''): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') return `${value.toLocaleString('en-US')}${suffix}`
  return `${value}${suffix}`
}

function GithubPulseRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const pulse = sitePulse as {
    version?: string
    metrics?: Record<string, number | null>
    github?: {
      url?: string
      latest_tag?: string
      latest_commit_date?: string
      commits?: Array<{ hash: string; date: string; subject: string }>
    }
  }
  const metrics = pulse.metrics || {}
  const commits = pulse.github?.commits || []
  const cards = useMemo(() => ([
    { label: 'Files', value: formatMetric(metrics.files) },
    { label: 'PHP classes', value: formatMetric(metrics.php_classes) },
    { label: 'Builder widgets', value: formatMetric(metrics.builder_widgets) },
    { label: 'Core API routes', value: formatMetric(metrics.rest_routes_core) },
    { label: 'SDK interfaces', value: formatMetric(metrics.sdk_interfaces) },
    { label: 'Git commits', value: formatMetric(metrics.git_commits) },
    { label: 'Core modules', value: formatMetric(metrics.core_modules) },
    { label: 'Package scaffolds', value: formatMetric(metrics.package_scaffolds) },
  ]), [metrics])

  const repoUrl = String(settings.repo_href || pulse.github?.url || 'https://github.com/iia3uk/jasefly')

  return (
    <div style={styles} className="fw-pulse w-full">
      {(settings.title || editMode) ? (
        <EditableText
          field="title"
          label="Title"
          value={String(settings.title || '')}
          as="h2"
          className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-[color:var(--text)] md:text-3xl"
          placeholder="Live project pulse"
        />
      ) : null}
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Subtitle"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mb-8 max-w-2xl text-sm leading-6 text-[color:var(--muted)]"
          placeholder="Generated at build time"
        />
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded-md border border-[color:var(--primary)]/30 bg-[color:var(--primary)]/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--primary)]">
          {pulse.github?.latest_tag || pulse.version || 'dev'}
        </span>
        {pulse.github?.latest_commit_date ? (
          <span className="text-xs text-[color:var(--muted)]">Updated {pulse.github.latest_commit_date}</span>
        ) : null}
        {metrics.repo_size_mb != null ? (
          <span className="text-xs text-[color:var(--muted)]">Repo ~{metrics.repo_size_mb} MB</span>
        ) : null}
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex min-h-10 items-center rounded-[var(--radius)] bg-[color:var(--primary)] px-4 text-sm font-semibold text-[color:var(--background)] transition-opacity hover:opacity-90"
        >
          Open GitHub
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--radius)] border border-white/10 bg-[color:var(--surface)]/60 p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[color:var(--primary)]/30 hover:shadow-[0_0_36px_-18px_var(--primary)]"
          >
            <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-[color:var(--text)]">{card.value}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">{card.label}</p>
          </div>
        ))}
      </div>

      {commits.length ? (
        <div className="mt-8 overflow-hidden rounded-[var(--radius)] border border-white/10 bg-[#0c0c14]">
          <div className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
            Recent commits
          </div>
          <ul className="divide-y divide-white/5">
            {commits.map((c) => (
              <li key={c.hash} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <code className="text-[color:var(--accent)]">{c.hash}</code>
                <span className="text-[color:var(--text)]">{c.subject}</span>
                <span className="ml-auto text-xs text-[color:var(--muted)]">{c.date}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

const DEFAULT_EXPLORE = [
  {
    icon: 'layout',
    title: 'Builder',
    body: 'Isolated Demo Sandbox — edit layouts without touching production.',
    href: '/demo?to=builder',
    cta: 'Open Builder Demo →',
    status: 'live',
  },
  {
    icon: 'settings',
    title: 'Admin',
    body: 'Same Demo Sandbox shell — dashboard, pages, media. No production data.',
    href: '/demo?to=admin',
    cta: 'Open Admin Demo →',
    status: 'live',
  },
  {
    icon: 'book-open',
    title: 'Documentation',
    body: 'Project docs on this site — install, architecture, modules, MCP.',
    href: '/docs',
    cta: 'Open live →',
    status: 'live',
  },
  {
    icon: 'code',
    title: 'Platform SDK',
    body: 'REST surfaces and PlatformContext entry points — not a brochure.',
    href: '/api-docs',
    cta: 'Open live →',
    status: 'live',
  },
  {
    icon: 'layers',
    title: 'Architecture',
    body: 'The same layer diagram used to explain Jasefly internally.',
    href: '/workflow',
    cta: 'Open live →',
    status: 'live',
  },
  {
    icon: 'github',
    title: 'Repository',
    body: 'Source of truth. Clone it.',
    href: 'https://github.com/iia3uk/jasefly',
    cta: 'Open GitHub →',
    status: 'live',
  },
  {
    icon: 'globe',
    title: 'Production Site',
    body: 'iia3uk.ru — the only production installation of this platform today.',
    href: 'https://iia3uk.ru',
    cta: 'Open live →',
    status: 'live',
  },
]

function isComingSoon(status: unknown): boolean {
  const s = String(status || '').toLowerCase().replace(/\s+/g, '_')
  return s === 'coming_soon' || s === 'coming' || s === 'later' || s === 'unavailable'
}

/** Split legacy `/demo` doors: Admin → dashboard, Builder → page builder. */
function resolveDemoDoor(item: Row): { href: string; cta: string } {
  const title = String(item.title || '').trim().toLowerCase()
  let href = String(item.href || '').trim()
  let cta = String(item.cta || item.cta_label || 'Open live →')
  const pathOnly = href.split('?')[0] || ''
  if (pathOnly === '/demo') {
    if (title === 'admin') {
      href = '/demo?to=admin'
      if (/admin demo/i.test(cta) || cta === 'Open live →') cta = 'Open Admin Demo →'
    } else if (title === 'builder') {
      href = '/demo?to=builder'
      if (/admin demo/i.test(cta) || cta === 'Open live →') cta = 'Open Builder Demo →'
    }
  }
  return { href, cta }
}

function ExploreDoorsRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const items = asRows(settings.items)
  const list: Row[] = items.length ? items : (DEFAULT_EXPLORE as Row[])

  return (
    <div style={styles} className="fw-explore w-full">
      {(settings.kicker || editMode) ? (
        <EditableText
          field="kicker"
          label="Kicker"
          value={String(settings.kicker || '')}
          as="p"
          className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--primary)]"
          placeholder="Don't look at screenshots."
        />
      ) : null}
      {(settings.title || editMode) ? (
        <EditableText
          field="title"
          label="Title"
          value={String(settings.title || '')}
          as="h2"
          className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-[color:var(--text)] md:text-3xl"
          placeholder="Open the real thing"
        />
      ) : null}
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Subtitle"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mb-8 max-w-2xl text-sm leading-6 text-[color:var(--muted)]"
          placeholder="Links go to live surfaces — or an honest status."
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((item, i) => {
          const door = resolveDemoDoor(item)
          const href = door.href
          const soon = isComingSoon(item.status) || !href
          const cta = soon ? String(item.cta || item.cta_label || 'Coming later') : door.cta
          const title = String(item.title || 'Door')
          const body = String(item.body || item.text || '')
          const icon = String(item.icon || '')
          const external = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')
          const cardClass = clsx(
            'fw-explore-card group relative flex min-h-[11.5rem] flex-col overflow-hidden rounded-[var(--radius)] border border-white/[0.1] bg-white/[0.025] p-5 transition duration-300 sm:p-6',
            !soon && 'hover:-translate-y-0.5 hover:border-[color:var(--primary)]/40 hover:bg-white/[0.04] hover:shadow-[0_18px_48px_-28px_var(--primary)]',
            soon && 'opacity-90',
          )
          const inner = (
            <>
              <div className="flex items-start justify-between gap-3">
                {icon ? (
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[color:var(--text)] transition group-hover:border-[color:var(--primary)]/35 group-hover:shadow-[0_0_28px_-12px_var(--primary)]">
                    <AppIcon name={icon} size={18} />
                  </span>
                ) : <span />}
                <span
                  className={clsx(
                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    soon
                      ? 'border-white/15 text-[color:var(--muted)]'
                      : 'border-[color:var(--primary)]/35 bg-[color:var(--primary)]/10 text-[color:var(--primary)]',
                  )}
                >
                  {soon ? 'Coming later' : 'Live'}
                </span>
              </div>
              <h3 className="mt-4 font-[family-name:var(--font-heading)] text-lg font-semibold tracking-tight text-[color:var(--text)]">
                {title}
              </h3>
              {body ? <p className="mt-2 flex-1 text-sm leading-6 text-[color:var(--muted)]">{body}</p> : <div className="flex-1" />}
              <p
                className={clsx(
                  'mt-4 text-sm font-medium',
                  soon ? 'text-[color:var(--muted)]' : 'text-[color:var(--primary)] transition group-hover:translate-x-0.5',
                )}
              >
                {cta}
              </p>
            </>
          )

          if (editMode || soon) {
            return (
              <div key={i} className={cardClass} aria-disabled={soon || undefined}>
                {inner}
              </div>
            )
          }

          if (external) {
            return (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={cardClass}>
                {inner}
              </a>
            )
          }

          return (
            <Link key={i} to={href} className={cardClass}>
              {inner}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function registerFrameworkPulseWidgets() {
  registerWidget({
    type: 'explore-doors',
    label: 'Explore doors',
    category: 'landing',
    defaultSettings: {
      kicker: "Don't look at screenshots.",
      title: 'Open the real thing',
      subtitle: 'Every door leads to a live surface of this framework — or an honest status when that surface is not public yet.',
      items: DEFAULT_EXPLORE,
    },
    settingsFields: fields(
      { key: 'kicker', label: 'Kicker', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      {
        key: 'items',
        label: 'Doors',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Door"
            blank={() => ({ icon: '', title: '', body: '', href: '', cta: 'Open live →', status: 'live' })}
            fields={[
              { key: 'icon', label: 'Icon', kind: 'text' },
              { key: 'title', label: 'Title', kind: 'text' },
              { key: 'body', label: 'Body', kind: 'textarea' },
              { key: 'href', label: 'URL', kind: 'url' },
              { key: 'cta', label: 'CTA', kind: 'text' },
              { key: 'status', label: 'Status (live / coming_soon)', kind: 'text' },
            ]}
          />
        ),
      },
    ),
    Render: ExploreDoorsRender,
  })

  registerWidget({
    type: 'dev-journey',
    label: 'Developer journey',
    category: 'landing',
    defaultSettings: {
      title: 'Developer journey',
      subtitle: 'From idea to the next feature — on one platform.',
      items: DEFAULT_JOURNEY,
    },
    settingsFields: fields(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      {
        key: 'items',
        label: 'Steps',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Step"
            blank={() => ({ title: '', text: '' })}
            fields={[
              { key: 'title', label: 'Title', kind: 'text' },
              { key: 'text', label: 'Text', kind: 'text' },
            ]}
          />
        ),
      },
    ),
    Render: DevJourneyRender,
  })

  registerWidget({
    type: 'repo-tree',
    label: 'Repo tree',
    category: 'landing',
    defaultSettings: {
      title: 'Real project structure',
      subtitle: 'What you see when you open the repository.',
      repo_href: 'https://github.com/iia3uk/jasefly',
      tree: `jasefly/
├── backend/          PHP core · Platform SDK · modules
├── frontend/         React admin · public · builder
├── modules-src/      ZIP package sources
├── content/          Content packs
├── docs/             Engineer documentation
└── mcp-cms/          MCP server for agents`,
    },
    settingsFields: fields(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'repo_href', label: 'GitHub URL', type: 'url' },
      { key: 'tree', label: 'Tree', type: 'textarea' },
    ),
    Render: RepoTreeRender,
  })

  registerWidget({
    type: 'status-timeline',
    label: 'Status timeline',
    category: 'landing',
    defaultSettings: {
      title: 'Roadmap',
      subtitle: 'Direction of travel — not promises.',
      completed_title: 'Completed',
      current_title: 'Current',
      next_title: 'Next',
      future_title: 'Future',
      completed: [{ text: 'Platform SDK' }, { text: 'ZIP runtime + quarantine' }],
      current: [{ text: 'Package Manager UX' }, { text: 'SDK certification' }],
      next: [{ text: 'Onboarding polish' }],
      future: [{ text: 'Module marketplace' }],
    },
    settingsFields: fields(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'completed_title', label: 'Completed title', type: 'text' },
      { key: 'current_title', label: 'Current title', type: 'text' },
      { key: 'next_title', label: 'Next title', type: 'text' },
      { key: 'future_title', label: 'Future title', type: 'text' },
      {
        key: 'completed',
        label: 'Completed',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor value={value} onChange={onChange} addLabel="Item" blank={() => ({ text: '' })} fields={[{ key: 'text', label: 'Text', kind: 'text' }]} />
        ),
      },
      {
        key: 'current',
        label: 'Current',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor value={value} onChange={onChange} addLabel="Item" blank={() => ({ text: '' })} fields={[{ key: 'text', label: 'Text', kind: 'text' }]} />
        ),
      },
      {
        key: 'next',
        label: 'Next',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor value={value} onChange={onChange} addLabel="Item" blank={() => ({ text: '' })} fields={[{ key: 'text', label: 'Text', kind: 'text' }]} />
        ),
      },
      {
        key: 'future',
        label: 'Future',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor value={value} onChange={onChange} addLabel="Item" blank={() => ({ text: '' })} fields={[{ key: 'text', label: 'Text', kind: 'text' }]} />
        ),
      },
    ),
    Render: StatusTimelineRender,
  })

  registerWidget({
    type: 'github-pulse',
    label: 'GitHub pulse',
    category: 'landing',
    defaultSettings: {
      title: 'Project pulse',
      subtitle: 'Metrics and commits generated at build time from this repository.',
      repo_href: 'https://github.com/iia3uk/jasefly',
    },
    settingsFields: fields(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'repo_href', label: 'GitHub URL', type: 'url' },
    ),
    Render: GithubPulseRender,
  })
}
