import { useEffect, useRef } from 'react'
import { useSiteContext } from '@/context/SiteContext'
import { siteHasPlugin } from '@/core/pluginGates'
import { api, ApiRequestError } from '@/lib/api'

type AutoWarmupResult = {
  enabled?: boolean
  finished?: boolean
  ready?: boolean
  translated?: number
  missing_total?: number
  target?: string | null
  throttled?: boolean
  skipped?: boolean
  content_hash?: string
}

const FP_KEY = 'site.translate.content_hash_v1'
const LOCK_KEY = 'site.translate.warmup_lock_v1'
const PAUSE_MS = 25_000
const START_DELAY_MS = 8_000
const THROTTLE_BACKOFF_MS = 90_000
const MAX_TICKS = 200
const LOCK_TTL_MS = 40_000

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

function readFp(): string {
  try {
    return localStorage.getItem(FP_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeFp(hash: string) {
  try {
    if (hash) localStorage.setItem(FP_KEY, hash)
  } catch {
    /* ignore */
  }
}

function tryAcquireLock(holdMs = LOCK_TTL_MS): boolean {
  try {
    const now = Date.now()
    const raw = localStorage.getItem(LOCK_KEY)
    const until = raw ? Number(raw) : 0
    if (Number.isFinite(until) && until > now) return false
    localStorage.setItem(LOCK_KEY, String(now + holdMs))
    return true
  } catch {
    return true
  }
}

function renewLock(holdMs: number): void {
  try {
    localStorage.setItem(LOCK_KEY, String(Date.now() + holdMs))
  } catch {
    /* ignore */
  }
}

function releaseLock(): void {
  try {
    localStorage.removeItem(LOCK_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Warms translation cache once until ready for current content_hash.
 * Does not loop forever — only when content fingerprint changes.
 */
export function TranslateAutoWarmup() {
  const { site } = useSiteContext()
  const running = useRef(false)

  // Fail-closed: no /site yet, or translate plugin off → never hit /translate/* APIs.
  const pluginOn =
    Array.isArray(site?.enabled_plugins) &&
    siteHasPlugin(site.enabled_plugins, 'translate') &&
    site?.translate != null
  const widgetOn = Boolean(site?.translate) && (site!.translate!.widget_enabled ?? true)
  const autoOn = Boolean(site?.translate) && (site!.translate!.auto_warmup ?? true)
  const serverReady = site?.translate?.cache_ready ?? false
  const serverHash = site?.translate?.content_hash ?? ''

  useEffect(() => {
    if (!pluginOn || !widgetOn || !autoOn) return

    // Server already marks this content as ready — nothing to do.
    if (serverReady && serverHash && serverHash === readFp()) return
    if (serverReady && serverHash) {
      writeFp(serverHash)
      return
    }

    try {
      const lang = localStorage.getItem('site.translate.lang')
      const source = (site?.translate?.source_lang || 'ru').toLowerCase()
      if (lang && lang !== source) return
    } catch {
      /* ignore */
    }

    let cancelled = false
    let ticks = 0
    let ownsLock = false

    const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

    const loop = async () => {
      if (running.current || cancelled) return
      running.current = true
      try {
        await sleep(START_DELAY_MS)

        // Cheap status check first.
        try {
          const check = asData<AutoWarmupResult>(
            await api.post('/translate/auto-warmup', { check_only: true }, { silent: true }),
          )
          if (check.content_hash) writeFp(check.content_hash)
          if (check.enabled === false || check.ready || check.finished || check.skipped) {
            return
          }
        } catch {
          /* continue to warm */
        }

        while (!cancelled && ticks < MAX_TICKS) {
          if (!tryAcquireLock(PAUSE_MS + 15_000)) {
            await sleep(PAUSE_MS)
            continue
          }
          ownsLock = true
          ticks++
          let waitMs = PAUSE_MS
          try {
            const res = asData<AutoWarmupResult>(
              await api.post('/translate/auto-warmup', { batch_size: 8 }, { silent: true }),
            )
            if (res.content_hash) writeFp(res.content_hash)
            if (res.enabled === false || res.finished || res.ready || res.skipped) {
              break
            }
            if (res.throttled) waitMs = THROTTLE_BACKOFF_MS
          } catch (err) {
            const status = err instanceof ApiRequestError ? err.details?.status : undefined
            waitMs = status === 429 ? THROTTLE_BACKOFF_MS : PAUSE_MS * 2
          }
          renewLock(waitMs + 5_000)
          await sleep(waitMs)
          releaseLock()
          ownsLock = false
        }
      } finally {
        if (ownsLock) releaseLock()
        running.current = false
      }
    }

    void loop()
    return () => {
      cancelled = true
    }
  }, [pluginOn, widgetOn, autoOn, serverReady, serverHash, site?.translate?.source_lang])

  return null
}
