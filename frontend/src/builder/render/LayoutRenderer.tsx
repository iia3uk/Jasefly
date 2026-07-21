import { useEffect, type CSSProperties } from 'react'
import type { PageLayout, BuilderElementDTO } from '@/types'
import { getWidget, widgetRequiredPlugin } from '@/builder/registry'
import { useSiteContext } from '@/context/SiteContext'
import { siteHasPlugin } from '@/core/pluginGates'
import { isPluginEnabled } from '@/core/moduleRegistry'
import { initBuilderWidgets } from '@/builder/widgets'
import { Container } from '@/components/ui'
import { BuilderEditProvider } from '@/builder/context/BuilderEditContext'
import { EditCanvasGuard } from '@/builder/edit/Editable'
import { readStyles, stylesToCss } from '@/builder/edit/StyleFields'
import { collectGoogleFontsFromLayout, ensureGoogleFontsLoaded } from '@/builder/lib/googleFonts'
import { isBuilderHidden } from '@/builder/tree'
import clsx from 'clsx'

initBuilderWidgets()

type Props = {
  layout: PageLayout | null | undefined
  editMode?: boolean
  selectedId?: string | null
  selectedPart?: string | null
  onSelect?: (id: string, opts?: { part?: string | null }) => void
  onSelectPart?: (part: string | null) => void
  onPatchSettings?: (id: string, patch: Record<string, unknown>) => void
  onDropWidget?: (parentId: string, widgetType: string) => void
}

function visibleChildren(els: BuilderElementDTO[] | undefined, editMode?: boolean): BuilderElementDTO[] {
  const list = els ?? []
  if (editMode) return list
  return list.filter((el) => !isBuilderHidden(el))
}

function HiddenBadge() {
  return (
    <span className="absolute right-2 top-2 z-10 rounded bg-zinc-800/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-white/10">
      Скрыто
    </span>
  )
}

function WidgetNode({
  el,
  editMode,
  selectedId,
  selectedPart,
  onSelect,
  onSelectPart,
  onPatchSettings,
}: {
  el: BuilderElementDTO
  editMode?: boolean
  selectedId?: string | null
  selectedPart?: string | null
  onSelect?: (id: string, opts?: { part?: string | null }) => void
  onSelectPart?: (part: string | null) => void
  onPatchSettings?: (id: string, patch: Record<string, unknown>) => void
}) {
  const { site } = useSiteContext()
  const def = el.widgetType ? getWidget(el.widgetType) : undefined
  const selected = selectedId === el.id
  const hidden = isBuilderHidden(el)
  const styleCss = stylesToCss(readStyles(el.settings))
  const requiredPlugin = def ? widgetRequiredPlugin(def) : null
  const pluginOff = Boolean(
    requiredPlugin
    && !(
      Array.isArray(site?.enabled_plugins)
        ? siteHasPlugin(site.enabled_plugins, requiredPlugin)
        : isPluginEnabled(requiredPlugin)
    ),
  )

  const body = def && pluginOff ? (
    editMode ? (
      <div className="rounded-lg border border-dashed border-amber-500/35 bg-amber-500/5 px-4 py-6 text-center text-sm text-amber-100/90">
        Виджет «{def.label}» скрыт на сайте — плагин «{requiredPlugin}» выключен
      </div>
    ) : null
  ) : def ? (
    <BuilderEditProvider
      value={{
        editMode: Boolean(editMode),
        elementId: el.id,
        selectedId: selectedId ?? null,
        selectedPart: selectedPart ?? null,
        settings: el.settings ?? {},
        onSelectElement: (id, opts) => onSelect?.(id, opts),
        onSelectPart: (part) => onSelectPart?.(part),
        onPatch: (patch) => onPatchSettings?.(el.id, patch),
      }}
    >
      <def.Render settings={el.settings ?? {}} editMode={editMode} />
    </BuilderEditProvider>
  ) : (
    <div className="rounded-lg border border-dashed border-amber-500/40 p-4 text-sm text-amber-200">
      Неизвестный виджет: {el.widgetType}
    </div>
  )

  if (!editMode && pluginOff) {
    return null
  }

  if (!editMode) {
    return (
      <div className="w-full" style={styleCss}>
        {body}
      </div>
    )
  }

  const selectSelf = (e: React.SyntheticEvent) => {
    const editable = (e.target as HTMLElement).closest('[data-builder-editable]') as HTMLElement | null
    if (editable) {
      // contentEditable stops click bubbling — select on mousedown via data-field
      e.stopPropagation()
      const field = editable.getAttribute('data-field')
      onSelect?.(el.id, { part: field })
      return
    }
    e.stopPropagation()
    onSelectPart?.(null)
    onSelect?.(el.id)
  }

  return (
    <div
      data-builder-id={el.id}
      data-builder-widget
      data-builder-hidden={hidden ? '1' : undefined}
      tabIndex={0}
      onMouseDown={(e) => {
        if (e.button !== 0) return
        selectSelf(e)
      }}
      onClick={(e) => selectSelf(e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelectPart?.(null)
          onSelect?.(el.id)
        }
      }}
      className={clsx(
        'relative w-full scroll-mt-6 cursor-pointer rounded-sm transition',
        hidden && 'opacity-45 outline outline-1 outline-dashed outline-zinc-500/50',
        selected && !selectedPart
          ? 'ring-2 ring-[var(--accent,#8eb6ff)] ring-offset-2 ring-offset-[var(--background)]'
          : selected
            ? 'ring-1 ring-[var(--accent,#8eb6ff)]/50'
            : 'hover:ring-1 hover:ring-white/25',
      )}
    >
      {hidden && <HiddenBadge />}
      {selected && !selectedPart && (
        <span className="absolute -top-3 left-2 z-10 rounded bg-[var(--accent,#8eb6ff)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black [color:#000] [-webkit-text-fill-color:#000]">
          {def?.label ?? el.widgetType}
        </span>
      )}
      <div className="w-full" style={styleCss}>
        {body}
      </div>
    </div>
  )
}

