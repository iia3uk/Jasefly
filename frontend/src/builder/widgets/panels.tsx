/**
 * Interactive mock UI panels for marketing landings (replaces static screenshots).
 */
import { useState } from 'react'
import clsx from 'clsx'
import {
  Box, Check, CloudUpload, Database, FileMinus2, KeyRound, Megaphone,
  Network, Package, Puzzle, Settings2, ShieldCheck, ShoppingBag, FileText,
} from 'lucide-react'
import { registerWidget } from '@/builder/registry'
import type { SettingsField } from '@/builder/types'
import { ItemsEditor } from '@/builder/edit/ItemsEditor'
import { EditableText } from '@/builder/edit/Editable'
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

const LUCIDE: Record<string, typeof Settings2> = {
  settings: Settings2,
  file: FileText,
  shop: ShoppingBag,
  puzzle: Puzzle,
  network: Network,
  megaphone: Megaphone,
  package: Package,
  box: Box,
  'file-minus': FileMinus2,
  upload: CloudUpload,
  shield: ShieldCheck,
  check: Check,
  database: Database,
  key: KeyRound,
}

function PanelIcon({ name, className }: { name: string; className?: string }) {
  const Lucide = LUCIDE[name]
  if (Lucide) return <Lucide className={className} strokeWidth={1.6} />
  return <AppIcon name={name} className={className} size={28} />
}

const DEFAULT_MODULES: Row[] = [
  { label: 'Система', icon: 'settings', on: true, text: 'Ядро, роли, настройки сайта' },
  { label: 'Контент', icon: 'file', on: true, text: 'Страницы, билдер, медиа' },
  { label: 'Блог', icon: 'megaphone', on: true, text: 'Посты и лента на сайте' },
  { label: 'Магазин', icon: 'shop', on: false, text: 'Каталог и витрина' },
  { label: 'Платежи', icon: 'package', on: false, text: 'Оплата и заказы' },
  { label: 'MCP / AI', icon: 'network', on: true, text: 'Инструменты для агентов' },
  { label: 'Переводчик', icon: 'puzzle', on: true, text: 'Мультиязычность страниц' },
  { label: 'Поддержка', icon: 'shield', on: true, text: 'Чат и FAQ на сайте' },
  { label: 'Lab', icon: 'box', on: false, text: 'Эксперименты и превью' },
]

function ModuleTogglesRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  const fromSettings = asRows(settings.items)
  const items = fromSettings.length ? fromSettings : DEFAULT_MODULES
  const [local, setLocal] = useState<Record<number, boolean>>({})
  const cols = Math.min(3, Math.max(2, Number(settings.columns) || 3))
  const onCount = items.filter((item, i) => local[i] ?? (item.on !== false && item.enabled !== false)).length

  return (
    <div style={styles} className="overflow-hidden rounded-2xl border border-white/10 bg-[#07080f]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">Plugin rack</p>
          <p className="mt-0.5 text-sm text-[color:var(--text)]">Вкл. {onCount} из {items.length}</p>
        </div>
        <span className="rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-1 text-[11px] font-medium text-[color:var(--accent)]">
          Без переписывания ядра
        </span>
      </div>
      <div className={clsx('grid gap-px bg-white/[0.06]', cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
        {items.map((item, i) => {
          const on = local[i] ?? (item.on !== false && item.enabled !== false)
          const Icon = String(item.icon || 'settings')
          const desc = String(item.text || item.body || item.description || '')
          return (
            <button
              key={i}
              type="button"
              role="switch"
              aria-checked={on}
              disabled={editMode}
              title={editMode ? 'В превью на сайте переключается' : undefined}
              onClick={() => setLocal((prev) => ({ ...prev, [i]: !on }))}
              className={clsx(
                'flex items-start gap-3 bg-[#0a0b12] p-4 text-left transition sm:p-5',
                on ? 'bg-gradient-to-br from-[color:var(--primary)]/[0.12] to-transparent' : 'hover:bg-white/[0.03]',
                editMode && 'cursor-default',
              )}
            >
              <span
                className={clsx(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                  on
                    ? 'border-[color:var(--primary)]/40 bg-gradient-to-br from-[color:var(--primary)] to-[color:var(--accent)] text-white shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_25%,transparent)]'
                    : 'border-white/10 bg-white/[0.04] text-[color:var(--muted)]',
                )}
              >
                <PanelIcon name={Icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[color:var(--text)]">
                    {String(item.label || item.title || 'Модуль')}
                  </span>
                  <span
                    className={clsx(
                      'relative h-6 w-11 shrink-0 rounded-full p-0.5 transition',
                      on ? 'bg-[color:var(--primary)]' : 'bg-white/15',
                    )}
                  >
                    <span className={clsx('block h-5 w-5 rounded-full bg-white shadow transition', on ? 'translate-x-5' : 'translate-x-0')} />
                  </span>
                </span>
                {desc ? (
                  <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{desc}</span>
                ) : null}
                <span className={clsx('mt-2 inline-block text-[10px] font-medium uppercase tracking-wide', on ? 'text-[color:var(--accent)]' : 'text-[color:var(--muted)]')}>
                  {on ? 'Active' : 'Off'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {(settings.caption || editMode) ? (
        <EditableText
          field="caption"
          label="Подпись"
          value={String(settings.caption || '')}
          as="p"
          className="border-t border-white/10 px-4 py-3 text-center text-sm text-[color:var(--muted)]"
          placeholder="Подпись"
        />
      ) : null}
    </div>
  )
}

function PipelinePanelRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  const steps = asRows(settings.steps)
  const list = steps.length
    ? steps
    : [
        { label: 'Сборка', icon: 'box' },
        { label: 'Пакет', icon: 'file-minus' },
        { label: 'Загрузка', icon: 'upload' },
        { label: 'Проверка', icon: 'shield' },
        { label: 'Готово', icon: 'check' },
      ]
  const initial = Math.min(list.length - 1, Math.max(0, Number(settings.active_index ?? 2)))
  const [active, setActive] = useState(initial)

  return (
    <div style={styles} className="min-w-0 rounded-2xl border border-white/10 bg-[#07080f] p-4 sm:p-8">
      <div className="-mx-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative mx-auto flex min-w-[22rem] max-w-3xl items-start justify-between gap-2 px-1 sm:min-w-0">
          <div className="pointer-events-none absolute left-[8%] right-[8%] top-6 h-px bg-gradient-to-r from-[color:var(--primary)]/25 via-[color:var(--accent)]/50 to-[color:var(--primary)]/25 sm:top-7" />
          {list.map((step, i) => {
            const on = i === active
            return (
              <button
                key={i}
                type="button"
                disabled={editMode}
                onClick={() => setActive(i)}
                className="relative z-[1] flex min-w-0 flex-1 flex-col items-center gap-2 sm:gap-3"
              >
                <span
                  className={clsx(
                    'flex h-11 w-11 items-center justify-center rounded-full border transition sm:h-14 sm:w-14',
                    on
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)] shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_35%,transparent)]'
                      : 'border-[color:var(--primary)]/35 bg-[color:var(--primary)]/10 text-[color:var(--primary)]',
                  )}
                >
                  <PanelIcon name={String(step.icon || 'box')} className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <span
                  className={clsx(
                    'max-w-full truncate rounded-full border px-2 py-1 text-[10px] font-medium sm:px-3 sm:text-xs',
                    on
                      ? 'border-[color:var(--accent)]/50 bg-[color:var(--accent)]/15 text-[color:var(--accent)]'
                      : 'border-white/10 bg-white/[0.04] text-[color:var(--muted)]',
                  )}
                >
                  {String(step.label || `Шаг ${i + 1}`)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-6 min-h-[7rem] rounded-xl border border-white/10 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.04)_1px,transparent_0)] bg-[length:18px_18px] p-4 sm:mt-8 sm:p-5">
        <p className="text-sm font-medium text-[color:var(--text)]">{String(list[active]?.label || '')}</p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
          {String(list[active]?.text || settings.panel_text || 'Этап обновления в админке — без ручной замены файлов на хостинге.')}
        </p>
      </div>
      {(settings.caption || editMode) ? (
        <EditableText
          field="caption"
          label="Подпись"
          value={String(settings.caption || '')}
          as="p"
          className="mt-4 text-center text-sm text-[color:var(--muted)]"
          placeholder="Подпись"
        />
      ) : null}
    </div>
  )
}

function McpInspectorRender({ settings, editMode }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const styles = stylesToCss(readStyles(settings))
  const tools = asRows(settings.tools)
  const ops = asRows(settings.operations)
  const rights = asRows(settings.rights)
  const toolList = tools.length
    ? tools
    : [{ label: 'get_site_map' }, { label: 'get_page_digest' }, { label: 'update_content' }, { label: 'validate_update' }]
  const opList = ops.length
    ? ops
    : [
        { label: 'Чтение карты сайта', icon: 'box', status: 'OK' },
        { label: 'Digest страницы', icon: 'database', status: 'OK' },
        { label: 'Проверка обновления', icon: 'network', status: 'OK' },
      ]
  const rightList = rights.length
    ? rights
    : [
        { label: 'Права на контент', icon: 'shield' },
        { label: 'Токен агента', icon: 'key' },
      ]
  const [activeTool, setActiveTool] = useState(0)

  return (
    <div style={styles} className="overflow-hidden rounded-2xl border border-white/10 bg-[#080910]">
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-white/10 px-4 py-3">
        {toolList.map((t, i) => (
          <button
            key={i}
            type="button"
            disabled={editMode}
            onClick={() => setActiveTool(i)}
            className={clsx(
              'rounded-lg border px-3 py-1.5 font-mono text-[11px] transition',
              i === activeTool
                ? 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                : 'border-white/10 bg-white/[0.03] text-[color:var(--muted)] hover:text-[color:var(--text)]',
            )}
          >
            {String(t.label || t.name || 'tool')}
          </button>
        ))}
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(14rem,18rem)_1fr]">
        <aside className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Операции</p>
          <div className="space-y-2">
            {opList.map((op, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--primary)]/15 text-[color:var(--primary)]">
                  <PanelIcon name={String(op.icon || 'box')} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--muted)]">{String(op.label || '')}</span>
                {op.status ? (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">{String(op.status)}</span>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mb-3 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Права</p>
          <div className="space-y-2">
            {rightList.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--primary)]/15 text-[color:var(--primary)]">
                  <PanelIcon name={String(r.icon || 'shield')} className="h-4 w-4" />
                </span>
                <span className="h-2 min-w-0 flex-1 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </aside>
        <div className="p-4 sm:p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">Превью</p>
          <div className="flex min-h-[11rem] items-center justify-center rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/[0.03] p-6 text-center">
            <div>
              <p className="font-mono text-sm text-[color:var(--accent)]">{String(toolList[activeTool]?.label || 'tool')}</p>
              <p className="mt-2 max-w-sm text-sm text-[color:var(--muted)]">
                {String(settings.preview_text || 'Контролируемый доступ агента к структуре и контенту через MCP.')}
              </p>
            </div>
          </div>
        </div>
      </div>
      {(settings.caption || editMode) ? (
        <EditableText
          field="caption"
          label="Подпись"
          value={String(settings.caption || '')}
          as="p"
          className="border-t border-white/10 px-4 py-3 text-center text-sm text-[color:var(--muted)]"
          placeholder="Подпись"
        />
      ) : null}
    </div>
  )
}

export function registerPanelWidgets() {
  registerWidget({
    type: 'module-toggles',
    label: 'Модули · переключатели',
    category: 'landing',
    defaultSettings: {
      columns: 3,
      caption: 'Модули включаются по необходимости — без переписывания ядра',
      items: [
        { label: 'Система', icon: 'settings', on: true, text: 'Ядро, роли, настройки сайта' },
        { label: 'Контент', icon: 'file', on: true, text: 'Страницы, билдер, медиа' },
        { label: 'Блог', icon: 'megaphone', on: true, text: 'Посты и лента на сайте' },
        { label: 'Магазин', icon: 'shop', on: false, text: 'Каталог и витрина' },
        { label: 'Платежи', icon: 'package', on: false, text: 'Оплата и заказы' },
        { label: 'MCP / AI', icon: 'network', on: true, text: 'Инструменты для агентов' },
        { label: 'Переводчик', icon: 'puzzle', on: true, text: 'Мультиязычность страниц' },
        { label: 'Поддержка', icon: 'shield', on: true, text: 'Чат и FAQ на сайте' },
        { label: 'Lab', icon: 'box', on: false, text: 'Эксперименты и превью' },
      ],
    },
    settingsFields: fields(
      { key: 'columns', label: 'Колонки', type: 'number' },
      { key: 'caption', label: 'Подпись', type: 'text' },
      {
        key: 'items',
        label: 'Модули',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Модуль"
            blank={() => ({ label: '', icon: 'settings', on: true })}
            fields={[
              { key: 'label', label: 'Название', kind: 'text' },
              { key: 'text', label: 'Описание', kind: 'text' },
              { key: 'icon', label: 'Иконка', kind: 'text' },
              { key: 'on', label: 'Вкл', kind: 'toggle' },
            ]}
          />
        ),
      },
    ),
    Render: ModuleTogglesRender,
  })

  registerWidget({
    type: 'pipeline-panel',
    label: 'Update pipeline',
    category: 'landing',
    defaultSettings: {
      active_index: 2,
      caption: 'Update pipeline в админке',
      panel_text: 'Загрузка ZIP и проверки до применения миграций.',
      steps: [
        { label: 'Сборка', icon: 'box', text: 'Локальная сборка frontend и backend.' },
        { label: 'Пакет', icon: 'file-minus', text: 'Формирование update-ZIP.' },
        { label: 'Загрузка', icon: 'upload', text: 'Загрузка пакета через админку.' },
        { label: 'Проверка', icon: 'shield', text: 'Валидация пакета и окружения.' },
        { label: 'Готово', icon: 'check', text: 'Миграции применены, сайт в работе.' },
      ],
    },
    settingsFields: fields(
      { key: 'active_index', label: 'Активный шаг (0…)', type: 'number' },
      { key: 'caption', label: 'Подпись', type: 'text' },
      { key: 'panel_text', label: 'Текст панели по умолчанию', type: 'textarea' },
      {
        key: 'steps',
        label: 'Шаги',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Шаг"
            blank={() => ({ label: '', icon: 'box', text: '' })}
            fields={[
              { key: 'label', label: 'Название', kind: 'text' },
              { key: 'icon', label: 'Иконка', kind: 'text' },
              { key: 'text', label: 'Описание', kind: 'textarea' },
            ]}
          />
        ),
      },
    ),
    Render: PipelinePanelRender,
  })

  registerWidget({
    type: 'mcp-inspector',
    label: 'MCP Inspector',
    category: 'landing',
    defaultSettings: {
      caption: 'MCP Inspector · контролируемый доступ агента',
      preview_text: 'Контролируемый доступ агента к структуре и контенту через MCP.',
      tools: [
        { label: 'get_site_map' },
        { label: 'get_page_digest' },
        { label: 'update_content' },
        { label: 'validate_update' },
      ],
      operations: [
        { label: 'Чтение карты сайта', icon: 'box', status: 'OK' },
        { label: 'Digest страницы', icon: 'database', status: 'OK' },
        { label: 'Проверка обновления', icon: 'network', status: 'OK' },
      ],
      rights: [
        { label: 'Права на контент', icon: 'shield' },
        { label: 'Токен агента', icon: 'key' },
      ],
    },
    settingsFields: fields(
      { key: 'caption', label: 'Подпись', type: 'text' },
      { key: 'preview_text', label: 'Текст превью', type: 'textarea' },
      {
        key: 'tools',
        label: 'Tools',
        type: 'custom',
        component: ({ value, onChange }) => (
          <ItemsEditor
            value={value}
            onChange={onChange}
            addLabel="Tool"
            blank={() => ({ label: '' })}
            fields={[{ key: 'label', label: 'Имя', kind: 'text' }]}
          />
        ),
      },
    ),
    Render: McpInspectorRender,
  })
}
