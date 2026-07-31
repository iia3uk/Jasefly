/**
 * Jasefly Spirit — platform event bus for the Character (and future listeners).
 * Modules emit state; Character reacts with emotion/pose. Not a chatbot.
 *
 * Usage (core / FE modules):
 *   import { emitSpirit, SPIRIT_EVENTS } from '@/lib/jaseflySpirit'
 *   emitSpirit(SPIRIT_EVENTS.MODULE_INSTALL_SUCCESS)
 *
 * Usage (ZIP packages without bundler):
 *   window.jaseflySpirit.emit('indexnow.done')
 *   // or CustomEvent('jasefly-spirit', { detail: { event: 'ai.finished' } })
 */

export const SPIRIT_EVENT_NAME = 'jasefly-spirit'

/** Well-known platform events (extensible — any string works). */
export const SPIRIT_EVENTS = {
  CMS_READY: 'cms.ready',
  ADMIN_WELCOME: 'admin.welcome',
  ADMIN_IDLE: 'admin.idle',
  MODULE_INSTALL_START: 'module.install.start',
  MODULE_INSTALL_SUCCESS: 'module.install.success',
  MODULE_INSTALL_ERROR: 'module.install.error',
  MODULE_UPDATE_SUCCESS: 'module.update.success',
  CONTENT_PUBLISH: 'content.publish',
  CONTENT_SAVE: 'content.save',
  BUILD_SUCCESS: 'build.success',
  BUILD_ERROR: 'build.error',
  INDEXNOW_DONE: 'indexnow.done',
  AI_FINISHED: 'ai.finished',
  CMS_ERROR: 'cms.error',
  LANDING_VISIT: 'landing.visit',
} as const

export type SpiritEventName = (typeof SPIRIT_EVENTS)[keyof typeof SPIRIT_EVENTS] | (string & {})

export type SpiritReactionHint = {
  /** Override mapped emotion (Character may ignore if mapping wins). */
  emotion?: string
  pose?: string
  duration?: number
  badge?: string | null
  anchor?: 'corner' | 'logo' | { x: number; y: number }
  /** Bypass cooldown / hourly cap */
  force?: boolean
  meta?: Record<string, unknown>
}

export type SpiritEventDetail = SpiritReactionHint & {
  event: SpiritEventName
  at: number
  source?: string
}

type SpiritListener = (detail: SpiritEventDetail) => void

const listeners = new Set<SpiritListener>()

export function emitSpirit(
  event: SpiritEventName,
  opts: SpiritReactionHint & { source?: string } = {},
): void {
  const detail: SpiritEventDetail = {
    event,
    at: Date.now(),
    source: opts.source,
    emotion: opts.emotion,
    pose: opts.pose,
    duration: opts.duration,
    badge: opts.badge,
    anchor: opts.anchor,
    force: opts.force,
    meta: opts.meta,
  }

  for (const fn of listeners) {
    try {
      fn(detail)
    } catch {
      /* ignore */
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(SPIRIT_EVENT_NAME, { detail }))
      // Legacy alias for Character ≤1.0.x
      window.dispatchEvent(
        new CustomEvent('jasefly-character', {
          detail: { action: 'spirit', ...detail },
        }),
      )
    } catch {
      /* ignore */
    }
  }
}

export function onSpirit(listener: SpiritListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export type JaseflySpiritApi = {
  emit: typeof emitSpirit
  on: typeof onSpirit
  events: typeof SPIRIT_EVENTS
  EVENT: typeof SPIRIT_EVENT_NAME
}

export const jaseflySpirit: JaseflySpiritApi = {
  emit: emitSpirit,
  on: onSpirit,
  events: SPIRIT_EVENTS,
  EVENT: SPIRIT_EVENT_NAME,
}

declare global {
  interface Window {
    jaseflySpirit?: JaseflySpiritApi
  }
}

/** Install global for ZIP modules (idempotent). */
export function ensureJaseflySpiritGlobal(): JaseflySpiritApi {
  if (typeof window !== 'undefined') {
    window.jaseflySpirit = jaseflySpirit
  }
  return jaseflySpirit
}
