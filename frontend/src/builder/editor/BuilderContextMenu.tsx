import { useEffect, useRef, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ClipboardPaste,
  Eye,
  EyeOff,
  Layers2,
  Trash2,
} from 'lucide-react'

export type BuilderContextMenuState = {
  x: number
  y: number
  id: string
}

type Props = {
  menu: BuilderContextMenuState
  canPaste: boolean
  hidden: boolean
  onClose: () => void
  onDuplicate: () => void
  onCopy: () => void
  onPaste: () => void
  onToggleHidden: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

export function BuilderContextMenu({
  menu,
  canPaste,
  hidden,
  onClose,
  onDuplicate,
  onCopy,
  onPaste,
  onToggleHidden,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const style = {
    left: Math.min(menu.x, typeof window !== 'undefined' ? window.innerWidth - 220 : menu.x),
    top: Math.min(menu.y, typeof window !== 'undefined' ? window.innerHeight - 280 : menu.y),
  }

  const Item = ({
    label,
    icon,
    onClick,
    danger,
    disabled,
  }: {
    label: string
    icon: ReactNode
    onClick: () => void
    danger?: boolean
    disabled?: boolean
  }) => (
    <button
      type="button"
      disabled={disabled}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm disabled:opacity-40 ${
        danger ? 'text-red-300 hover:bg-red-500/10' : 'text-zinc-200 hover:bg-white/10'
      }`}
      onClick={() => {
        if (disabled) return
        onClick()
        onClose()
      }}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div
      ref={ref}
      className="fixed z-[80] min-w-[11.5rem] rounded-xl border border-white/15 bg-[#16161a] p-1.5 shadow-2xl"
      style={style}
      role="menu"
    >
      <Item label="Дублировать" icon={<Layers2 size={14} />} onClick={onDuplicate} />
      <Item label="Копировать" icon={<Copy size={14} />} onClick={onCopy} />
      <Item label="Вставить" icon={<ClipboardPaste size={14} />} onClick={onPaste} disabled={!canPaste} />
      <div className="my-1 border-t border-white/10" />
      <Item label="Выше" icon={<ArrowUp size={14} />} onClick={onMoveUp} />
      <Item label="Ниже" icon={<ArrowDown size={14} />} onClick={onMoveDown} />
      <Item
        label={hidden ? 'Показать' : 'Скрыть'}
        icon={hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        onClick={onToggleHidden}
      />
      <div className="my-1 border-t border-white/10" />
      <Item label="Удалить" icon={<Trash2 size={14} />} onClick={onDelete} danger />
    </div>
  )
}