function ColumnNode({
  el,
  editMode,
  selectedId,
  selectedPart,
  onSelect,
  onSelectPart,
  onPatchSettings,
  onDropWidget,
}: {
  el: BuilderElementDTO
  editMode?: boolean
  selectedId?: string | null
  selectedPart?: string | null
  onSelect?: (id: string, opts?: { part?: string | null }) => void
  onSelectPart?: (part: string | null) => void
  onPatchSettings?: (id: string, patch: Record<string, unknown>) => void
  onDropWidget?: (parentId: string, widgetType: string) => void
}) {
  const selected = selectedId === el.id
  const hidden = isBuilderHidden(el)
  const width = Number(el.settings?.width || 100)
  const styleCss = stylesToCss(readStyles(el.settings))

  const onDragOver = (e: React.DragEvent) => {
    if (!editMode) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (e: React.DragEvent) => {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()
    const widgetType = e.dataTransfer.getData('application/x-builder-widget')
    if (widgetType) onDropWidget?.(el.id, widgetType)
  }

  return (
    <div
      data-builder-id={el.id}
      data-builder-hidden={hidden ? '1' : undefined}
      className={clsx(
        'min-w-0 w-full scroll-mt-6',
        editMode && 'rounded-lg border border-dashed border-white/10 p-1.5',
        selected && 'border-[var(--accent,#8eb6ff)]',
        hidden && editMode && 'opacity-45',
      )}
      style={{ flex: `1 1 ${width}%`, maxWidth: editMode ? undefined : `${width}%`, ...styleCss }}
      onClick={(e) => {
        if (!editMode) return
        e.stopPropagation()
        onSelectPart?.(null)
        onSelect?.(el.id)
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {hidden && editMode && <HiddenBadge />}
      {editMode && (!el.elements || el.elements.length === 0) && (
        <p className="py-8 text-center text-xs text-zinc-500">Перетащите виджет сюда</p>
      )}
      <div className="w-full space-y-4">
        {visibleChildren(el.elements, editMode).map((child) => (
          <WidgetNode
            key={child.id}
            el={child}
            editMode={editMode}
            selectedId={selectedId}
            selectedPart={selectedPart}
            onSelect={onSelect}
            onSelectPart={onSelectPart}
            onPatchSettings={onPatchSettings}
          />
        ))}
      </div>
    </div>
  )
}

function SectionNode({
  el,
  editMode,
  selectedId,
  selectedPart,
  onSelect,
  onSelectPart,
  onPatchSettings,
  onDropWidget,
}: {
  el: BuilderElementDTO
  editMode?: boolean
  selectedId?: string | null
  selectedPart?: string | null
  onSelect?: (id: string, opts?: { part?: string | null }) => void
  onSelectPart?: (part: string | null) => void
  onPatchSettings?: (id: string, patch: Record<string, unknown>) => void
  onDropWidget?: (parentId: string, widgetType: string) => void
}) {
  const selected = selectedId === el.id
  const hidden = isBuilderHidden(el)
  const styleCss = stylesToCss(readStyles(el.settings))
  const style: CSSProperties = {
    paddingTop: String(el.settings?.paddingY || '3rem'),
    paddingBottom: String(el.settings?.paddingY || '3rem'),
    background: el.settings?.background ? String(el.settings.background) : undefined,
    ...styleCss,
  }
  const gap = String(el.settings?.gap || '1.5rem')
  const cols = visibleChildren(el.elements, editMode)

  const onlyHero =
    (cols.length === 1) &&
    (cols[0].elements?.length === 1) &&
    cols[0].elements?.[0]?.widgetType === 'hero' &&
    !isBuilderHidden(cols[0].elements[0])

  const inner = (
    <div className="flex w-full flex-wrap" style={{ gap }}>
      {cols.map((col) => (
        <ColumnNode
          key={col.id}
          el={col}
          editMode={editMode}
          selectedId={selectedId}
          selectedPart={selectedPart}
          onSelect={onSelect}
          onSelectPart={onSelectPart}
          onPatchSettings={onPatchSettings}
          onDropWidget={onDropWidget}
        />
      ))}
    </div>
  )

  return (
    <section
      data-builder-id={el.id}
      data-builder-hidden={hidden ? '1' : undefined}
      style={style}
      className={clsx(
        'relative w-full scroll-mt-6',
        editMode && 'outline outline-1 outline-transparent hover:outline-white/15',
        selected && editMode && 'outline outline-2 outline-[var(--accent,#8eb6ff)]',
        hidden && editMode && 'opacity-45 outline outline-1 outline-dashed outline-zinc-500/40',
      )}
      onClick={(e) => {
        if (!editMode) return
        e.stopPropagation()
        onSelectPart?.(null)
        onSelect?.(el.id)
      }}
    >
      {hidden && editMode && <HiddenBadge />}
      {editMode && selected && !hidden && (
        <span className="absolute left-2 top-2 z-10 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300">
          Секция
        </span>
      )}
      {onlyHero ? inner : <Container>{inner}</Container>}
    </section>
  )
}

export function LayoutRenderer({
  layout,
  editMode,
  selectedId,
  selectedPart,
  onSelect,
  onSelectPart,
  onPatchSettings,
  onDropWidget,
}: Props) {
  useEffect(() => {
    const families = collectGoogleFontsFromLayout(layout)
    if (families.length) ensureGoogleFontsLoaded(families)
  }, [layout])

  if (!layout?.elements?.length) {
    return (
      <div className="px-6 py-20 text-center text-sm text-[var(--muted)]">
        {editMode ? 'Добавьте секцию или виджет слева' : 'Страница пуста'}
      </div>
    )
  }

  const sections = visibleChildren(layout.elements, editMode)

  const canvas = (
    <div
      className={clsx('w-full', editMode && 'min-h-[60vh]')}
      onClick={() => {
        if (editMode) {
          onSelectPart?.(null)
          onSelect?.('')
        }
      }}
    >
      {sections.map((el) => (
        <SectionNode
          key={el.id}
          el={el}
          editMode={editMode}
          selectedId={selectedId}
          selectedPart={selectedPart}
          onSelect={onSelect}
          onSelectPart={onSelectPart}
          onPatchSettings={onPatchSettings}
          onDropWidget={onDropWidget}
        />
      ))}
    </div>
  )

  return (
    <EditCanvasGuard enabled={editMode}>
      {canvas}
    </EditCanvasGuard>
  )
}
