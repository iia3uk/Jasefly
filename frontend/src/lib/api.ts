import type { ApiEnvelope, AuthResponse, BlogPost, ContactInfo, DashboardData, Education, Experience, MediaAsset, MediaFolder, Page, Product, Profile, Project, Service, SitePayload, SkillCategory, Statistic, Testimonial } from '@/types'
import { emitSessionExpired } from '@/lib/authStorage'
import { adminLoginUrl, adminUrl, isAdminPathname } from '@/admin/adminBasePath'
import { emitAdminSaved, shouldAnnounceAdminSave } from '@/admin/feedback/saveFeedback'

/** Empty = same-origin relative `/api/v1`. Set VITE_API_URL to site origin (e.g. https://example.com) for absolute URLs. */
const API_ORIGIN = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const API_BASE = `${API_ORIGIN}/api/v1`

export type ApiErrorDetails = {
  message: string
  status?: number
  method?: string
  url?: string
  type?: string
  file?: string
  line?: number
  php?: string
  hint?: string
  at?: string
  trace?: Array<{ file?: string | null; line?: number | null; fn?: string }>
  request?: { method?: string; uri?: string; query?: string; ip?: string; ua?: string }
  raw?: unknown
  debugger?: boolean
}

type ApiErrorListener = (details: ApiErrorDetails) => void
const apiErrorListeners = new Set<ApiErrorListener>()

export function subscribeApiErrors(listener: ApiErrorListener): () => void {
  apiErrorListeners.add(listener)
  return () => { apiErrorListeners.delete(listener) }
}

function emitApiError(details: ApiErrorDetails) {
  for (const listener of apiErrorListeners) {
    try { listener(details) } catch { /* ignore */ }
  }
}

export class ApiRequestError extends Error {
  details: ApiErrorDetails
  constructor(details: ApiErrorDetails) {
    super(details.message)
    this.name = 'ApiRequestError'
    this.details = details
  }
}

async function parseErrorPayload(response: Response, method: string, path: string): Promise<ApiErrorDetails> {
  const url = `${API_BASE}${path}`
  const base: ApiErrorDetails = {
    message: `Request failed (${response.status})`,
    status: response.status,
    method,
    url,
    at: new Date().toISOString(),
  }
  try {
    const json = await response.json() as {
      error?: string
      message?: string
      errors?: Record<string, unknown>
    }
    const err = json.errors || {}
    return {
      ...base,
      message: String(json.error || json.message || base.message),
      type: typeof err.type === 'string' ? err.type : undefined,
      file: typeof err.file === 'string' ? err.file : undefined,
      line: typeof err.line === 'number' ? err.line : undefined,
      php: typeof err.php === 'string' ? err.php : undefined,
      hint: typeof err.hint === 'string' ? err.hint : undefined,
      debugger: err.debugger === true,
      trace: Array.isArray(err.trace) ? err.trace as ApiErrorDetails['trace'] : undefined,
      request: err.request && typeof err.request === 'object' ? err.request as ApiErrorDetails['request'] : undefined,
      raw: json,
    }
  } catch {
    return base
  }
}

type RequestOptions = {
  /** Do not open the API debugger for this call (used by the debugger itself). */
  silent?: boolean
  isForm?: boolean
  /** Internal: skip silent-refresh retry (prevents loops). */
  _retried?: boolean
}

let refreshInFlight: Promise<boolean> | null = null
/** Single-flight auth clear + session-expired when shared refresh fails. */
let authFailureInFlight: Promise<void> | null = null

function isSilentRefreshExcluded(path: string): boolean {
  return path === '/auth/refresh'
    || path === '/auth/login'
    || path === '/auth/logout'
    || path.startsWith('/auth/refresh')
    || path.startsWith('/auth/login')
    || path.startsWith('/auth/logout')
}

/** Paths that prove the session is dead when they 401 (not public anonymous APIs). */
function shouldRecoverSession(path: string): boolean {
  if (isSilentRefreshExcluded(path)) return false
  if (path.startsWith('/admin')) return true
  // Public site hydrates staff chrome via /auth/me — must refresh or clear, not keep stale AdminBar.
  if (path === '/auth/me' || path.startsWith('/auth/me?') || path.startsWith('/auth/2fa')) return true
  return false
}

