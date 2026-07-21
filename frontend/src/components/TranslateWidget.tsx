import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Languages, Loader2, RotateCcw, X } from 'lucide-react'
import { useSiteContext } from '@/context/SiteContext'
import { siteHasPlugin } from '@/core/pluginGates'
import { api } from '@/lib/api'

const LANG_LABELS: Record<string, string> = {
  ru: 'Русский',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  zh: '中文',
  ja: '日本語',
  ar: 'العربية',
  pt: 'Português',
  pl: 'Polski',
  uk: 'Українська',
  tr: 'Türkçe',
  nl: 'Nederlands',
}

const STORAGE_KEY = 'site.translate.lang'
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'MATH', 'KBD', 'SAMP'])

type TranslateConfig = {
  widget_enabled?: boolean
  source_lang?: string
  languages?: string[]
  position?: string
  provider?: string
}

type BatchResponse = { data?: { translations?: string[] }; translations?: string[] }

function readStoredLang(source: string): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v !== '' ? v : source
  } catch {
    return source
  }
}

function writeStoredLang(lang: string) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

function shouldSkipNode(node: Node): boolean {
  let el: Element | null = node.parentElement
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if (el.closest('[data-no-translate], .translate-widget, .admin-bar, [contenteditable="true"]')) return true
    el = el.parentElement
  }
  return false
}

