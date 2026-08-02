import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import {
  Bold, Code2, Heading1, Heading2, Heading3, ImageIcon, Italic, Link2, List,
  ListOrdered, Minus, Pilcrow, Quote, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight, Table as TableIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { t } from '@/admin/i18n'
import { mediaUrl } from '@/lib/api'
import { MediaPicker } from '@/admin/components/MediaPicker'
import type { MediaAsset } from '@/types'

const lowlight = createLowlight(common)

/** Stable extension list — recreating these each render makes TipTap drop focus. */
const BLOG_EXTENSIONS = [
  StarterKit.configure({
    codeBlock: false,
    underline: false,
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true },
  }),
  Underline,
  TextStyle,
  Color,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Image.configure({ allowBase64: false }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'heading') return 'Заголовок…'
      return t.writePlaceholder
    },
  }),
  CodeBlockLowlight.configure({ lowlight }),
]

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()
}

function keepFocus(e: React.MouseEvent) {
  e.preventDefault()
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn('rte-toolbar-btn', active && 'is-active')}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

type SlashItem = {
  key: string
  label: string
  hint: string
  icon: ReactNode
  run: (editor: Editor) => void
  image?: boolean
}

const SLASH_ITEMS: SlashItem[] = [
  { key: 'p', label: 'Текст', hint: 'Обычный абзац', icon: <Pilcrow size={14} />, run: (ed) => ed.chain().focus().clearNodes().setParagraph().run() },
  { key: 'h1', label: 'Заголовок 1', hint: 'Крупный раздел', icon: <Heading1 size={14} />, run: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run() },
  { key: 'h2', label: 'Заголовок 2', hint: 'Подраздел', icon: <Heading2 size={14} />, run: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'h3', label: 'Заголовок 3', hint: 'Мелкий заголовок', icon: <Heading3 size={14} />, run: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run() },
  { key: 'ul', label: 'Маркированный список', hint: '• пункт', icon: <List size={14} />, run: (ed) => ed.chain().focus().toggleBulletList().run() },
  { key: 'ol', label: 'Нумерованный список', hint: '1. пункт', icon: <ListOrdered size={14} />, run: (ed) => ed.chain().focus().toggleOrderedList().run() },
  { key: 'quote', label: 'Цитата', hint: 'Выделить мысль', icon: <Quote size={14} />, run: (ed) => ed.chain().focus().toggleBlockquote().run() },
  { key: 'code', label: 'Код', hint: 'Блок кода', icon: <Code2 size={14} />, run: (ed) => ed.chain().focus().toggleCodeBlock().run() },
  { key: 'hr', label: 'Разделитель', hint: 'Горизонтальная линия', icon: <Minus size={14} />, run: (ed) => ed.chain().focus().setHorizontalRule().run() },
  { key: 'table', label: 'Таблица', hint: '3×3', icon: <TableIcon size={14} />, run: (ed) => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { key: 'img', label: 'Картинка', hint: 'Из медиатеки', icon: <ImageIcon size={14} />, run: () => {}, image: true },
]

type Mode = 'visual' | 'html'

type SlashState = { query: string; top: number; left: number; from: number; to: number }

type Props = {
  value?: string
  onChange: (html: string) => void
  className?: string
}

function SelectionBubble({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const update = () => {
      const { from, to, empty } = editor.state.selection
      if (empty || !editor.isEditable) {
        setBox(null)
        return
      }
      const start = editor.view.coordsAtPos(from)
      const end = editor.view.coordsAtPos(to)
      setBox({
        top: Math.max(8, start.top - 44),
        left: (start.left + end.left) / 2,
      })
    }
    const onBlur = () => setBox(null)
    editor.on('selectionUpdate', update)
    editor.on('blur', onBlur)
    editor.on('transaction', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('blur', onBlur)
      editor.off('transaction', update)
    }
  }, [editor])

  if (!box) return null

  return (
    <div
      className="pointer-events-auto fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-white/15 bg-[#151820]/95 px-1 py-1 shadow-xl backdrop-blur-md"
      style={{ top: box.top, left: box.left }}
      onMouseDown={keepFocus}
    >
      <ToolbarBtn title="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={14} />
      </ToolbarBtn>
      <ToolbarBtn title="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={14} />
      </ToolbarBtn>
      <ToolbarBtn title="Подчёркнутый" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon size={14} />
      </ToolbarBtn>
      <ToolbarBtn title="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={14} />
      </ToolbarBtn>
      <ToolbarBtn title="Ссылка" active={editor.isActive('link')} onClick={onLink}>
        <Link2 size={14} />
      </ToolbarBtn>
    </div>
  )
}

