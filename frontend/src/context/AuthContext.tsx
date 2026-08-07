import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiRequestError, endpoints } from '@/lib/api'
// api used for demo end session
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
  roles: string[]
  capabilities: string[]
  isSuper: boolean
  isDemo: boolean
  totpRecommended: boolean
  capsReady: boolean
  can: (permission: string) => boolean
  canAny: (...permissions: string[]) => boolean
  isSuperAdmin: () => boolean
  hasAdminAccess: () => boolean
  refreshCapabilities: () => Promise<void>
  login: (email: string, password: string) => Promise<LoginResult>
  verify2fa: (challengeToken: string, code: string) => Promise<void>
  acceptSession: (result: AuthResponse) => void
  acceptDemoSession: (data: Record<string, unknown>) => void
  logout: () => void
}

/** Legacy staff roles — used only as fallback before /auth/me hydrates. */
export const STAFF_ROLES = new Set(['super_admin', 'admin', 'editor', 'author', 'contributor'])

const AuthContext = createContext<AuthState | null>(null)

const LEGACY_ALIASES: Record<string, string[]> = {
  'content.edit_any': ['content.update'],
  'content.update': ['content.edit_any'],
  'content.delete_any': ['content.delete'],
  'content.delete': ['content.delete_any'],
  'users.view': ['users.manage'],
  'users.create': ['users.manage'],
  'users.edit': ['users.manage'],
  'users.delete': ['users.manage'],
  'roles.manage': ['users.manage', 'access.manage'],
  'access.manage': ['users.manage', 'roles.manage'],
  'plugins.manage': ['system.manage'],
  'modules.view': ['system.manage', 'modules.view'],
  'builder.use': ['content.update', 'content.edit_any', 'pages.manage'],
  'builder.publish': ['content.publish'],
  'dashboard.view': ['content.view', 'settings.manage', 'users.manage', 'system.manage'],
}

function applySession(
  result: AuthResponse,
  setToken: (t: string) => void,
  setUserName: (n: string) => void,
  setRole: (r: string) => void,
) {
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
  const [roles, setRoles] = useState<string[]>([])
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [isSuper, setIsSuper] = useState(false)
  const [isDemo, setIsDemo] = useState(() => localStorage.getItem('is_demo') === '1')
  const [totpRecommended, setTotpRecommended] = useState(false)
  const [capsReady, setCapsReady] = useState(false)

  const clearSessionState = () => {
    clearAuthStorage()
    localStorage.removeItem('is_demo')
    setToken(null)
    setUserName(null)
    setRole(null)
    setRoles([])
    setCapabilities([])
    setIsSuper(false)
    setIsDemo(false)
    setTotpRecommended(false)
    setCapsReady(false)
  }

  const refreshCapabilities = useCallback(async () => {
    if (!localStorage.getItem('access_token')) {
      setCapsReady(false)
      return
    }
    try {
      const res = await api.get<{ data?: Record<string, unknown> }>('/auth/me', { silent: true })
      const data = (res as { data?: Record<string, unknown> })?.data ?? (res as Record<string, unknown>)
      const caps = Array.isArray(data.capabilities) ? data.capabilities.map(String) : []
      const rs = Array.isArray(data.roles) ? data.roles.map(String) : []
      setCapabilities(caps)
      setRoles(rs.length ? rs : (data.role ? [String(data.role)] : []))
      const demo = Boolean(data.is_demo) || String(data.role ?? '') === 'demo_explorer' || String(data.auth ?? '') === 'demo'
      setIsDemo(demo)
      if (demo) localStorage.setItem('is_demo', '1')
      // Demo must never be treated as super
      setIsSuper(!demo && (Boolean(data.is_super) || String(data.role ?? '') === 'super_admin'))
      setTotpRecommended(!demo && Boolean(data.totp_recommended))
      if (data.role) {
        setRole(String(data.role))
        localStorage.setItem('user_role', String(data.role))
      }
      if (data.name) {
        setUserName(String(data.name))
        localStorage.setItem('user_name', String(data.name))
      }
      setCapsReady(true)
    } catch (err) {
      // Dead/expired JWT: never keep AdminBar via stale localStorage role.
      // api.ts already clears tokens on /auth/me 401 after failed refresh.
      if (!localStorage.getItem('access_token') || (err instanceof ApiRequestError && err.details.status === 401)) {
        clearSessionState()
        return
      }
      // Transient network / 5xx: soft fallback until next hydrate
      setCapabilities([])
      setRoles(role ? [role] : [])
      const demo = localStorage.getItem('is_demo') === '1' || role === 'demo_explorer'
      setIsDemo(demo)
      setIsSuper(!demo && role === 'super_admin')
      setCapsReady(true)
    }
  }, [role])

  useEffect(() => {
    const onExpired = () => clearSessionState()
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  useEffect(() => {
    if (token) {
      void refreshCapabilities()
    } else {
      setCapsReady(false)
    }
  }, [token, refreshCapabilities])

  const can = useCallback((permission: string) => {
    // Demo UX: show full admin chrome. API/DemoGuard remain the security boundary.
    if (isDemo) return true
    if (isSuper) return true
    if (capsReady && capabilities.length > 0) {
      if (capabilities.includes(permission)) return true
      for (const alt of LEGACY_ALIASES[permission] ?? []) {
        if (capabilities.includes(alt)) return true
      }
      return false
    }
    // Pre-hydrate fallback
    return roleCan(role, permission)
  }, [isDemo, isSuper, capsReady, capabilities, role])

  const value = useMemo<AuthState>(() => ({
    token,
    userName,
    role,
    roles,
    capabilities,
    isSuper,
    isDemo,
    totpRecommended,
    capsReady,
    can,
    canAny: (...perms: string[]) => perms.some((p) => can(p)),
    isSuperAdmin: () => !isDemo && (isSuper || isSuperAdminRole(role)),
    hasAdminAccess: () => {
      if (isDemo) return true
      if (isSuper) return true
      if (capsReady) {
        return capabilities.length > 0 || can('dashboard.view')
      }
      return Boolean(role && STAFF_ROLES.has(role))
    },
    refreshCapabilities,
    login: async (email, password) => {
      localStorage.removeItem('is_demo')
      setIsDemo(false)
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
    acceptDemoSession: (data) => {
      const access = String(data.access_token ?? '')
      if (!access) throw new Error('No demo access token')
      localStorage.setItem('access_token', access)
      localStorage.removeItem('refresh_token')
      localStorage.setItem('is_demo', '1')
      localStorage.setItem('user_name', 'Demo Explorer')
      localStorage.setItem('user_role', 'demo_explorer')
      setToken(access)
      setUserName('Demo Explorer')
      setRole('demo_explorer')
      setIsDemo(true)
      setIsSuper(false)
      const caps = Array.isArray(data.capabilities) ? data.capabilities.map(String) : []
      setCapabilities(caps)
      setRoles(['demo_explorer'])
      setCapsReady(true)
    },
    logout: () => {
      if (isDemo) {
        void api.post('/auth/demo/end', {}).catch(() => undefined)
      } else {
        const refresh = localStorage.getItem('refresh_token')
        void endpoints.logout(refresh).catch(() => { /* ignore */ })
      }
      clearSessionState()
    },
  }), [token, userName, role, roles, capabilities, isSuper, isDemo, totpRecommended, capsReady, can, refreshCapabilities])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
