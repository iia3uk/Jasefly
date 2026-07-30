export type AdminSavedEvent = {
  path: string
  method: string
  message?: string
  at: number
}

type Listener = (event: AdminSavedEvent) => void

const listeners = new Set<Listener>()

/** Destructive / noisy admin writes — no «Сохранено» toast. */
const EXCLUDE =
  /\/(destroy|empty|empty-all|purge-missing|trash|logout|login|refresh|diag|test|last-error)(\/|$)/i

export function shouldAnnounceAdminSave(
  path: string,
  method: string,
  opts?: { silent?: boolean },
): boolean {
  if (opts?.silent) return false
  const m = method.toUpperCase()
  if (m !== 'PUT' && m !== 'PATCH' && m !== 'POST') return false
  if (!path.startsWith('/admin')) return false
  if (EXCLUDE.test(path)) return false
  return true
}

export function emitAdminSaved(partial: Omit<AdminSavedEvent, 'at'> & { at?: number }) {
  const event: AdminSavedEvent = {
    path: partial.path,
    method: partial.method,
    message: partial.message,
    at: partial.at ?? Date.now(),
  }
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      /* ignore */
    }
  }
}

export function subscribeAdminSaved(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Explicit call from UI when save doesn't go through /admin API. */
export function announceSaved(message?: string) {
  emitAdminSaved({ path: '/admin/_local', method: 'PUT', message })
}
