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
  cache_ready?: boolean
  content_hash?: string
  mode?: string
}

type BatchResponse = {
  data?: {
    translations?: string[]
    cached?: number
    missing?: number
    throttled?: boolean
  }
  translations?: string[]
  throttled?: boolean
}

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

function translationRoots(): ParentNode[] {
  const roots: ParentNode[] = []
  for (const sel of ['main', 'header', 'footer']) {
    document.querySelectorAll(sel).forEach((el) => roots.push(el))
  }
  if (!roots.length) roots.push(document.body)
  return roots
}

function withPreservedSpace(original: string, translated: string): string {
  const m = original.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!m) return translated
  return `${m[1]}${translated}${m[3]}`
}

/**
 * Cache-only overlay: applies translations from DB cache (no live MT).
 * Near-instant when warmup has filled the cache.
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

  const sourceByKey = useRef(new Map<string, string>())
  const abortRef = useRef(0)
  const langRef = useRef(lang)
  langRef.current = lang

  const nodeKey = (node: Text): string => {
    const parent = node.parentElement
    if (!parent) return `orphan:${(node.nodeValue ?? '').slice(0, 40)}`
    const parts: string[] = []
    let el: Element | null = parent
    while (el && el !== document.body) {
      const tag = el.tagName.toLowerCase()
      const owner: Element | null = el.parentElement
      let idx = 0
      if (owner) idx = Array.prototype.indexOf.call(owner.children, el)
      parts.push(`${tag}[${idx}]`)
      el = owner
    }
    let tIdx = 0
    for (let i = 0; i < parent.childNodes.length; i++) {
      const c = parent.childNodes[i]
      if (c === node) break
      if (c.nodeType === Node.TEXT_NODE) tIdx++
    }
    return `${parts.join('>')}#t${tIdx}`
  }

  const restoreToSource = useCallback(() => {
    for (const root of translationRoots()) {
      for (const node of collectTextNodes(root)) {
        const key = nodeKey(node)
        const orig = sourceByKey.current.get(key)
        if (orig != null) node.nodeValue = orig
      }
    }
    document.documentElement.lang = source
  }, [source])

  const abortAll = useCallback(() => {
    abortRef.current += 1
    setBusy(false)
  }, [])

  const applyFromCache = useCallback(async (target: string) => {
    if (target === source) {
      abortAll()
      restoreToSource()
      return
    }

    const ticket = ++abortRef.current
    setError('')
    setBusy(true)

    try {
      restoreToSource()

      const nodes: Text[] = []
      const originals: string[] = []

      for (const root of translationRoots()) {
        for (const n of collectTextNodes(root)) {
          const key = nodeKey(n)
          const current = n.nodeValue ?? ''
          if (!sourceByKey.current.has(key)) {
            sourceByKey.current.set(key, current)
          }
          const orig = sourceByKey.current.get(key) ?? current
          if (n.nodeValue !== orig) n.nodeValue = orig
          nodes.push(n)
          originals.push(orig)
        }
      }

      const unique: string[] = []
      const indexOf = new Map<string, number>()
      const mapNode: number[] = []
      for (const raw of originals) {
        const key = raw.trim()
        let idx = indexOf.get(key)
        if (idx === undefined) {
          idx = unique.length
          indexOf.set(key, idx)
          unique.push(key)
        }
        mapNode.push(idx)
      }

      // Cache-only API — fewer large chunks; soft-throttle retries quietly.
      const translated = new Array<string>(unique.length)
      const chunkSize = 200
      for (let i = 0; i < unique.length; i += chunkSize) {
        if (ticket !== abortRef.current || langRef.current === source) return
        const slice = unique.slice(i, i + chunkSize)
        let list: string[] = []
        for (let attempt = 0; attempt < 4; attempt++) {
          if (ticket !== abortRef.current || langRef.current === source) return
          try {
            const res = await api.post<BatchResponse>('/translate/batch', {
              source,
              target,
              texts: slice,
            }, { silent: true })
            const payload = res?.data ?? res
            if (payload?.throttled) {
              await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
              continue
            }
            list = payload?.translations ?? []
            break
          } catch (e) {
            const status = e && typeof e === 'object' && 'status' in e
              ? Number((e as { status?: number }).status)
              : 0
            if (status === 429 && attempt < 3) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
              continue
            }
            throw e
          }
        }
        for (let j = 0; j < slice.length; j++) {
          const got = typeof list[j] === 'string' ? list[j] : ''
          translated[i + j] = got.trim() !== '' ? got : slice[j]
        }
      }

      if (ticket !== abortRef.current || langRef.current === source) {
        restoreToSource()
        return
      }

      nodes.forEach((node, i) => {
        const t = translated[mapNode[i]]
        if (typeof t === 'string' && node.isConnected) {
          node.nodeValue = withPreservedSpace(originals[i], t)
        }
      })
      document.documentElement.lang = target
    } catch (e) {
      if (ticket === abortRef.current) {
        setError(e instanceof Error ? e.message : 'Не удалось перевести')
        restoreToSource()
      }
    } finally {
      if (ticket === abortRef.current) setBusy(false)
    }
  }, [abortAll, restoreToSource, source])

  useEffect(() => {
    if (!enabledPlugin || !(cfg?.widget_enabled ?? true)) return
    if (lang === source) {
      abortAll()
      restoreToSource()
      return
    }
    const id = window.setTimeout(() => void applyFromCache(lang), 80)
    // One catch-up after late widgets — still cache-only / fast.
    const id2 = window.setTimeout(() => {
      if (langRef.current !== source) void applyFromCache(langRef.current)
    }, 700)
    return () => {
      window.clearTimeout(id)
      window.clearTimeout(id2)
    }
  }, [lang, source, enabledPlugin, cfg?.widget_enabled, applyFromCache, abortAll, restoreToSource])

  useEffect(() => {
    sourceByKey.current.clear()
    if (!enabledPlugin || !(cfg?.widget_enabled ?? true)) return
    if (langRef.current === source) {
      restoreToSource()
      return
    }
    const id = window.setTimeout(() => {
      if (langRef.current !== source) void applyFromCache(langRef.current)
    }, 100)
    return () => window.clearTimeout(id)
  }, [pathname, enabledPlugin, cfg?.widget_enabled, applyFromCache, restoreToSource, source])

  if (!enabledPlugin || !cfg || !(cfg.widget_enabled ?? true) || targets.length === 0) {
    return null
  }

  const pos = positionClass(cfg.position || 'bottom-right')
  const currentLabel = LANG_LABELS[lang] || lang.toUpperCase()

  const pick = (next: string) => {
    writeStoredLang(next)
    setOpen(false)
    if (next === source) {
      abortAll()
      langRef.current = source
      setLang(source)
      restoreToSource()
      return
    }
    langRef.current = next
    setLang(next)
  }

  return (
    <div className={`translate-widget fixed z-[85] ${pos}`} data-no-translate>
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