async function settleAuthFailure(options: { redirectToLogin?: boolean } = {}): Promise<void> {
  if (authFailureInFlight) return authFailureInFlight
  const redirectToLogin = options.redirectToLogin
    ?? isAdminPathname(window.location.pathname)
  authFailureInFlight = (async () => {
    emitSessionExpired()
    if (!redirectToLogin) return
    const onLogin = isAdminPathname(window.location.pathname) && window.location.pathname.endsWith('/login')
    if (!onLogin) {
      const next = `${window.location.pathname}${window.location.search}`
      window.location.replace(adminLoginUrl(next === adminUrl('/login') ? null : next))
    }
  })()
  try {
    await authFailureInFlight
  } finally {
    // Keep the settled promise so concurrent waiters join; reset on next refresh attempt.
  }
}

async function trySilentRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  // New refresh attempt may succeed — allow a future auth-failure side-effect cycle.
  authFailureInFlight = null
  refreshInFlight = (async () => {
    const refresh = localStorage.getItem('refresh_token')
    if (!refresh) return false
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!response.ok) return false
      const json = await response.json() as {
        data?: { access_token?: string; refresh_token?: string; expires_in?: number }
        access_token?: string
        refresh_token?: string
      }
      const data = json.data ?? json
      const access = data.access_token
      const nextRefresh = data.refresh_token
      if (!access || typeof access !== 'string') return false
      localStorage.setItem('access_token', access)
      if (nextRefresh && typeof nextRefresh === 'string') {
        localStorage.setItem('refresh_token', nextRefresh)
      }
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const { silent = false, isForm = false, _retried = false } = options
  const token = localStorage.getItem('access_token')
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (!isForm) headers['Content-Type'] = 'application/json'
  // Admin UI locale → BE catalog / plugins copy (PluginCatalogMeta).
  try {
    const loc = localStorage.getItem('admin.locale')
    headers['Accept-Language'] = loc === 'en' ? 'en' : 'ru'
  } catch {
    headers['Accept-Language'] = 'ru'
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin', // CSRF-сессия плагина Mail
    body: body === undefined ? undefined : isForm ? (body as BodyInit) : JSON.stringify(body),
  })

  // Handle slug / path 301–302 redirects from API
  if (response.status === 301 || response.status === 302) {
    try {
      const json = await response.json()
      const redirect = json?.data?.redirect
      if (redirect) {
        window.location.href = redirect
        throw new Error('Redirecting…')
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'Redirecting…') throw e
      /* fall through */
    }
  }

  if (!response.ok) {
    // Expired access token → single-flight refresh once, then retry; else clear session.
    if (response.status === 401 && shouldRecoverSession(path) && !_retried) {
      const refreshed = await trySilentRefresh()
      if (refreshed) {
        return request<T>(path, method, body, { ...options, _retried: true })
      }
      // On public site: drop AdminBar / tokens. On admin routes: force login.
      await settleAuthFailure({
        redirectToLogin: path.startsWith('/admin') || isAdminPathname(window.location.pathname),
      })
    } else if (response.status === 401 && shouldRecoverSession(path)) {
      await settleAuthFailure({
        redirectToLogin: path.startsWith('/admin') || isAdminPathname(window.location.pathname),
      })
    }
    const details = await parseErrorPayload(response, method, path)
    // Open debugger for server/client errors in admin (not every 401 redirect).
    if (!silent && response.status >= 400 && response.status !== 401) {
      emitApiError(details)
    }
    throw new ApiRequestError(details)
  }
  if (shouldAnnounceAdminSave(path, method, { silent })) {
    emitAdminSaved({ path, method })
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    return (payload as ApiEnvelope<T>).data
  }
  return payload as T
}

