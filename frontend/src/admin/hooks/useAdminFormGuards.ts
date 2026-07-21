import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { t } from '@/admin/i18n'

type HydrateOptions<T> = {
  /** Factory for "new" records when remote data is absent. */
  createEmpty?: () => T
  /** Map remote payload before writing into local form (e.g. normalizeProduct). */
  transform?: (data: T) => T
}

/**
 * Hydrate local form state from React Query data once per record key.
 * Prevents refetch / invalidate from wiping in-progress typing and stealing focus.
 */
export function useHydratedForm<T>(
  data: T | undefined | null,
  recordKey: string,
  options?: HydrateOptions<T>,
): {
  form: T
  setForm: Dispatch<SetStateAction<T>>
  baseline: T | null
  setBaseline: Dispatch<SetStateAction<T | null>>
  /** Call after intentional remote reload (e.g. revision restore). */
  resetHydration: () => void
} {
  const createEmpty = options?.createEmpty
  const transform = options?.transform
  const [form, setForm] = useState<T>(() => (createEmpty?.() ?? ({} as T)))
  const [baseline, setBaseline] = useState<T | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const createEmptyRef = useRef(createEmpty)
  const transformRef = useRef(transform)
  createEmptyRef.current = createEmpty
  transformRef.current = transform

  useEffect(() => {
    setLoadedFor(null)
  }, [recordKey])

  useEffect(() => {
    if (data != null && loadedFor !== recordKey) {
      const next = transformRef.current ? transformRef.current(data) : data
      setForm(next)
      setBaseline(next)
      setLoadedFor(recordKey)
      return
    }
    if (data == null && recordKey === 'new' && loadedFor !== 'new') {
      const empty = (createEmptyRef.current?.() ?? ({} as T))
      setForm(empty)
      setBaseline(empty)
      setLoadedFor('new')
    }
  }, [data, recordKey, loadedFor])

  return {
    form,
    setForm,
    baseline,
    setBaseline,
    resetHydration: () => setLoadedFor(null),
  }
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** Ctrl/Cmd+S triggers save when not typing in unrelated contexts. */
export function useAdminSaveHotkey(onSave: (() => void) | undefined, enabled = true) {
  const ref = useRef(onSave)
  ref.current = onSave

  useEffect(() => {
    if (!enabled || !onSave) return
    const handler = (e: KeyboardEvent) => {
      // KeyS — works on EN (S) and RU (Ы) layouts
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault()
        ref.current?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onSave])
}

/**
 * Warn on tab close / refresh when form is dirty.
 * Also intercepts in-app link clicks within admin when dirty.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => {
    if (!dirty) return
    const onClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      try {
        const url = new URL(href, window.location.origin)
        if (url.origin !== window.location.origin) return
        if (url.pathname === window.location.pathname && url.search === window.location.search) return
        if (!window.confirm(t.unsavedChanges)) {
          e.preventDefault()
          e.stopPropagation()
        }
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])
}

export { isTypingTarget }