function collectTextNodes(root: ParentNode): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue ?? ''
      if (!text.trim()) return NodeFilter.FILTER_REJECT
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT
      // Skip pure punctuation / numbers-only noise lightly
      if (/^[\s\d\-–—.,:;!?/\\|@#$%^&*()[\]{}+=~`"']+$/.test(text.trim())) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let n = walker.nextNode()
  while (n) {
    out.push(n as Text)
    n = walker.nextNode()
  }
  return out
}

function positionClass(pos: string): string {
  switch (pos) {
    case 'bottom-left':
      return 'left-4 bottom-4 sm:left-6 sm:bottom-6'
    case 'top-right':
      return 'right-4 top-4 sm:right-6 sm:top-6'
    default:
      return 'right-4 bottom-4 sm:right-6 sm:bottom-6'
  }
}

/**
 * Floating language picker that translates visible DOM text on the fly
 * (Google Translate-style overlay), via CMS /translate/batch proxy.
 */
export function TranslateWidget() {
  const { site } = useSiteContext()
  const { pathname } = useLocation()
  const cfg = (site?.translate ?? null) as TranslateConfig | null
  const enabledPlugin = siteHasPlugin(site?.enabled_plugins, 'translate')

  const source = (cfg?.source_lang || 'ru').toLowerCase()
  const targets = useMemo(() => {
    const list = Array.isArray(cfg?.languages) ? cfg!.languages! : ['en']
    return list.map((l) => l.toLowerCase()).filter((l) => l && l !== source)
  }, [cfg?.languages, source])

  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState(() => readStoredLang(source))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const originals = useRef(new WeakMap<Text, string>())
  const tracked = useRef(new Set<Text>())
  const abortRef = useRef(0)

  const restoreOriginals = useCallback(() => {
    for (const node of tracked.current) {
      const orig = originals.current.get(node)
      if (orig != null && node.isConnected) node.nodeValue = orig
    }
  }, [])

  const applyTranslation = useCallback(async (target: string) => {
    const ticket = ++abortRef.current
    setError('')
    if (target === source) {
      restoreOriginals()
      document.documentElement.lang = source
      return
    }

    setBusy(true)
    try {
      const roots: ParentNode[] = []
      const main = document.querySelector('main')
      const header = document.querySelector('header')
      const footer = document.querySelector('footer')
      if (main) roots.push(main)
      if (header) roots.push(header)
      if (footer) roots.push(footer)
      if (!roots.length) roots.push(document.body)

      // Always start from originals so we don't chain-translate.
      restoreOriginals()

      const nodes: Text[] = []
      for (const root of roots) {
        for (const n of collectTextNodes(root)) {
          if (!originals.current.has(n)) {
            originals.current.set(n, n.nodeValue ?? '')
            tracked.current.add(n)
          }
          nodes.push(n)
        }
      }

      // Unique strings → indices
      const unique: string[] = []
      const indexOf = new Map<string, number>()
      const mapNode: number[] = []
      for (const n of nodes) {
        const raw = originals.current.get(n) ?? n.nodeValue ?? ''
        const key = raw
        let idx = indexOf.get(key)
        if (idx === undefined) {
          idx = unique.length
          indexOf.set(key, idx)
          unique.push(raw)
        }
        mapNode.push(idx)
      }

      const translated = new Array<string>(unique.length)
      const chunkSize = 25
      for (let i = 0; i < unique.length; i += chunkSize) {
        if (ticket !== abortRef.current) return
        const slice = unique.slice(i, i + chunkSize)
        const res = await api.post<BatchResponse>('/translate/batch', {
          source,
          target,
          texts: slice,
        })
        const list = (res as BatchResponse)?.data?.translations
          ?? (res as BatchResponse)?.translations
          ?? []
        for (let j = 0; j < slice.length; j++) {
          translated[i + j] = typeof list[j] === 'string' ? list[j] : slice[j]
        }
      }

      if (ticket !== abortRef.current) return
      nodes.forEach((node, i) => {
        const t = translated[mapNode[i]]
        if (typeof t === 'string' && node.isConnected) node.nodeValue = t
      })
      document.documentElement.lang = target
    } catch (e) {
      if (ticket === abortRef.current) {
        setError(e instanceof Error ? e.message : 'Не удалось перевести')
        restoreOriginals()
      }
    } finally {
      if (ticket === abortRef.current) setBusy(false)
    }
  }, [restoreOriginals, source])

  // Re-run when SPA navigates while a foreign lang is active.
  useEffect(() => {
    if (!enabledPlugin || !(cfg?.widget_enabled ?? true)) return
    if (lang === source) {
      document.documentElement.lang = source
      return
    }
    const id = window.setTimeout(() => void applyTranslation(lang), 180)
    return () => window.clearTimeout(id)
  }, [lang, source, enabledPlugin, cfg?.widget_enabled, applyTranslation, pathname])

  if (!enabledPlugin || !cfg || !(cfg.widget_enabled ?? true) || targets.length === 0) {
    return null
  }

  const pos = positionClass(cfg.position || 'bottom-right')
  const currentLabel = LANG_LABELS[lang] || lang.toUpperCase()

  const pick = (next: string) => {
    setLang(next)
    writeStoredLang(next)
    setOpen(false)
  }

  return (
    <div
      className={`translate-widget fixed z-[85] ${pos}`}
      data-no-translate
    >
      {open && (
        <div
          className="mb-2 min-w-[11rem] overflow-hidden rounded-xl border border-white/15 bg-[color:var(--surface,#151518)]/95 shadow-2xl backdrop-blur-md"
          role="listbox"
          aria-label="Язык страницы"
        >
          <button
            type="button"
            role="option"
            aria-selected={lang === source}
            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-white/5 ${
              lang === source ? 'text-[var(--text)]' : 'text-[var(--muted)]'
            }`}
            onClick={() => pick(source)}
          >
            <span>{LANG_LABELS[source] || source} · оригинал</span>
            {lang === source && <RotateCcw size={14} />}
          </button>
          {targets.map((code) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={lang === code}
              className={`flex w-full px-3 py-2 text-left text-sm transition hover:bg-white/5 ${
                lang === code ? 'bg-white/10 text-[var(--text)]' : 'text-[var(--muted)]'
              }`}
              onClick={() => pick(code)}
            >
              {LANG_LABELS[code] || code.toUpperCase()}
            </button>
          ))}
          {error && <p className="border-t border-white/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        </div>
      )}

      <div className="flex items-center gap-1">
        {open && (
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[color:var(--surface,#151518)]/95 text-[var(--muted)] shadow-lg backdrop-blur-md hover:text-[var(--text)]"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        )}
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-[color:var(--surface,#151518)]/95 px-3.5 text-sm text-[var(--text)] shadow-lg backdrop-blur-md transition hover:bg-white/10"
          aria-expanded={open}
          aria-label="Перевести страницу"
          onClick={() => setOpen((v) => !v)}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
          <span className="max-w-[7rem] truncate font-medium">{currentLabel}</span>
        </button>
      </div>
    </div>
  )
}
