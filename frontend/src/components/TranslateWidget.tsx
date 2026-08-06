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

const LOCAL_CACHE_PREFIX = 'site.translate.map.v1'

function localCacheStorageKey(source: string, target: string, contentHash: string): string {
  return `${LOCAL_CACHE_PREFIX}:${source}:${target}:${contentHash || 'na'}`
}

function readLocalTranslationMap(source: string, target: string, contentHash: string): Map<string, string> {
  try {
    const raw = sessionStorage.getItem(localCacheStorageKey(source, target, contentHash))
    if (!raw) return new Map()
    const obj = JSON.parse(raw) as Record<string, string>
    if (!obj || typeof obj !== 'object') return new Map()
    return new Map(Object.entries(obj).filter(([, v]) => typeof v === 'string' && v !== ''))
  } catch {
    return new Map()
  }
}

function writeLocalTranslationMap(
  source: string,
  target: string,
  contentHash: string,
  map: Map<string, string>,
) {
  try {
    const obj: Record<string, string> = {}
    let n = 0
    for (const [k, v] of map) {
      if (!k || !v) continue
      obj[k] = v
      n++
      if (n >= 4000) break
    }
    sessionStorage.setItem(localCacheStorageKey(source, target, contentHash), JSON.stringify(obj))
  } catch {
    /* quota / private mode */
  }
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
  // Fail-closed until /site.enabled_plugins hydrates — siteHasPlugin() is fail-open when undefined.
  const enabledPlugin =
    Array.isArray(site?.enabled_plugins) && siteHasPlugin(site.enabled_plugins, 'translate') && !!cfg
  const widgetOn = Boolean(cfg) && (cfg!.widget_enabled ?? true)

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
  /** In-memory map per target for this tab (sessionStorage is backup across reloads). */
  const memoryMapsRef = useRef(new Map<string, Map<string, string>>())
  const contentHash = String(cfg?.content_hash || '')
  const cacheReady = Boolean(cfg?.cache_ready)

  const getLocalMap = useCallback((target: string) => {
    const key = `${source}|${target}|${contentHash}`
    let map = memoryMapsRef.current.get(key)
    if (!map) {
      map = readLocalTranslationMap(source, target, contentHash)
      memoryMapsRef.current.set(key, map)
    }
    return map
  }, [source, contentHash])

  const persistLocalMap = useCallback((target: string, map: Map<string, string>) => {
    const key = `${source}|${target}|${contentHash}`
    memoryMapsRef.current.set(key, map)
    writeLocalTranslationMap(source, target, contentHash, map)
  }, [source, contentHash])

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
      const localMap = getLocalMap(target)

      if (mode === 'full') {
        settledNorm.current.clear()
        partialRetriesRef.current = 0
      }

      const jobs: Job[] = []
      const paintJob = (job: Job, text: string) => {
        if (job.kind === 'text') {
          if (job.node.isConnected) job.node.nodeValue = withPreservedSpace(job.original, text)
        } else if (job.kind === 'attr') {
          if (job.el.isConnected) job.el.setAttribute(job.attr, text)
        } else {
          document.title = text
        }
      }

      for (const root of translationRoots()) {
        for (const n of collectTextNodes(root)) {
          const key = textNodeKey(n)
          const current = n.nodeValue ?? ''
          const known = sourceByKey.current.has(key)
          if (!known) sourceByKey.current.set(key, current)
          const orig = sourceByKey.current.get(key) ?? current
          const norm = normalizeText(orig)
          if (mode === 'patch') {
            const stillSource = normalizeText(current) === norm
            if (known && (!stillSource || settledNorm.current.has(norm))) continue
          }
          const job: Job = { kind: 'text', node: n, key, original: orig }
          // Instant paint from session/memory cache — no source flash while waiting API.
          const hit = localMap.get(norm)
          if (hit) {
            paintJob(job, hit)
            settledNorm.current.add(norm)
          } else if (mode === 'full' && n.nodeValue !== orig) {
            n.nodeValue = orig
          }
          jobs.push(job)
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
          }
          const job: Job = { kind: 'attr', el: t.el, attr: t.attr, key: t.key, original: orig }
          const hit = localMap.get(norm)
          if (hit) {
            paintJob(job, hit)
            settledNorm.current.add(norm)
          } else if (mode === 'full' && t.el.getAttribute(t.attr) !== orig) {
            t.el.setAttribute(t.attr, orig)
          }
          jobs.push(job)
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
          const hit = localMap.get(norm)
          if (hit) {
            document.title = hit
            settledNorm.current.add(norm)
          } else if (document.title !== titleOrig) {
            document.title = titleOrig
          }
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
      const needFetch: string[] = []
      for (let i = 0; i < unique.length; i++) {
        const hit = localMap.get(unique[i])
        if (hit) {
          translated[i] = hit
        } else {
          needFetch.push(unique[i])
        }
      }

      document.documentElement.lang = target

      // All hits in session cache — no network round-trip.
      if (needFetch.length === 0) {
        jobs.forEach((job, i) => {
          const t = translated[mapJob[i]]
          if (typeof t === 'string') paintJob(job, t)
        })
        return
      }

      let needsPartialRetry = false
      // When server cache is marked ready, skip live MT (misses stay source; no slow/bad fill).
      const fillMisses = !cacheReady || mode === 'patch'
      const chunkSize = 80
      const fetchedMap = new Map<string, string>()

      for (let i = 0; i < needFetch.length; i += chunkSize) {
        if (ticket !== abortRef.current || langRef.current === source) return
        const slice = needFetch.slice(i, i + chunkSize)
        let list: string[] = []
        for (let attempt = 0; attempt < 4; attempt++) {
          if (ticket !== abortRef.current || langRef.current === source) return
          try {
            const res = await api.post<BatchResponse>('/translate/batch', {
              source,
              target,
              texts: slice,
              fill_misses: fillMisses,
            }, { silent: true })
            const payload = res?.data ?? res
            if (payload?.throttled) {
              await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
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
              await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
              continue
            }
            throw e
          }
        }
        for (let j = 0; j < slice.length; j++) {
          const src = slice[j]
          const got = typeof list[j] === 'string' ? list[j].trim() : ''
          const value = got !== '' ? got : src
          fetchedMap.set(src, value)
          translated[indexOf.get(src)!] = value
          settledNorm.current.add(src)
          // Persist only real translations (not echo) into local cache.
          if (got !== '' && normalizeText(got) !== src) {
            localMap.set(src, got)
          }
        }
        // Progressive paint as chunks arrive.
        if (ticket === abortRef.current && langRef.current === target) {
          jobs.forEach((job, ji) => {
            const src = unique[mapJob[ji]]
            const t = fetchedMap.get(src) ?? localMap.get(src)
            if (typeof t === 'string') paintJob(job, t)
          })
        }
      }

      persistLocalMap(target, localMap)

      if (ticket !== abortRef.current || langRef.current === source) {
        if (ticket === abortRef.current) restoreToSource()
        return
      }

      jobs.forEach((job, i) => {
        const t = translated[mapJob[i]]
        if (typeof t === 'string') paintJob(job, t)
      })
      document.documentElement.lang = target

      if (
        needsPartialRetry
        && fillMisses
        && ticket === abortRef.current
        && langRef.current === target
        && partialRetriesRef.current < 2
      ) {
        partialRetriesRef.current += 1
        for (let i = 0; i < unique.length; i++) {
          if (normalizeText(translated[i] || '') === unique[i]) {
            settledNorm.current.delete(unique[i])
          }
        }
        window.setTimeout(() => {
          if (langRef.current === target) void applyFnRef.current(target, 'patch')
        }, 900)
      }
    } catch (e) {
      if (ticket === abortRef.current) {
        setError(e instanceof Error ? e.message : 'Не удалось перевести')
        restoreToSource()
      }
    } finally {
      if (ticket === abortRef.current) {
        setBusy(false)
        quietUntilRef.current = Date.now() + 800
        window.setTimeout(() => {
          if (ticket === abortRef.current) applyingRef.current = false
        }, 80)
      }
    }
  }, [abortAll, restoreToSource, source, getLocalMap, persistLocalMap, cacheReady])

  applyFnRef.current = applyFromCache

  // Auto language from visitor country (BE suggested_lang). Manual localStorage choice wins.
  useEffect(() => {
    if (!enabledPlugin || !widgetOn) return
    if (!(cfg?.geo_auto_lang ?? true)) return
    if (hasStoredLang() || geoAppliedRef.current) return
    const suggested = String(cfg?.suggested_lang || 'en').toLowerCase().replace(/[^a-z\-]/g, '')
    if (!suggested) return
    geoAppliedRef.current = true
    if (suggested === langRef.current) return
    langRef.current = suggested
    setLang(suggested)
  }, [enabledPlugin, widgetOn, cfg?.geo_auto_lang, cfg?.suggested_lang])

  // Lang change: one full apply + one quiet patch for late paint (no overlapping restores).
  useEffect(() => {
    if (!enabledPlugin || !widgetOn) {
      abortAll()
      return
    }
    if (lang === source) {
      abortAll()
      restoreToSource()
      return
    }
    partialRetriesRef.current = 0
    settledNorm.current.clear()
    // Immediate when session cache warm; short defer only for first paint.
    const delay = cacheReady || getLocalMap(lang).size > 0 ? 0 : 40
    const id1 = window.setTimeout(() => {
      if (langRef.current !== source) void applyFromCache(langRef.current, 'full')
    }, delay)
    // Late patch for React/layout paint — skip second pass when server cache is ready.
    const id2 = cacheReady
      ? 0
      : window.setTimeout(() => {
          if (langRef.current !== source) void applyFromCache(langRef.current, 'patch')
        }, 1200)
    return () => {
      window.clearTimeout(id1)
      if (id2) window.clearTimeout(id2)
    }
  }, [lang, source, enabledPlugin, widgetOn, applyFromCache, abortAll, restoreToSource, cacheReady, getLocalMap])

  // SPA navigation: clear identity map and re-apply once.
  useEffect(() => {
    sourceByKey.current.clear()
    settledNorm.current.clear()
    partialRetriesRef.current = 0
    if (!enabledPlugin || !widgetOn) return
    if (langRef.current === source) {
      restoreToSource()
      return
    }
    const id = window.setTimeout(() => {
      if (langRef.current !== source) void applyFromCache(langRef.current, 'full')
    }, 120)
    return () => window.clearTimeout(id)
  }, [pathname, enabledPlugin, widgetOn, applyFromCache, restoreToSource, source])

  // MutationObserver: patch only new/unsettled nodes; ignore our own writes + cooldown.
  useEffect(() => {
    if (!enabledPlugin || !widgetOn) return
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
  }, [enabledPlugin, widgetOn, applyFromCache, source])

  if (!enabledPlugin || !widgetOn || targets.length === 0) {
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
