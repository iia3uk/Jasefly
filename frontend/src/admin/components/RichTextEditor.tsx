import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { Bold, Code2, Heading2, ImageIcon, Italic, Link2, List, Pilcrow, Underline as UnderlineIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { t } from '@/admin/i18n'
import { GOOGLE_FONT_PRESETS, SYSTEM_FONT_OPTIONS, ensureFontCssValueLoaded } from '@/builder/lib/googleFonts'

const lowlight = createLowlight(common)

/** Stable extension list — recreating these each render makes TipTap call setOptions and drops focus. */
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    codeBlock: false,
    underline: false,
    link: { openOnClick: false, autolink: true },
  }),
  Underline,
  TextStyle,
  Color,
  FontFamily,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Image,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({ placeholder: t.writePlaceholder }),
  CodeBlockLowlight.configure({ lowlight }),
]

const EDITOR_PROPS = {
  attributes: {
    class: 'prose tiptap min-h-56 max-w-none px-4 py-3 outline-none',
  },
}

type Mode = 'visual' | 'html'

type Props = { value?: string; onChange: (html: string) => void; placeholder?: string }

const FONTS = [
  { label: 'По умолчанию', value: '' },
  ...SYSTEM_FONT_OPTIONS.map((f) => ({ label: f.label, value: f.value })),
  ...GOOGLE_FONT_PRESETS.map((f) => ({ label: f.label, value: f.value })),
]

const COLORS = [
  '#f4f6fa', '#8b95a8', '#5b8cff', '#8eb6ff', '#3dba7a', '#f97316', '#ef4444', '#a855f7', '#22d3ee',
]

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()
}

function ToolbarBtn({
  label,
  active,
  onClick,
  title,
  children,
}: {
  label?: string
  active?: boolean
  onClick: () => void
  title?: string
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title || label}
      className={cn('rte-toolbar-btn', active && 'is-active')}
      onClick={onClick}
    >
      {children}
      {label ? <span>{label}</span> : null}
    </button>
  )
}

export function RichTextEditor({ value = '', onChange }: Props) {
  const [mode, setMode] = useState<Mode>('visual')
  const [htmlDraft, setHtmlDraft] = useState(value)
  const skipNextSync = useRef(false)
  const onChangeRef = useRef(onChange)
  const modeRef = useRef(mode)
  const initialContent = useRef(value || '')
  onChangeRef.current = onChange
  modeRef.current = mode

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: EDITOR_EXTENSIONS,
    // Initial content only — never put live `value` here or TipTap setOptions resets the caret.
    content: initialContent.current,
    onUpdate: ({ editor: instance }) => {
      if (modeRef.current !== 'visual') return
      skipNextSync.current = true
      const html = instance.getHTML()
      setHtmlDraft(html)
      onChangeRef.current(html)
    },
    editorProps: EDITOR_PROPS,
  }, [])

  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    // External parent reset — don't clobber while the user is editing either mode.
    if (mode === 'html') {
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement && active.closest('.rte-html-editor')) return
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
  }

  const onHtmlChange = (next: string) => {
    skipNextSync.current = true
    setHtmlDraft(next)
    onChange(next)
  }

  if (!editor) return <div className="h-64 animate-pulse rounded-xl bg-white/5" />

  return (
    <div className="rounded-xl border border-white/10 bg-[#0c0e14]">
      <div className="sticky top-14 z-20 rounded-t-xl border-b border-white/10 bg-[#12141c]/95 backdrop-blur-md sm:top-16">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-2 py-1.5">
          <div className="flex gap-1">
            <button
              type="button"
              className={cn('rte-mode-tab', mode === 'visual' && 'is-active')}
              onClick={() => switchMode('visual')}
            >
              {t.editorVisual}
            </button>
            <button
              type="button"
              className={cn('rte-mode-tab', mode === 'html' && 'is-active')}
              onClick={() => switchMode('html')}
            >
              {t.editorHtml}
            </button>
          </div>
          <p className="hidden px-1 text-[11px] text-zinc-500 sm:block">
            {mode === 'visual' ? t.editorVisualHint : t.editorHtmlHint}
          </p>
        </div>

        {mode === 'visual' && (
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
            <ToolbarBtn title="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Подчёркнутый" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <UnderlineIcon size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Заголовок" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Абзац" onClick={() => editor.chain().focus().setParagraph().run()}>
              <Pilcrow size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Список" label="Список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Ссылка"
              label="Ссылка"
              onClick={() => {
                const href = window.prompt(t.linkUrl)
                if (href) editor.chain().focus().setLink({ href }).run()
              }}
            >
              <Link2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Картинка"
              label="Картинка"
              onClick={() => {
                const src = window.prompt(t.imageUrl)
                if (src) editor.chain().focus().setImage({ src }).run()
              }}
            >
              <ImageIcon size={14} />
            </ToolbarBtn>
            <ToolbarBtn title="Код" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Таблица"
              label="Таблица"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            />
            <span className="mx-1 h-4 w-px bg-white/10" />
            <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              Шрифт
              <select
                className="h-7 rounded-md border border-white/10 bg-transparent px-1.5 text-xs text-zinc-300"
                value={editor.getAttributes('textStyle').fontFamily || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) {
                    editor.chain().focus().unsetFontFamily().run()
                    return
                  }
                  ensureFontCssValueLoaded(v)
                  editor.chain().focus().setFontFamily(v).run()
                }}
              >
                {FONTS.map((f) => (
                  <option key={f.label} value={f.value} className="bg-[#12141c]">
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              Цвет
              <input
                type="color"
                className="h-7 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                value={editor.getAttributes('textStyle').color || '#f4f6fa'}
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
              />
            </label>
            <div className="flex items-center gap-0.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  className="h-4 w-4 rounded-full border border-white/20"
                  style={{ background: c }}
                  onClick={() => editor.chain().focus().setColor(c).run()}
                />
              ))}
            </div>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <ToolbarBtn title="По левому" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} label="←" />
            <ToolbarBtn title="По центру" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} label="≡" />
            <ToolbarBtn title="По правому" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} label="→" />
          </div>
        )}

        {mode === 'html' && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-500">
            <Code2 size={13} className="opacity-70" />
            {t.editorHtmlHint}
          </div>
        )}
      </div>

      {mode === 'visual' ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          className="rte-html-editor"
          spellCheck={false}
          value={htmlDraft}
          onChange={(e) => onHtmlChange(e.target.value)}
          placeholder={'<p>Текст…</p>\n<ul>\n  <li>…</li>\n</ul>\n<hr>'}
        />
      )}
    </div>
  )
}
