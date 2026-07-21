/** Shared auth localStorage keys — used by AuthContext and API 401 handler. */

export const AUTH_STORAGE_KEYS = [
  'access_token',
  'refresh_token',
  'user_name',
  'user_role',
] as const

export const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired'

export function clearAuthStorage(): void {
  for (const key of AUTH_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}

/** Clear tokens and notify AuthProvider so RequireAuth can redirect to login. */
export function emitSessionExpired(): void {
  const refresh = localStorage.getItem('refresh_token')
  // Drop HttpOnly media cookie even if access JWT is already dead.
  const API_ORIGIN = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  void fetch(`${API_ORIGIN}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ refresh_token: refresh || undefined }),
  }).catch(() => { /* ignore */ })
  clearAuthStorage()
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT))
}
