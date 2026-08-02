/**
 * Marketing / DX widgets for the official framework site.
 * architecture-stack · code-snippet · code-tabs · status-roadmap
 */
import { useState } from 'react'
import clsx from 'clsx'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { EditableText } from '@/builder/edit/Editable'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import { AppIcon } from '@/shared/icons'

function fields(...items: SettingsField[]) {
  return items
}

type Row = Record<string, unknown>

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return []
  return value.filter((x) => x && typeof x === 'object') as Row[]
}

const DEFAULT_LAYERS = [
  { label: 'Browser', hint: 'Visitor · admin · agent tooling' },
  { label: 'React', hint: 'Public site · Admin SPA · Builder' },
  { label: 'REST', hint: '/api/v1' },
  { label: 'Platform SDK', hint: 'Stable contracts for packages' },
  { label: 'Access Layer', hint: 'Content rules · admin capabilities' },
  { label: 'ZIP Runtime', hint: 'Install · update · quarantine' },
  { label: 'PHP Core', hint: 'Router · modules · services' },
  { label: 'MySQL', hint: 'Schema · migrations' },
  { label: 'Shared Hosting', hint: 'Apache · PHP · no Node on server' },
]

function ArchitectureStackRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const layers = asRows(settings.layers)
  const list: Row[] = layers.length ? layers : (DEFAULT_LAYERS as Row[])
  const [active, setActive] = useState<number | null>(null)

  return (
    <div style={styles} className="fw-arch mx-auto w-full max-w-2xl">
      {(settings.title || editMode) ? (
        <EditableText
          field="title"
          label="Title"
          value={String(settings.title || '')}
          as="h2"
          className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-[color:var(--text)] md:text-3xl"
          placeholder="Platform architecture"
        />
      ) : null}
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Subtitle"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mb-10 max-w-xl text-sm leading-6 text-[color:var(--muted)] md:text-base"
          placeholder="How the stack fits together"
        />
      ) : null}
      <ol className="fw-arch-stack relative flex list-none flex-col gap-0 p-0">
        {list.map((layer, i) => {
          const label = String(layer.label ?? layer.title ?? '')
          const hint = String(layer.hint ?? layer.body ?? '')
          const last = i === list.length - 1
          const lit = active === i || active === i - 1
          const isFocus = active === i
          return (
            <li
              key={i}
              className="fw-arch-item relative"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <div
                className={clsx(
                  'fw-arch-card relative z-[1] flex items-center gap-4 rounded-[var(--radius)] border bg-[color:var(--surface)]/80 px-4 py-4 backdrop-blur-sm transition duration-300',
                  isFocus
                    && 'border-[color:var(--primary)]/55 shadow-[0_0_48px_-12px_var(--primary)] -translate-y-0.5',
                  !isFocus && lit
                    && 'border-[color:var(--accent)]/45 shadow-[0_0_40px_-14px_var(--accent)]',
                  !lit && 'border-white/10 shadow-[0_0_40px_-18px_var(--primary)]',
                )}
              >
                <span
                  className={clsx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold transition-colors',
                    isFocus || lit
                      ? 'border-[color:var(--primary)]/40 bg-[color:var(--primary)]/15 text-[color:var(--primary)]'
                      : 'border-white/10 bg-black/30 text-[color:var(--primary)]',
                  )}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[color:var(--text)]">{label}</p>
                  {hint ? <p className="mt-0.5 text-xs text-[color:var(--muted)]">{hint}</p> : null}
                </div>
              </div>
              {!last ? (
                <div
                  className={clsx(
                    'fw-arch-connector mx-auto flex h-7 w-px items-center justify-center transition-all duration-300',
                    lit
                      ? 'bg-gradient-to-b from-[color:var(--primary)] to-[color:var(--accent)] shadow-[0_0_12px_var(--primary)]'
                      : 'bg-gradient-to-b from-[color:var(--primary)]/40 to-[color:var(--accent)]/20',
                  )}
                  aria-hidden
                >
                  <span className="sr-only">↓</span>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function CodeSnippetRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const lang = String(settings.language || 'php')
  const code = String(settings.code || '')
  const title = String(settings.title || '')

  return (
    <div style={styles} className="fw-code w-full overflow-hidden rounded-[var(--radius)] border border-white/10 bg-[#0c0c14] shadow-[0_0_48px_-20px_var(--primary)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0">
          {(title || editMode) ? (
            <EditableText
              field="title"
              label="Title"
              value={title}
              as="p"
              className="truncate text-sm font-medium text-[color:var(--text)]"
              placeholder="Snippet title"
            />
          ) : (
            <p className="text-sm font-medium text-[color:var(--muted)]">code</p>
          )}
        </div>
        <span className="shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--accent)]">
          {lang}
        </span>
      </div>
      {editMode ? (
        <EditableText
          field="code"
          label="Code"
          value={code}
          as="pre"
          multiline
          className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-zinc-200 whitespace-pre-wrap"
          placeholder="// real Platform SDK API"
        />
      ) : (
        <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-zinc-200">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}

const DEFAULT_TABS: Row[] = [
  {
    label: 'PHP',
    language: 'php',
    title: 'bootPlatform',
    code: `public function bootPlatform(PlatformContext $ctx): void
{
    $ctx->access()->registerCapability([
        'slug' => 'demo-kit.view',
        'label' => 'Demo Kit',
        'group' => 'modules',
        'risk' => 'low',
        'default_roles' => ['admin', 'editor'],
    ]);

    $ctx->events()->publish('demo.ready', ['slug' => $slug]);
    $ctx->builder()->registerBlockMeta('demo-hero', [
        'label' => 'Demo Hero',
        'category' => 'content',
    ]);
}`,
  },
  {
    label: 'TypeScript',
    language: 'ts',
    title: 'register()',
    code: `export function register(ctx: PlatformFrontendContext) {
  ctx.admin.registerPage({ path: 'demo', element: DemoPage })
  ctx.admin.registerNavItem({
    group: 'Content',
    path: 'demo',
    label: 'Demo',
  })
  ctx.builder.registerWidget({
    type: 'demo-block',
    label: 'Demo',
    Render: DemoWidget,
  })
}`,
  },
  {
    label: 'HTTP',
    language: 'http',
    title: 'Access + auth',
    code: `GET  /api/v1/access/providers
POST /api/v1/access/can
GET  /api/v1/auth/me
GET  /api/v1/docs`,
  },
  {
    label: 'CLI',
    language: 'bash',
    title: 'SDK tooling',
    code: `php backend/bin/sdk.php list-public-services
php backend/bin/sdk.php list-capabilities
php backend/bin/sdk.php certify path/to/package
php backend/bin/sdk.php sdk-report`,
  },
]

function CodeTabsRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const tabs = asRows(settings.tabs)
  const list = tabs.length ? tabs : DEFAULT_TABS
  const [index, setIndex] = useState(0)
  const safeIndex = Math.min(index, list.length - 1)
  const current = list[safeIndex] || list[0]
  const lang = String(current?.language || 'php')
  const code = String(current?.code || '')
  const title = String(current?.title || '')

  return (
    <div style={styles} className="fw-code-tabs w-full">
      {(settings.title || editMode) ? (
        <EditableText
          field="title"
          label="Title"
          value={String(settings.title || '')}
          as="h2"
          className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-[color:var(--text)] md:text-3xl"
          placeholder="Developer experience"
        />
      ) : null}
      {(settings.subtitle || editMode) ? (
        <EditableText
          field="subtitle"
          label="Subtitle"
          value={String(settings.subtitle || '')}
          as="p"
          multiline
          className="mb-6 max-w-2xl text-sm leading-6 text-[color:var(--muted)] md:text-base"
          placeholder="Real Platform SDK surfaces"
        />
      ) : null}
      <div className="fw-code overflow-hidden rounded-[var(--radius)] border border-white/10 bg-[#0c0c14] shadow-[0_0_48px_-20px_var(--primary)]">
        <div className="flex flex-wrap items-center gap-1 border-b border-white/10 p-2">
          {list.map((tab, i) => {
            const label = String(tab.label || tab.language || `Tab ${i + 1}`)
            const on = i === safeIndex
            return (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition',
                  on
                    ? 'bg-[color:var(--primary)]/20 text-[color:var(--primary)]'
                    : 'text-[color:var(--muted)] hover:bg-white/5 hover:text-[color:var(--text)]',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
          <p className="truncate text-sm font-medium text-[color:var(--text)]">{title || 'API'}</p>
          <span className="shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--accent)]">
            {lang}
          </span>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-zinc-200">
          <code>{code}</code>
        </pre>
      </div>
      {editMode ? (
        <p className="mt-3 text-xs text-[color:var(--muted)]">
          Tabs are edited in the inspector (tabs → label / language / title / code). Preview switches above.
        </p>
      ) : null}
    </div>
  )
}

function StatusRoadmapRender({
  settings,
  editMode,
}: {
  settings: Record<string, unknown>
  editMode?: boolean
}) {
  const styles = stylesToCss(readStyles(settings))
  const columns = [
    { key: 'done', title: String(settings.done_title || 'Done'), tone: 'done' as const, items: asRows(settings.done) },
    { key: 'progress', title: String(settings.progress_title || 'In Progress'), tone: 'progress' as const, items: asRows(settings.progress) },
    { key: 'planned', title: String(settings.planned_title || 'Exploring'), tone: 'planned' as const, items: asRows(settings.planned) },
  ]

  return (
    <div style={styles} className="fw-roadmap w-full">
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
          className="mb-8 max-w-2xl text-sm leading-6 text-[color:var(--muted)] md:text-base"
          placeholder="Current status — no hype"
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((col) => (
          <div
            key={col.key}
            className={clsx(
              'fw-roadmap-col rounded-[var(--radius)] border bg-[color:var(--surface)]/60 p-5 transition duration-300 hover:-translate-y-0.5',
              col.tone === 'done' && 'border-[color:var(--primary)]/30 shadow-[0_0_40px_-22px_var(--primary)]',
              col.tone === 'progress' && 'border-[color:var(--accent)]/30 shadow-[0_0_40px_-22px_var(--accent)]',
              col.tone === 'planned' && 'border-white/10',
            )}
          >
            <div className="mb-4 flex items-center gap-2">
              <AppIcon
                name={col.tone === 'done' ? 'check' : col.tone === 'progress' ? 'zap' : 'layers'}
                className="h-4 w-4 text-[color:var(--primary)]"
              />
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--text)]">{col.title}</h3>
            </div>
            <ul className="space-y-2.5">
              {(col.items.length ? col.items : editMode ? [{ text: 'Item' }] : []).map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-5 text-[color:var(--muted)]">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[color:var(--primary)]/70" />
                  <span>{String(item.text || item.title || item.label || '')}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export function registerFrameworkWidgets() {
  registerWidget({
    type: 'architecture-stack',
    label: 'Architecture stack',
    category: 'landing',
    defaultSettings: {
      title: 'Platform architecture',
      subtitle: 'Request path — hover a layer to light the next hop.',
      layers: DEFAULT_LAYERS,
    },
    settingsFields: fields(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      {
        key: 'layers',
        label: 'Layers (top → bottom)',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Layer"
            blank={() => ({ label: '', hint: '' })}
            fields={[
              { key: 'label', label: 'Label', kind: 'text' },
              { key: 'hint', label: 'Hint', kind: 'text' },
            ]}
          />
        ),
      },
    ),
    Render: ArchitectureStackRender,
  })

  registerWidget({
    type: 'code-snippet',
    label: 'Code snippet',
    category: 'landing',
    defaultSettings: {
      title: 'PlatformContext',
      language: 'php',
      code: `public function bootPlatform(PlatformContext $ctx): void
{
    $ctx->access()->registerCapability([
        'slug' => 'demo-kit.view',
        'label' => 'Demo Kit',
        'group' => 'modules',
        'risk' => 'low',
        'default_roles' => ['admin', 'editor'],
    ]);
}`,
    },
    settingsFields: fields(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'language', label: 'Language label', type: 'text' },
      { key: 'code', label: 'Code', type: 'textarea' },
    ),
    Render: CodeSnippetRender,
  })

  registerWidget({
    type: 'code-tabs',
    label: 'Code tabs (DX)',
    category: 'landing',
    defaultSettings: {
      title: 'Developer experience',
      subtitle: 'Real Platform SDK surfaces — PHP, TypeScript, HTTP, CLI.',
      tabs: DEFAULT_TABS,
    },
    settingsFields: fields(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      {
        key: 'tabs',
        label: 'Tabs',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Tab"
            blank={() => ({ label: '', language: 'php', title: '', code: '' })}
            fields={[
              { key: 'label', label: 'Tab label', kind: 'text' },
              { key: 'language', label: 'Language', kind: 'text' },
              { key: 'title', label: 'Snippet title', kind: 'text' },
              { key: 'code', label: 'Code', kind: 'textarea' },
            ]}
          />
        ),
      },
    ),
    Render: CodeTabsRender,
  })

  registerWidget({
    type: 'status-roadmap',
    label: 'Status roadmap',
    category: 'landing',
    defaultSettings: {
      title: 'Roadmap',
      subtitle: 'What ships today — and what we are exploring next. No vapourware promises.',
      done_title: 'Done',
      progress_title: 'In Progress',
      planned_title: 'Exploring',
      done: [
        { text: 'Platform SDK (v1/v2) + PlatformContext' },
        { text: 'ZIP module install / update / quarantine' },
        { text: 'Universal Access Layer + admin ACL' },
        { text: 'Visual Page Builder' },
        { text: 'MCP server for controlled AI ops' },
        { text: 'Safe SiteUpdater + shared-hosting packages' },
      ],
      progress: [
        { text: 'Module Package Manager UX hardening' },
        { text: 'SDK certification & contract governance' },
        { text: 'Docs and developer onboarding polish' },
      ],
      planned: [
        { text: 'Module marketplace' },
        { text: 'AI Builder assistant' },
        { text: 'Visual workflow automation' },
      ],
    },
    settingsFields: fields(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'done_title', label: 'Done column title', type: 'text' },
      { key: 'progress_title', label: 'In Progress title', type: 'text' },
      { key: 'planned_title', label: 'Exploring title', type: 'text' },
      {
        key: 'done',
        label: 'Done items',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Item"
            blank={() => ({ text: '' })}
            fields={[{ key: 'text', label: 'Text', kind: 'text' }]}
          />
        ),
      },
      {
        key: 'progress',
        label: 'In Progress items',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Item"
            blank={() => ({ text: '' })}
            fields={[{ key: 'text', label: 'Text', kind: 'text' }]}
          />
        ),
      },
      {
        key: 'planned',
        label: 'Exploring items',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Item"
            blank={() => ({ text: '' })}
            fields={[{ key: 'text', label: 'Text', kind: 'text' }]}
          />
        ),
      },
    ),
    Render: StatusRoadmapRender,
  })
}
