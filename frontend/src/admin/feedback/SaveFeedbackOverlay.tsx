import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { t } from '@/admin/i18n'
import { subscribeAdminSaved, type AdminSavedEvent } from '@/admin/feedback/saveFeedback'

const SHOW_MS = 1400

function labelFor(event: AdminSavedEvent): string {
  if (event.message) return event.message
  if (/\/reorder(\/|$)/i.test(event.path)) return t.orderSaved
  if (/\/publish(\/|$)/i.test(event.path)) return t.publishSaved
  return t.savedOverlay
}

export function SaveFeedbackOverlay() {
  const [visible, setVisible] = useState(false)
  const [label, setLabel] = useState('')
  const [tick, setTick] = useState(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return subscribeAdminSaved((event) => {
      setLabel(labelFor(event))
      setVisible(true)
      setTick((n) => n + 1)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setVisible(false), SHOW_MS)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center p-4"
      aria-live="polite"
      aria-atomic
      role="status"
    >
      <div
        key={tick}
        className="admin-save-feedback relative flex min-w-[11rem] max-w-[min(20rem,92vw)] flex-col items-center gap-2.5 rounded-2xl border border-teal-400/30 bg-[#0e1210]/92 px-7 py-6 text-center shadow-[0_24px_80px_rgb(0_0_0/0.55)] backdrop-blur-md"
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              'radial-gradient(ellipse 80% 70% at 50% 0%, rgb(45 212 191 / 0.22), transparent 65%)',
          }}
          aria-hidden
        />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-teal-300/40 bg-teal-500/15 text-teal-200 shadow-[0_0_24px_rgb(45_212_191/0.25)]">
          <Check size={22} strokeWidth={2.5} aria-hidden />
        </span>
        <p className="relative font-heading text-base font-semibold tracking-tight text-zinc-50">
          {label}
        </p>
      </div>
    </div>
  )
}
