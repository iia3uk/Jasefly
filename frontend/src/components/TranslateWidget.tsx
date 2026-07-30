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

function hasStoredLang(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) != null && localStorage.getItem(STORAGE_KEY) !== ''
  } catch {
    return false
  }
}
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'MATH', 'KBD', 'SAMP'])
/** Tags whose text children are skipped, but attributes may still be translated. */
const SKIP_TEXT_TAGS = new Set([...SKIP_TAGS, 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'])
const ATTR_NAMES = ['placeholder', 'aria-label', 'title', 'alt'] as const
const TITLE_KEY = '__document_title__'
const PUNCT_ONLY = /^[\s\d\-–—.,:;!?/\\|@#$%^&*()[\]{}+=~`"']+$/

type TranslateConfig = {
  widget_enabled?: boolean
  source_lang?: string
  languages?: string[]
  position?: string
  provider?: string
  cache_ready?: boolean
  content_hash?: string
  mode?: string
  geo_auto_lang?: boolean
  visitor_country?: string | null
  suggested_lang?: string
  geo_via?: string
}

type BatchResponse = {
  data?: {
    translations?: string[]
    cached?: number
    missing?: number
    throttled?: boolean
    partial?: boolean
    fetched?: number
  }
  translations?: string[]
  throttled?: boolean
  partial?: boolean
}

type AttrTarget = { el: Element; attr: string; key: string }

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

/** Match BE ingest: trim + collapse whitespace for cache key. */
function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ')
}

function isUrlLike(t: string): boolean {
  return /^(https?:\/\/|mailto:|\/|tel:|#)/i.test(t.trim())
}

function isSkippableText(raw: string): boolean {
  const t = raw.trim()
  if (!t) return true
  if (PUNCT_ONLY.test(t)) return true
  if (isUrlLike(t)) return true
  return false
}

function shouldSkipElement(el: Element | null): boolean {
  if (!el) return true
  let cur: Element | null = el
  while (cur) {
    if (SKIP_TAGS.has(cur.tagName)) return true
    if (cur.closest('[data-no-translate], .translate-widget, .admin-bar, [contenteditable="true"]')) return true
    cur = cur.parentElement
  }
  return false
}

function shouldSkipTextNode(node: Node): boolean {
  let el: Element | null = node.parentElement
  while (el) {
    if (SKIP_TEXT_TAGS.has(el.tagName)) return true
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
      if (isSkippableText(text)) return NodeFilter.FILTER_REJECT
      if (shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT
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

function collectAttrTargets(root: ParentNode): AttrTarget[] {
  const out: AttrTarget[] = []
  if (!(root instanceof Element) && root !== document.body && !(root instanceof DocumentFragment)) {
    return out
  }
  const scope = root instanceof Element ? root : document.body
  const nodes = [scope, ...Array.from(scope.querySelectorAll('*'))]
  for (const el of nodes) {
    if (shouldSkipElement(el)) continue
    const path = elementPath(el)
    for (const attr of ATTR_NAMES) {
      if (!el.hasAttribute(attr)) continue
      const val = el.getAttribute(attr) ?? ''
      if (isSkippableText(val)) continue
      out.push({ el, attr, key: `${path}@${attr}` })
    }
  }
  return out
}

function translationRoots(): ParentNode[] {
  const seen = new Set<ParentNode>()
  const add = (el: ParentNode) => {
    if (seen.has(el)) return
    // Skip nested roots already covered by an ancestor root
    for (const r of seen) {
      if (r instanceof Node && el instanceof Node && r.contains(el)) return
    }
    // Drop children if we add a parent
    for (const r of [...seen]) {
      if (r instanceof Node && el instanceof Node && el.contains(r)) seen.delete(r)
    }
    seen.add(el)
  }
  for (const sel of ['main', 'header', 'footer', '[data-translate-root]']) {
    document.querySelectorAll(sel).forEach((el) => add(el))
  }
  if (!seen.size) add(document.body)
  return [...seen]
}

function elementPath(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur !== document.body) {
    const tag = cur.tagName.toLowerCase()
    const owner: Element | null = cur.parentElement
    let idx = 0
    if (owner) idx = Array.prototype.indexOf.call(owner.children, cur)
    parts.push(`${tag}[${idx}]`)
    cur = owner
  }
  return parts.join('>')
}

function textNodeKey(node: Text): string {
  const parent = node.parentElement
  if (!parent) return `orphan:${(node.nodeValue ?? '').slice(0, 40)}`
  let tIdx = 0
  for (let i = 0; i < parent.childNodes.length; i++) {
    const c = parent.childNodes[i]
    if (c === node) break
    if (c.nodeType === Node.TEXT_NODE) tIdx++
  }
  return `${elementPath(parent)}#t${tIdx}`
}

function withPreservedSpace(original: string, translated: string): string {
  const m = original.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!m) return translated
  return `${m[1]}${translated}${m[3]}`
}

function positionClass(pos: string): string {
  const fabBottom = 'bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+var(--cms-fab-lift,0px)))]'
  switch (pos) {
    case 'bottom-left':
      return `left-[max(1rem,env(safe-area-inset-left,0px))] ${fabBottom} sm:left-6`
    case 'top-right':
      return 'right-[max(1rem,env(safe-area-inset-right,0px))] top-[max(1rem,env(safe-area-inset-top,0px))] sm:right-6 sm:top-6'
    default:
      return `right-[max(1rem,env(safe-area-inset-right,0px))] ${fabBottom} sm:right-6`
  }
}

/**
 * Cache-first overlay with soft miss-fill when the visitor picks a language.
 * Covers text nodes, common attributes, document.title; re-applies via timers + MutationObserver.
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
  const [lang, setLang] = useState(() => (hasStoredLang() ? readStoredLang(source) : source))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const geoAppliedRef = useRef(false)

  const sourceByKey = useRef(new Map<string, string>())
  /** Normalized source strings already batch-requested for current lang (prevents retry loops / flicker). */
  const settledNorm = useRef(new Set<string>())
  const abortRef = useRef(0)
  const langRef = useRef(lang)
  langRef.current = lang
  const applyingRef = useRef(false)
  const quietUntilRef = useRef(0)
  const moTimerRef = useRef(0)
  const partialRetriesRef = useRef(0)
  const applyFnRef = useRef<(target: string, mode?: 'full' | 'patch') => Promise<void>>(async () => {})

  const restoreToSource = useCallback(() => {
    applyingRef.current = true
    quietUntilRef.current = Date.now() + 600
    try {
      for (const root of translationRoots()) {
        for (const node of collectTextNodes(root)) {
          const key = textNodeKey(node)
          const orig = sourceByKey.current.get(key)
          if (orig != null) node.nodeValue = orig
        }
        for (const { el, attr, key } of collectAttrTargets(root)) {
          const orig = sourceByKey.current.get(key)
          if (orig != null) el.setAttribute(attr, orig)
        }
      }
      const titleOrig = sourceByKey.current.get(TITLE_KEY)
      if (titleOrig != null) document.title = titleOrig
      document.documentElement.lang = source
    } finally {
      window.setTimeout(() => {
        applyingRef.current = false
      }, 80)
    }
  }, [source])

  const abortAll = useCallback(() => {
    abortRef.current += 1
    applyingRef.current = false
    setBusy(false)
  }, [])

  type ApplyMode = 'full' | 'patch'

  const applyFromCache = useCallback(async (target: string, mode: ApplyMode = 'full') => {
    if (target === source) {
      abortAll()
      restoreToSource()
      return
    }

    // One in-flight apply at a time — overlapping full restores cause RU↔EN flicker.
    if (applyingRef.current && mode === 'patch') return

    const ticket = ++abortRef.current
    setError('')
    setBusy(true)
    applyingRef.current = true
    quietUntilRef.current = Date.now() + 10_000

    type Job =
      | { kind: 'text'; node: Text; key: string; original: string }
      | { kind: 'attr'; el: Element; attr: string; key: string; original: string }
      | { kind: 'title'; key: string; original: string }

    try {
      if (mode === 'full') {
        // Reset to source once, then translate — never do this on patch/MO.
        for (const root of translationRoots()) {
          for (const node of collectTextNodes(root)) {
            const key = textNodeKey(node)
            const orig = sourceByKey.current.get(key)
            if (orig != null) node.nodeValue = orig
          }
          for (const { el, attr, key } of collectAttrTargets(root)) {
            const orig = sourceByKey.current.get(key)
            if (orig != null) el.setAttribute(attr, orig)
          }
        }
        const titleOrig = sourceByKey.current.get(TITLE_KEY)
        if (titleOrig != null) document.title = titleOrig
        settledNorm.current.clear()
        partialRetriesRef.current = 0
      }

      const jobs: Job[] = []

      for (const root of translationRoots()) {
        for (const n of collectTextNodes(root)) {
          const key = textNodeKey(n)
          const current = n.nodeValue ?? ''
          const known = sourceByKey.current.has(key)
          if (!known) sourceByKey.current.set(key, current)
          const orig = sourceByKey.current.get(key) ?? current
          const norm = normalizeText(orig)
          if (mode === 'patch') {
            // Only new nodes or nodes still showing source that we haven't settled yet.
            const stillSource = normalizeText(current) === norm
            if (known && (!stillSource || settledNorm.current.has(norm))) continue
          } else if (n.nodeValue !== orig) {
            n.nodeValue = orig
          }
          jobs.push({ kind: 'text', node: n, key, original: orig })
        }
        for (const t of collectAttrTargets(root)) {
          const current = t.el.getAttribute(t.attr) ?? ''
          const known = sourceByKey.current.has(t.key)
          if (!known) sourceByKey.current.set(t.key, current)
          const orig = sourceByKey.current.get(t.key) ?? current
          const norm = normalizeText(orig)
          if (mode === 'patch') {
            const stillSource = normalizeText(current) === norm
            if (known && (!stillSource || settledNorm.current.has(norm))) continue
          } else if (t.el.getAttribute(t.attr) !== orig) {
            t.el.setAttribute(t.attr, orig)
          }
          jobs.push({ kind: 'attr', el: t.el, attr: t.attr, key: t.key, original: orig })
        }
      }

      const titleCurrent = document.title
      if (titleCurrent.trim() && !isSkippableText(titleCurrent)) {
        const known = sourceByKey.current.has(TITLE_KEY)
        if (!known) sourceByKey.current.set(TITLE_KEY, titleCurrent)
        const titleOrig = sourceByKey.current.get(TITLE_KEY) ?? titleCurrent
        const norm = normalizeText(titleOrig)
        if (mode === 'patch') {
          const stillSource = normalizeText(titleCurrent) === norm
          if (!known || (stillSource && !settledNorm.current.has(norm))) {
            jobs.push({ kind: 'title', key: TITLE_KEY, original: titleOrig })
          }
        } else {
          if (document.title !== titleOrig) document.title = titleOrig
          jobs.push({ kind: 'title', key: TITLE_KEY, original: titleOrig })
        }
      }

      if (jobs.length === 0) {
        document.documentElement.lang = target
        return
      }

      const unique: string[] = []
      const indexOf = new Map<string, number>()
      const mapJob: number[] = []
      for (const job of jobs) {
        const key = normalizeText(job.original)
        let idx = indexOf.get(key)
        if (idx === undefined) {
          idx = unique.length
          indexOf.set(key, idx)
          unique.push(key)
        }
        mapJob.push(idx)
      }

      const translated = new Array<string>(unique.length)
      let needsPartialRetry = false
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
              fill_misses: true,
            }, { silent: true })
            const payload = res?.data ?? res
            if (payload?.throttled) {
              await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
              continue
            }
            if (payload?.partial) needsPartialRetry = true
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
          // Mark settled even if translation equals source (brand / untranslatable).
          settledNorm.current.add(slice[j])
        }
      }

      if (ticket !== abortRef.current || langRef.current === source) {
        if (ticket === abortRef.current) restoreToSource()
        return
      }

      jobs.forEach((job, i) => {
        const t = translated[mapJob[i]]
        if (typeof t !== 'string') return
        if (job.kind === 'text') {
          if (job.node.isConnected) {
            job.node.nodeValue = withPreservedSpace(job.original, t)
          }
        } else if (job.kind === 'attr') {
          if (job.el.isConnected) job.el.setAttribute(job.attr, t)
        } else {
          document.title = t
        }
      })
      document.documentElement.lang = target

      // Soft miss-fill: patch only (no restore flash), capped retries.
      if (
        needsPartialRetry
        && ticket === abortRef.current
        && langRef.current === target
        && partialRetriesRef.current < 3
      ) {
        partialRetriesRef.current += 1
        // Unsettle only strings that came back identical (still pending live fill).
        for (let i = 0; i < unique.length; i++) {
          if (normalizeText(translated[i] || '') === unique[i]) {
            settledNorm.current.delete(unique[i])
          }
        }
        window.setTimeout(() => {
          if (langRef.current === target) void applyFnRef.current(target, 'patch')
        }, 1100)
      }
    } catch (e) {
      if (ticket === abortRef.current) {
        setError(e instanceof Error ? e.message : 'Не удалось перевести')
        restoreToSource()
      }
    } finally {
      if (ticket === abortRef.current) {
        setBusy(false)
        quietUntilRef.current = Date.now() + 1200
        window.setTimeout(() => {
          if (ticket === abortRef.current) applyingRef.current = false
        }, 100)
      }
    }
  }, [abortAll, restoreToSource, source])

  applyFnRef.current = applyFromCache

  // Auto language from visitor country (BE suggested_lang). Manual localStorage choice wins.
  useEffect(() => {
    if (!enabledPlugin || !(cfg?.widget_enabled ?? true)) return
    if (!(cfg?.geo_auto_lang ?? true)) return
    if (hasStoredLang() || geoAppliedRef.current) return
    const suggested = String(cfg?.suggested_lang || 'en').toLowerCase().replace(/[^a-z\-]/g, '')
    if (!suggested) return
    geoAppliedRef.current = true
    if (suggested === langRef.current) return
    langRef.current = suggested
    setLang(suggested)
  }, [enabledPlugin, cfg?.widget_enabled, cfg?.geo_auto_lang, cfg?.suggested_lang])

  // Lang change: one full apply + one quiet patch for late paint (no overlapping restores).
  useEffect(() => {
    if (!enabledPlugin || !(cfg?.widget_enabled ?? true)) return
    if (lang === source) {
      abortAll()
      restoreToSource()
      return
    }
    partialRetriesRef.current = 0
    settledNorm.current.clear()
    const id1 = window.setTimeout(() => {
      if (langRef.current !== source) void applyFromCache(langRef.current, 'full')
    }, 80)
    const id2 = window.setTimeout(() => {
      if (langRef.current !== source) void applyFromCache(langRef.current, 'patch')
    }, 1400)
    return () => {
      window.clearTimeout(id1)
      window.clearTimeout(id2)
    }
  }, [lang, source, enabledPlugin, cfg?.widget_enabled, applyFromCache, abortAll, restoreToSource])

  // SPA navigation: clear identity map and re-apply once.
  useEffect(() => {
    sourceByKey.current.clear()
    settledNorm.current.clear()
    partialRetriesRef.current = 0
    if (!enabledPlugin || !(cfg?.widget_enabled ?? true)) return
    if (langRef.current === source) {
      restoreToSource()
      return
    }
    const id = window.setTimeout(() => {
      if (langRef.current !== source) void applyFromCache(langRef.current, 'full')
    }, 120)
    return () => window.clearTimeout(id)
  }, [pathname, enabledPlugin, cfg?.widget_enabled, applyFromCache, restoreToSource, source])

  // MutationObserver: patch only new/unsettled nodes; ignore our own writes + cooldown.
  useEffect(() => {
    if (!enabledPlugin || !(cfg?.widget_enabled ?? true)) return
    if (typeof MutationObserver === 'undefined') return

    const schedule = () => {
      if (applyingRef.current) return
      if (Date.now() < quietUntilRef.current) return
      if (langRef.current === source) return
      window.clearTimeout(moTimerRef.current)
      moTimerRef.current = window.setTimeout(() => {
        if (applyingRef.current || Date.now() < quietUntilRef.current) return
        if (langRef.current === source) return
        void applyFromCache(langRef.current, 'patch')
      }, 350)
    }

    const mo = new MutationObserver((mutations) => {
      if (applyingRef.current || Date.now() < quietUntilRef.current) return
      if (langRef.current === source) return
      // Ignore pure characterData/attr churn from our overlay — react to added nodes.
      const hasAdd = mutations.some((m) => m.type === 'childList' && m.addedNodes.length > 0)
      if (!hasAdd) return
      schedule()
    })
    mo.observe(document.body, {
      childList: true,
      subtree: true,
    })
    return () => {
      mo.disconnect()
      window.clearTimeout(moTimerRef.current)
    }
  }, [enabledPlugin, cfg?.widget_enabled, applyFromCache, source])

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
