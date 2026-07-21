import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { endpoints } from '@/lib/api'
import { AUTH_SESSION_EXPIRED_EVENT, clearAuthStorage } from '@/lib/authStorage'
import type { AuthResponse } from '@/types'
import { isSuperAdminRole, roleCan } from '@/admin/rolePermissions'

export type LoginResult =
  | { requires_2fa: true; challenge_token: string }
  | { requires_2fa: false }

type AuthState = {
  token: string | null
  userName: string | null
  role: string | null
  can: (permission: string) => boolean
  isSuperAdmin: () => boolean
  login: (email: string, password: string) => Promise<LoginResult>
  verify2fa: (challengeToken: string, code: string) => Promise<void>
  /** Применить токены из ответа register / verify-email */
  acceptSession: (result: AuthResponse) => void
  logout: () => void
}

/** Роли с доступом в /admin */
export const STAFF_ROLES = new Set(['super_admin', 'admin', 'editor'])

const AuthContext = createContext<AuthState | null>(null)

function applySession(result: AuthResponse, setToken: (t: string) => void, setUserName: (n: string) => void, setRole: (r: string) => void) {
  if (!result.access_token) throw new Error('No access token')
  localStorage.setItem('access_token', result.access_token)
  if (result.refresh_token) localStorage.setItem('refresh_token', result.refresh_token)
  localStorage.setItem('user_name', result.user?.name ?? 'Admin')
  localStorage.setItem('user_role', result.user?.role ?? 'admin')
  setToken(result.access_token)
  setUserName(result.user?.name ?? 'Admin')
  setRole(result.user?.role ?? 'admin')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('access_token'))
  const [userName, setUserName] = useState<string | null>(() => localStorage.getItem('user_name'))
  const [role, setRole] = useState<string | null>(() => localStorage.getItem('user_role'))

  const clearSessionState = () => {
    clearAuthStorage()
    setToken(null)
    setUserName(null)
    setRole(null)
  }

  // API 401 on /admin/* dispatches this so SPA state matches cleared storage.
  useEffect(() => {
    const onExpired = () => clearSessionState()
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  const value = useMemo<AuthState>(() => ({
    token,
    userName,
    role,
    can: (permission: string) => roleCan(role, permission),
    isSuperAdmin: () => isSuperAdminRole(role),
    login: async (email, password) => {
      const result = await endpoints.login(email, password)
      if (result.requires_2fa && result.challenge_token) {
        return { requires_2fa: true, challenge_token: result.challenge_token }
      }
      applySession(result, setToken, setUserName, setRole)
      return { requires_2fa: false }
    },
    verify2fa: async (challengeToken, code) => {
      const result = await endpoints.verify2fa(challengeToken, code)
      applySession(result, setToken, setUserName, setRole)
    },
    acceptSession: (result) => {
      applySession(result, setToken, setUserName, setRole)
    },
    logout: () => {
      const refresh = localStorage.getItem('refresh_token')
      // Best-effort: revoke refresh + clear HttpOnly media cookie on server.
      void endpoints.logout(refresh).catch(() => { /* ignore */ })
      clearSessionState()
    },
  }), [token, userName, role])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