function SlashMenu({
  query,
  rect,
  onPick,
  onClose,
  onImage,
}: {
  query: string
  rect: { top: number; left: number }
  onPick: (item: SlashItem) => void
  onClose: () => void
  onImage: () => void
}) {
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return SLASH_ITEMS.filter((it) => !q || it.label.toLowerCase().includes(q) || it.key.includes(q))
  }, [query])
  const [active, setActive] = useState(0)

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && filtered[active]) {
        e.preventDefault()
        const item = filtered[active]
        if (item.image) onImage()
        else onPick(item)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, filtered, onClose, onImage, onPick])

  if (!filtered.length) return null

  return (
    <div
      className="fixed z-50 w-64 overflow-hidden rounded-xl border border-white/12 bg-[#12141c]/98 shadow-2xl backdrop-blur-md"
      style={{ top: rect.top + 8, left: rect.left }}
      onMouseDown={keepFocus}
    >
      <p className="border-b border-white/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Вставить · /
      </p>
      <ul className="max-h-64 overflow-y-auto py-1">
        {filtered.map((item, i) => (
          <li key={item.key}>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition',
                i === active ? 'bg-white/[0.08] text-white' : 'text-zinc-300 hover:bg-white/[0.04]',
              )}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                if (item.image) onImage()
                else onPick(item)
              }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="block truncate text-[11px] text-zinc-500">{item.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LinkPopover({
  initial,
  onApply,
  onClose,
}: {
  initial: string
  onApply: (href: string) => void
  onClose: () => void
}) {
  const [href, setHref] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[20vh]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/12 bg-[#12141c] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium text-zinc-200">Ссылка</p>
        <input
          ref={ref}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
          placeholder="https://…"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onApply(href.trim())
            }
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-white" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15"
            onClick={() => onApply(href.trim())}
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Focus-safe TipTap composer for blog posts (HTML string).
 * Sticky toolbar + selection bubble + slash menu + media library images.
 */
export function BlogComposer({ value = '', onChange, className }: Props) {
  const [mode, setMode] = useState<Mode>('visual')
  const [htmlDraft, setHtmlDraft] = useState(value)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [slash, setSlash] = useState<SlashState | null>(null)

  const skipNextSync = useRef(false)
  const onChangeRef = useRef(onChange)
  const modeRef = useRef(mode)
  const initialContent = useRef(value || '')
  const slashRef = useRef<SlashState | null>(null)
  onChangeRef.current = onChange
  modeRef.current = mode
  slashRef.current = slash

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: BLOG_EXTENSIONS,
    content: initialContent.current,
    onUpdate: ({ editor: instance }) => {
      if (modeRef.current !== 'visual') return
      skipNextSync.current = true
      const html = instance.getHTML()
      setHtmlDraft(html)
      onChangeRef.current(html)

      const { $from } = instance.state.selection
      const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
      const match = text.match(/^\/([^\s/]*)$/)
      if (match && $from.parent.type.name === 'paragraph') {
        const coords = instance.view.coordsAtPos($from.pos - match[0].length)
        setSlash({
          query: match[1] ?? '',
          top: coords.bottom,
          left: coords.left,
          from: $from.pos - match[0].length,
          to: $from.pos,
        })
      } else {
        setSlash(null)
      }
    },
    editorProps: {
      attributes: {
        class: 'blog-composer-prose prose prose-invert tiptap max-w-none px-1 py-2 outline-none sm:px-2',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape' && slashRef.current) {
          setSlash(null)
          return true
        }
        // Let SlashMenu capture arrows/enter when open
        if (slashRef.current && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter')) {
          return true
        }
        return false
      },
    },
  }, [])

  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    if (mode === 'html') {
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement && active.closest('.blog-composer-html')) return
      setHtmlDraft(value)
      return
    }
    setHtmlDraft(value)
    if (!editor) return
    if (normalizeHtml(value || '') === normalizeHtml(editor.getHTML())) return
    if (editor.isFocused) return
    editor.commands.setContent(value || '', { emitUpdate: false })
  }, [value, editor, mode])

  const switchMode = (next: Mode) => {
    if (next === mode) return
    if (next === 'html' && editor) {
      const html = editor.getHTML()
      setHtmlDraft(html)
      onChange(html)
    }
    if (next === 'visual' && editor) {
      editor.commands.setContent(htmlDraft || '', { emitUpdate: false })
      onChange(htmlDraft)
    }
    setMode(next)
    setSlash(null)
  }

  const clearSlashRange = useCallback(() => {
    if (!editor || !slash) return
    editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run()
    setSlash(null)
  }, [editor, slash])

  const runSlash = useCallback((item: SlashItem) => {
    if (!editor) return
    clearSlashRange()
    item.run(editor)
  }, [clearSlashRange, editor])

  const openMedia = useCallback(() => {
    clearSlashRange()
    setMediaOpen(true)
  }, [clearSlashRange])

  const insertImage = useCallback((_id: string | number | null, asset?: MediaAsset | null) => {
    if (!editor || !asset) return
    const src = mediaUrl(asset)
    if (!src) return
    editor.chain().focus().setImage({ src, alt: asset.original_name || asset.filename || '' }).run()
    setMediaOpen(false)
  }, [editor])

  const applyLink = useCallback((href: string) => {
    if (!editor) return
    if (!href) editor.chain().focus().unsetLink().run()
    else editor.chain().focus().setLink({ href }).run()
    setLinkOpen(false)
  }, [editor])

  if (!editor) {
    return <div className="h-72 animate-pulse rounded-2xl bg-white/5" />
  }

  return (
    <div className={cn('blog-composer flex min-h-0 flex-col rounded-2xl border border-white/10 bg-[#0c0e14]', className)}>
      <div className="sticky top-0 z-20 rounded-t-2xl border-b border-white/10 bg-[#12141c]/95 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-2 py-1.5">
          <div className="flex gap-1">
            <button type="button" className={cn('rte-mode-tab', mode === 'visual' && 'is-active')} onClick={() => switchMode('visual')}>
              {t.editorVisual}
            </button>
            <button type="button" className={cn('rte-mode-tab', mode === 'html' && 'is-active')} onClick={() => switchMode('html')}>
              {t.editorHtml}
            </button>
          </div>
          <p className="hidden px-1 text-[11px] text-zinc-500 sm:block">
            {mode === 'visual' ? t.blogStudioHint : t.editorHtmlHint}
          </p>
        </div>

        {mode === 'visual' ? (
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
            <ToolbarBtn title="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <Heading1 size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Абзац" onClick={() => editor.chain().focus().setParagraph().run()}>
              <Pilcrow size={14} />
            </ToolbarBtn>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <ToolbarBtn title="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Подчёркнутый" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <UnderlineIcon size={14} />
            </ToolbarBtn>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <ToolbarBtn title="Список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Нумерованный" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Код" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Разделитель" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus size={14} />
            </ToolbarBtn>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <ToolbarBtn title="Ссылка" active={editor.isActive('link')} onClick={() => setLinkOpen(true)}>
              <Link2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Картинка" onClick={() => setMediaOpen(true)}>
              <ImageIcon size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Таблица" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              <TableIcon size={14} />
            </ToolbarBtn>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <ToolbarBtn title="По левому" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
              <AlignLeft size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="По центру" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
              <AlignCenter size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="По правому" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
              <AlignRight size={14} />
            </ToolbarBtn>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-500">
            <Code2 size={13} className="opacity-70" />
            {t.editorHtmlHint}
          </div>
        )}
      </div>

      <div className="relative min-h-[22rem] flex-1 px-3 pb-6 pt-3 sm:px-6 sm:pt-4">
        {mode === 'visual' ? (
          <>
            <EditorContent editor={editor} />
            <SelectionBubble editor={editor} onLink={() => setLinkOpen(true)} />
            {slash ? (
              <SlashMenu
                query={slash.query}
                rect={{ top: slash.top, left: slash.left }}
                onPick={runSlash}
                onClose={() => setSlash(null)}
                onImage={openMedia}
              />
            ) : null}
          </>
        ) : (
          <textarea
            className="blog-composer-html rte-html-editor min-h-[22rem]"
            spellCheck={false}
            value={htmlDraft}
            onChange={(e) => {
              skipNextSync.current = true
              setHtmlDraft(e.target.value)
              onChange(e.target.value)
            }}
            placeholder={'<p>Текст…</p>'}
          />
        )}
      </div>

      {mediaOpen ? (
        <MediaPicker
          triggerless
          defaultOpen
          kind="image"
          label="Картинка в пост"
          value={null}
          onChange={insertImage}
          onClose={() => setMediaOpen(false)}
        />
      ) : null}

      {linkOpen ? (
        <LinkPopover
          initial={String(editor.getAttributes('link').href || '')}
          onApply={applyLink}
          onClose={() => setLinkOpen(false)}
        />
      ) : null}
    </div>
  )
}
