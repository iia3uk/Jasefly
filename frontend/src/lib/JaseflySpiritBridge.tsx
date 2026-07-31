import { useEffect } from 'react'
import { subscribeAdminSaved } from '@/admin/feedback/saveFeedback'
import { subscribeApiErrors } from '@/lib/api'
import { emitSpirit, ensureJaseflySpiritGlobal, SPIRIT_EVENTS } from '@/lib/jaseflySpirit'

/**
 * Bridges platform signals → jasefly-spirit.
 * Character (ZIP) decides emotion/pose; this only emits state.
 */
export function JaseflySpiritBridge() {
  useEffect(() => {
    ensureJaseflySpiritGlobal()

    const offSave = subscribeAdminSaved((ev) => {
      if (/\/publish(\/|$)/i.test(ev.path)) {
        emitSpirit(SPIRIT_EVENTS.CONTENT_PUBLISH, { source: 'admin-save' })
        return
      }
      emitSpirit(SPIRIT_EVENTS.CONTENT_SAVE, { source: 'admin-save' })
    })

    const offErr = subscribeApiErrors((err) => {
      if (err.status && err.status >= 500) {
        emitSpirit(SPIRIT_EVENTS.CMS_ERROR, {
          source: 'api',
          meta: { status: err.status, url: err.url, message: err.message },
        })
      }
    })

    return () => {
      offSave()
      offErr()
    }
  }, [])

  return null
}
