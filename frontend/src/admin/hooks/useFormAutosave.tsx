import { useEffect, useRef, useState } from 'react'
import { clearDraft, readStoredDraft, writeDraft } from '@/admin/lib/prefs'
import { t } from '@/admin/i18n'

type Data = Record<string, unknown>

/**
 * Autosaves form JSON to localStorage while dirty; offers restore banner if a newer draft exists.
 */
export function useFormAutosave(
  resource: string,
  id: string | number | undefined,
  form: Data,
  baselineJson: string | null,
  dirty: boolean,
  onRestore: (data: Data) => void,
) {
  const [banner, setBanner] = useState<{ savedAt: number; data: Data } | null>(null)
  const checked = useRef(false)

  useEffect(() => {
    checked.current = false
    setBanner(null)
  }, [resource, id])

  useEffect(() => {
    if (!id || checked.current || !baselineJson) return
    checked.current = true
    const stored = readStoredDraft<Data>(resource, id)
    if (!stored?.data) return
    const storedJson = JSON.stringify(stored.data)
    if (storedJson !== baselineJson && stored.savedAt) {
      setBanner(stored)
    }
  }, [resource, id, baselineJson])

  useEffect(() => {
    if (!id || !dirty) return
    const timer = window.setTimeout(() => {
      writeDraft(resource, id, form)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [resource, id, form, dirty])

  const restore = () => {
    if (!banner) return
    onRestore(banner.data)
    setBanner(null)
  }

  const dismiss = () => {
    if (id) clearDraft(resource, id)
    setBanner(null)
  }

  const clear = () => {
    if (id) clearDraft(resource, id)
  }

  const bannerNode = banner ? (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <span>{t.restoreDraft}</span>
      <div className="flex gap-2">
        <button type="button" className="rounded-lg bg-amber-500/20 px-3 py-1.5 hover:bg-amber-500/30" onClick={restore}>
          {t.restoreDraftAction}
        </button>
        <button type="button" className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-300 hover:bg-white/5" onClick={dismiss}>
          {t.dismissDraft}
        </button>
      </div>
    </div>
  ) : null

  return { bannerNode, clearDraftLocal: clear }
}