/** Authenticated binary download (CSV exports etc.) — bare <a href> cannot send Bearer. */
async function downloadFile(path: string, fallbackName = 'export.csv'): Promise<void> {
  const token = localStorage.getItem('access_token')
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers,
    credentials: 'same-origin',
  })
  if (!response.ok) {
    const details = await parseErrorPayload(response, 'GET', path)
    throw new ApiRequestError(details)
  }
  const blob = await response.blob()
  let filename = fallbackName
  const cd = response.headers.get('Content-Disposition') || ''
  const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd)
  if (match?.[1]) {
    try {
      filename = decodeURIComponent(match[1].replace(/"/g, '').trim())
    } catch {
      filename = match[1].replace(/"/g, '').trim()
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, 'GET', undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, 'POST', body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, 'PUT', body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, 'DELETE', undefined, options),
  upload: <T>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>(path, 'POST', form, { ...options, isForm: true }),
  download: downloadFile,
}

type IDLike = string | number

export const mediaUrl = (media?: MediaAsset | { id?: IDLike; media_id?: IDLike } | IDLike | null): string | undefined => {
  if (media == null) return undefined
  if (typeof media === 'string' || typeof media === 'number') return `${API_BASE}/media/${media}`
  // Gallery rows have both project_media.id and media_id — always prefer media_id
  const id = 'media_id' in media && media.media_id != null && media.media_id !== ''
    ? media.media_id
    : media.id
  if (id != null && id !== '') return `${API_BASE}/media/${id}`
  return undefined
}

const list = async <T>(path: string, options?: RequestOptions): Promise<T[]> => {
  const raw = unwrap(await api.get<ApiEnvelope<T[]> | T[]>(path, options))
  // Demo / soft APIs sometimes return {} instead of [] — never crash .map callers.
  return Array.isArray(raw) ? raw : []
}
const one = async <T>(path: string, options?: RequestOptions): Promise<T> =>
  unwrap(await api.get<ApiEnvelope<T> | T>(path, options))

export type MigrationStatusPayload = {
  ok: boolean
  pending: string[]
  applied: string[]
  just_applied?: Array<string | { file: string; statements?: number; skipped_dupes?: number }>
  blocked?: boolean
  error?: {
    file?: string
    message?: string
    sql_preview?: string
    at?: string
    hint?: string
  } | null
  migrations_dir?: string
}

export const endpoints = {
  site: () => one<SitePayload>('/site'),
  profile: () => one<Profile>('/profile'),
  statistics: () => list<Statistic>('/statistics'),
  projects: (featured?: boolean) => list<Project>(featured ? '/projects?featured=1' : '/projects'),
  project: (slug: string) => one<Project>(`/projects/${slug}`),
  blog: () => list<BlogPost>('/blog'),
  post: (slug: string) => one<BlogPost>(`/blog/${slug}`),
  skills: () => list<SkillCategory>('/skills'),
  experience: () => list<Experience>('/experience'),
  education: () => list<Education>('/education'),
  services: () => list<Service>('/services'),
  testimonials: () => list<Testimonial>('/testimonials'),
  contactInfo: () => one<ContactInfo>('/contact-info'),
  /** Missing CMS page → null (PreferCmsLayout / optional system templates). */
  page: async (slug: string): Promise<Page | null> => {
    try {
      return await one<Page>(`/pages/${slug}`, { silent: true })
    } catch (err) {
      if (err instanceof ApiRequestError && err.details.status === 404) return null
      throw err
    }
  },
  products: (params?: Record<string, string | number | boolean | undefined>) => {
    const q = new URLSearchParams()
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue
        q.set(k, String(v))
      }
    }
    const suffix = q.toString() ? `?${q}` : ''
    return list<Product>(`/products${suffix}`)
  },
  product: (slug: string) => one<Product>(`/products/${slug}`),
  dashboard: () => one<DashboardData>('/admin/dashboard'),
  login: async (email: string, password: string) => {
    const res = await api.post<ApiEnvelope<AuthResponse> | AuthResponse>('/auth/login', { email, password })
    return unwrap(res)
  },
  logout: async (refreshToken?: string | null) => {
    await api.post('/auth/logout', { refresh_token: refreshToken || undefined })
  },
  me: () => one<{ id: number; email: string; name: string; role: string }>('/auth/me'),
  registrationConfig: () =>
    one<{
      enabled: boolean
      require_name: boolean
      min_password_length: number
      require_password_confirm: boolean
      require_email_verification: boolean
      show_login_link: boolean
      login_path: string
      honeypot_enabled: boolean
      terms_required: boolean
      terms_url: string
      terms_label: string
      closed_message: string
      success_message: string
      captcha: { provider: string; turnstile_site_key?: string; smartcaptcha_site_key?: string }
    }>('/registration/config'),
  register: async (body: Record<string, unknown>) => {
    const res = await api.post<ApiEnvelope<AuthResponse & {
      needs_verification?: boolean
      message?: string
      redirect?: string
    }> | AuthResponse>('/auth/register', body)
    return unwrap(res)
  },
  verifyEmail: async (token: string) => {
    const res = await api.post<ApiEnvelope<AuthResponse & {
      verified?: boolean
      message?: string
      redirect?: string
    }> | AuthResponse>('/auth/verify-email', { token })
    return unwrap(res)
  },
  resendVerification: async (email: string) => {
    const res = await api.post<ApiEnvelope<{ ok: boolean; message: string }>>('/auth/resend-verification', { email })
    return unwrap(res)
  },
  verify2fa: async (challenge_token: string, code: string) => {
    const res = await api.post<ApiEnvelope<AuthResponse> | AuthResponse>('/auth/2fa/verify', { challenge_token, code })
    return unwrap(res)
  },
  setup2fa: async () =>
    unwrap(await api.post<ApiEnvelope<{ secret: string; otpauth_url: string; setup_token: string }>>('/auth/2fa/setup')),
  enable2fa: async (setup_token: string, code: string) =>
    unwrap(await api.post<ApiEnvelope<{ totp_enabled: boolean }>>('/auth/2fa/enable', { setup_token, code })),
  disable2fa: async (password: string, code: string) =>
    unwrap(await api.post<ApiEnvelope<{ totp_enabled: boolean }>>('/auth/2fa/disable', { password, code })),

  search: (q: string) => one<Array<{ type: string; label: string; href: string; subtitle?: string; id?: number }>>(`/admin/search?q=${encodeURIComponent(q)}`),
  trash: () => one<Record<string, unknown[]>>('/admin/trash'),
  activity: (opts?: { source?: 'all' | 'admin' | 'mcp'; limit?: number }) => {
    const q = new URLSearchParams()
    if (opts?.source && opts.source !== 'all') q.set('source', opts.source)
    if (opts?.limit) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return list<{
      id: number
      action: string
      user_name?: string
      source?: string
      entity_type?: string
      entity_label?: string
      metadata?: string | Record<string, unknown> | null
      created_at: string
    }>(`/admin/activity${qs ? `?${qs}` : ''}`)
  },
  systemStatus: () => one<Record<string, unknown>>('/admin/system/status'),
  systemHttps: async (body: { mode?: 'auto' | 'force' | 'off'; probe?: boolean }) =>
    unwrap(
      await api.post<
        ApiEnvelope<{
          mode: string
          marker: boolean
          request_is_https: boolean
          force_redirect: boolean
          last_probe?: Record<string, unknown> | null
        }>
      >('/admin/system/https', body),
    ),
  reorder: async (resource: string, ids: Array<number | string>) => {
    const res = await api.post<ApiEnvelope<{ message?: string }> | { message?: string }>(
      `/admin/${resource}/reorder`,
      { items: ids },
    )
    return unwrap(res)
  },
  migrations: () => one<MigrationStatusPayload>('/admin/migrations'),
  migrationsRetry: async () =>
    unwrap(await api.post<ApiEnvelope<MigrationStatusPayload> | MigrationStatusPayload>('/admin/migrations/retry')),
  adminList: async <T>(resource: string): Promise<T[]> => {
    try {
      // Optional plugins: missing route → empty list, never open API debugger.
      return await list<T>(`/admin/${resource}`, { silent: true })
    } catch (err) {
      if (err instanceof ApiRequestError && err.details.status === 404) return []
      throw err
    }
  },
  adminGet: async <T>(resource: string, id: IDLike): Promise<T | null> => {
    try {
      return await one<T>(`/admin/${resource}/${id}`, { silent: true })
    } catch (err) {
      if (err instanceof ApiRequestError && err.details.status === 404) return null
      throw err
    }
  },
  adminSave: async <T>(resource: string, data: unknown, id?: IDLike) => {
    const res = id != null
      ? await api.put<ApiEnvelope<T>>(`/admin/${resource}/${id}`, data)
      : await api.post<ApiEnvelope<T>>(`/admin/${resource}`, data)
    return unwrap(res)
  },
  adminDelete: (resource: string, id: IDLike) => api.delete(`/admin/${resource}/${id}`),
  mediaList: (params?: { folder_id?: IDLike | 'root'; q?: string }) => {
    const qs = new URLSearchParams()
    if (params?.folder_id != null) qs.set('folder_id', String(params.folder_id))
    if (params?.q) qs.set('q', params.q)
    const query = qs.toString()
    return list<MediaAsset>(`/admin/media${query ? `?${query}` : ''}`)
  },
  unusedMedia: () => list<MediaAsset>('/admin/media/unused'),
  mediaFolders: () => list<MediaFolder>('/admin/media/folders'),
  createMediaFolder: async (name: string, parentId?: IDLike | null) => {
    const res = await api.post<ApiEnvelope<MediaFolder>>('/admin/media/folders', {
      name,
      parent_id: parentId ?? null,
    })
    return unwrap(res)
  },
  updateMedia: async (id: IDLike, data: { folder_id?: IDLike | null; alt_text?: string; caption?: string }) => {
    const res = await api.put<ApiEnvelope<MediaAsset>>(`/admin/media/${id}`, data)
    return unwrap(res)
  },
  deleteMediaFolder: (id: IDLike) => api.delete(`/admin/media/folders/${id}`),
  deleteMedia: async (id: IDLike) => {
    // Prefer POST destroy — shared hosting often blocks HTTP DELETE
    try {
      return await api.post(`/admin/media/${id}/destroy`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (/405|404|Not found|Method Not Allowed/i.test(msg)) {
        return api.delete(`/admin/media/${id}`)
      }
      throw e
    }
  },
  purgeMissingMedia: async () => {
    const res = await api.post<ApiEnvelope<{ removed: number; ids: number[] }>>('/admin/media/purge-missing')
    return unwrap(res)
  },
  uploadMedia: async (file: File, opts?: { folder_id?: IDLike | null; alt_text?: string; caption?: string }) => {
    const form = new FormData()
    form.append('file', file)
    if (opts?.folder_id != null && opts.folder_id !== '') form.append('folder_id', String(opts.folder_id))
    if (opts?.alt_text) form.append('alt_text', opts.alt_text)
    if (opts?.caption) form.append('caption', opts.caption)
    const res = await api.upload<ApiEnvelope<MediaAsset>>('/admin/media', form)
    return unwrap(res)
  },
  adminSingleton: <T>(path: string) => one<T>(`/admin/${path}`),
  adminSingletonSave: async <T>(path: string, data: unknown) => {
    const res = await api.put<ApiEnvelope<T>>(`/admin/${path}`, data)
    return unwrap(res)
  },
  publish: (resource: 'projects' | 'blog', id: IDLike, status = 'published') =>
    api.post(`/admin/${resource}/${id}/publish`, { status }),
  restoreTrash: (resource: string, id: IDLike) =>
    api.post(`/admin/trash/${resource}/${id}/restore`),
  forceDeleteTrash: (resource: string, id: IDLike) =>
    api.delete(`/admin/trash/${resource}/${id}?confirm=1`),
  emptyTrash: (resource: string) =>
    api.post(`/admin/trash/${resource}/empty`, { confirm: true }),
  emptyAllTrash: () =>
    api.post('/admin/trash/empty-all', { confirm: true }),
}
