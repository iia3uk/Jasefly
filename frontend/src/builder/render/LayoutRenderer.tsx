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
import {
  readSectionFx,
  readLayoutScrollMeta,
  sectionResponsiveClass,
  sectionMinHeightStyle,
  sectionSnapClass,
  sectionVAlignClass,
  SectionAtmosphere,
  Reveal,
  useLayoutScrollSnap,
} from '@/builder/lib/sectionEffects'
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
    <span className="builder-chrome-badge builder-chrome-badge--muted absolute right-2 top-2 z-10">
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
    <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/[0.04] p-4 text-sm text-amber-100/90">
      {el.widgetType && el.widgetType.includes('.') ? (
        <>
          Модуль «{el.widgetType.split('.')[0]}» отключён или не установлен.
          <div className="mt-1 text-xs text-amber-200/70">Виджет «{el.widgetType}» временно недоступен</div>
        </>
      ) : (
        <>Неизвестный виджет: {el.widgetType}</>
      )}
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
        'builder-node relative w-full scroll-mt-6 cursor-pointer rounded-sm transition-[box-shadow,outline-color] duration-200',
        hidden && 'opacity-45 outline outline-1 outline-dashed outline-zinc-500/50',
        selected && !selectedPart
          ? 'builder-node--selected'
          : selected
            ? 'builder-node--part'
            : 'builder-node--idle',
      )}
    >
      {hidden && <HiddenBadge />}
      {selected && !selectedPart && (
        <span className="builder-chrome-badge builder-chrome-badge--accent absolute -top-3 left-2 z-10">
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
  const fx = readSectionFx(el.settings)
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
        'builder-column relative min-w-0 w-full scroll-mt-6',
        sectionResponsiveClass(fx),
        // На мобиле колонки секции в столбец — иначе 50%/33% сжимают текст
        width < 100 && 'max-md:!max-w-full max-md:!basis-full max-md:!flex-none',
        editMode && 'rounded-lg border border-dashed border-white/10 p-1.5 transition-[border-color,box-shadow] duration-200',
        selected && 'builder-column--selected',
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
      {editMode && selected && (
        <span className="builder-chrome-badge builder-chrome-badge--accent absolute -top-2.5 left-2 z-10">
          Колонка
        </span>
      )}
      {editMode && (!el.elements || el.elements.length === 0) && (
        <p className="builder-drop-hint py-8 text-center text-xs text-zinc-500">Перетащите виджет сюда</p>
      )}
      <div className="w-full space-y-4" data-builder-widgets>
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
  pageSnap,
  snapHeight,
}: {
  el: BuilderElementDTO
  editMode?: boolean
  selectedId?: string | null
  selectedPart?: string | null
  onSelect?: (id: string, opts?: { part?: string | null }) => void
  onSelectPart?: (part: string | null) => void
  onPatchSettings?: (id: string, patch: Record<string, unknown>) => void
  onDropWidget?: (parentId: string, widgetType: string) => void
  pageSnap: ReturnType<typeof readLayoutScrollMeta>['scrollSnap']
  snapHeight: string
}) {
  const selected = selectedId === el.id
  const hidden = isBuilderHidden(el)
  const fx = readSectionFx(el.settings)
  const styleCss = stylesToCss(readStyles(el.settings))
  const defaultPad = pageSnap !== 'none' ? 'clamp(2.5rem, 5vh, 4rem)' : '3rem'
  const tint = el.settings?.background ? String(el.settings.background) : ''
  const style: CSSProperties = {
    paddingTop: String(el.settings?.paddingY || defaultPad),
    paddingBottom: String(el.settings?.paddingY || defaultPad),
    // Opaque page fill + optional tint layer (avoids neighbour glow bleeding through)
    backgroundColor: 'var(--background)',
    ...(tint ? { backgroundImage: `linear-gradient(${tint}, ${tint})` } : {}),
    ...sectionMinHeightStyle(fx, pageSnap, snapHeight),
    ...styleCss,
  }
  const gap = String(el.settings?.gap || (pageSnap !== 'none' ? '1.75rem' : '1.5rem'))
  const cols = visibleChildren(el.elements, editMode)
  // Width is a section setting only — never auto-fullbleed by widget type.
  const fullBleed = fx.fullBleed

  const contentStyle: CSSProperties | undefined = fx.contentMaxWidth
    ? { maxWidth: fx.contentMaxWidth, marginLeft: 'auto', marginRight: 'auto', width: '100%' }
    : undefined

  const inner = (
    <div className="relative z-10 flex w-full flex-wrap" style={{ gap, ...contentStyle }}>
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

  const body = (
    <>
      <SectionAtmosphere fx={fx} />
      {hidden && editMode && <HiddenBadge />}
      {editMode && selected && !hidden && (
        <span className="builder-chrome-badge builder-chrome-badge--accent absolute left-2 top-2 z-10">
          Секция
        </span>
      )}
      <div data-cms-snap-body className="relative z-10 w-full">
        {fullBleed ? inner : <Container>{inner}</Container>}
      </div>
    </>
  )

  const sectionClass = clsx(
    'builder-section relative isolate w-full scroll-mt-6',
    sectionResponsiveClass(fx),
    sectionSnapClass(fx, pageSnap),
    sectionVAlignClass(fx),
    editMode && 'outline outline-1 outline-transparent transition-[outline-color,box-shadow] duration-200 hover:outline-white/15',
    selected && editMode && 'builder-section--selected',
    hidden && editMode && 'opacity-45 outline outline-1 outline-dashed outline-zinc-500/40',
  )

  const onSectionClick = (e: { stopPropagation: () => void }) => {
    if (!editMode) return
    e.stopPropagation()
    onSelectPart?.(null)
    onSelect?.(el.id)
  }

  const anim = !editMode && pageSnap === 'none' && fx.animation && fx.animation !== 'none'
    ? fx.animation
    : undefined

  if (anim) {
    return (
      <Reveal
        tag="section"
        animation={anim}
        className={sectionClass}
        style={style}
      >
        <div
          data-builder-id={el.id}
          id={el.settings?.htmlId ? String(el.settings.htmlId) : undefined}
          data-builder-hidden={hidden ? '1' : undefined}
          className="contents"
          onClick={onSectionClick}
        >
          {body}
        </div>
      </Reveal>
    )
  }

  return (
    <section
      data-builder-id={el.id}
      id={el.settings?.htmlId ? String(el.settings.htmlId) : undefined}
      data-builder-hidden={hidden ? '1' : undefined}
      style={style}
      className={sectionClass}
      onClick={onSectionClick}
    >
      {body}
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

  const scroll = useLayoutScrollSnap(layout?.meta, editMode)

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
      data-scroll-snap={scroll.scrollSnap !== 'none' ? scroll.scrollSnap : undefined}
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
          pageSnap={scroll.scrollSnap}
          snapHeight={scroll.snapHeight}
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
