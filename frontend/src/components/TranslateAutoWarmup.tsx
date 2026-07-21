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
}

const DONE_KEY = 'site.translate.warmup_done_v1'
const LOCK_KEY = 'site.translate.warmup_lock_v1'
/** Stay under server rate (20/min): ~5 ticks/min per tab. */
const PAUSE_MS = 12_000
const START_DELAY_MS = 4_000
const RATE_LIMIT_BACKOFF_MS = 70_000
const MAX_TICKS = 500
const LOCK_TTL_MS = 25_000

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

function tryAcquireLock(): boolean {
  try {
    const now = Date.now()
    const raw = localStorage.getItem(LOCK_KEY)
    if (raw) {
      const until = Number(raw)
      if (Number.isFinite(until) && until > now) return false
    }
    localStorage.setItem(LOCK_KEY, String(now + LOCK_TTL_MS))
    return true
  } catch {
    return true
  }
}

function renewLock(): void {
  try {
    localStorage.setItem(LOCK_KEY, String(Date.now() + LOCK_TTL_MS))
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
 * Silent background worker: while the public site is open, nudges
 * POST /translate/auto-warmup until the translation cache is ready.
 */
export function TranslateAutoWarmup() {
  const { site } = useSiteContext()
  const running = useRef(false)

  const pluginOn = siteHasPlugin(site?.enabled_plugins, 'translate')
  const widgetOn = site?.translate?.widget_enabled ?? true
  const autoOn = site?.translate?.auto_warmup ?? true

  useEffect(() => {
    if (!pluginOn || !widgetOn || !autoOn) return

    try {
      if (sessionStorage.getItem(DONE_KEY) === '1') return
    } catch {
      /* ignore */
    }

    let cancelled = false
    let ticks = 0
    let ownsLock = false

    const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

    const markDone = () => {
      try {
        sessionStorage.setItem(DONE_KEY, '1')
      } catch {
        /* ignore */
      }
    }

    const loop = async () => {
      if (running.current || cancelled) return
      running.current = true
      try {
        await sleep(START_DELAY_MS)
        while (!cancelled && ticks < MAX_TICKS) {
          if (!tryAcquireLock()) {
            await sleep(PAUSE_MS)
            continue
          }
          ownsLock = true
          ticks++
          try {
            const res = asData<AutoWarmupResult>(
              await api.post('/translate/auto-warmup', { batch_size: 6 }, { silent: true }),
            )
            renewLock()
            if (res.enabled === false || res.finished || res.ready) {
              markDone()
              break
            }
            await sleep(PAUSE_MS)
          } catch (err) {
            const status = err instanceof ApiRequestError ? err.details?.status : undefined
            await sleep(status === 429 ? RATE_LIMIT_BACKOFF_MS : PAUSE_MS * 2)
          } finally {
            if (ownsLock) {
              releaseLock()
              ownsLock = false
            }
          }
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
  }, [pluginOn, widgetOn, autoOn])

  return null
}
