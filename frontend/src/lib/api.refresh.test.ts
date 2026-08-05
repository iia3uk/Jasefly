/**
 * Silent refresh: single-flight + retry-once on admin 401.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store: Record<string, string> = {}
const dispatchEvent = vi.fn()
const locationReplace = vi.fn()

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

vi.stubGlobal('window', {
  location: { pathname: '/admin/dashboard', search: '', replace: locationReplace },
  dispatchEvent,
})

describe('api silent refresh', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    store.access_token = 'old-access'
    store.refresh_token = 'refresh-1'
    dispatchEvent.mockClear()
    locationReplace.mockClear()
    vi.resetModules()
  })

  it('refreshes once and retries the original admin request', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls++
      const u = String(url)
      if (u.includes('/auth/refresh')) {
        return new Response(JSON.stringify({
          data: { access_token: 'new-access', refresh_token: 'refresh-2', expires_in: 3600 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (u.includes('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      if (calls === 1) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      }
      expect(store.access_token).toBe('new-access')
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const { api } = await import('./api')
    const result = await api.get<{ data: { ok: boolean } }>('/admin/dashboard')
    expect(result.data.ok).toBe(true)
    expect(store.refresh_token).toBe('refresh-2')
    expect(calls).toBeGreaterThanOrEqual(3)
  })

  it('concurrent 401s: one refresh, one auth clear, one session-expired, both reject', async () => {
    let refreshCalls = 0
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/auth/refresh')) {
        refreshCalls++
        await new Promise((r) => setTimeout(r, 20))
        return new Response(JSON.stringify({ error: 'invalid' }), { status: 401 })
      }
      if (u.includes('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { api, ApiRequestError } = await import('./api')
    const { AUTH_SESSION_EXPIRED_EVENT } = await import('./authStorage')

    const p1 = api.get('/admin/a')
    const p2 = api.get('/admin/b')
    const results = await Promise.allSettled([p1, p2])

    expect(refreshCalls).toBe(1)
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    expect(results.every((r) => r.status === 'rejected' && r.reason instanceof ApiRequestError)).toBe(true)
    expect(store.access_token).toBeUndefined()
    expect(store.refresh_token).toBeUndefined()

    const expiredEvents = dispatchEvent.mock.calls.filter(
      (c) => c[0] instanceof Event && c[0].type === AUTH_SESSION_EXPIRED_EVENT,
    )
    expect(expiredEvents).toHaveLength(1)
  })

  it('concurrent 401s with successful refresh: one refresh, both retries succeed', async () => {
    let refreshCalls = 0
    const seenAdmin: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/auth/refresh')) {
        refreshCalls++
        await new Promise((r) => setTimeout(r, 15))
        return new Response(JSON.stringify({
          data: { access_token: 'new-access', refresh_token: 'refresh-2', expires_in: 3600 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (u.includes('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      const auth = String((init?.headers as Record<string, string>)?.Authorization ?? '')
      if (auth.includes('old-access')) {
        seenAdmin.push(u)
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      }
      return new Response(JSON.stringify({ data: { ok: true, url: u } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const { api } = await import('./api')
    const [a, b] = await Promise.all([
      api.get<{ data: { ok: boolean } }>('/admin/a'),
      api.get<{ data: { ok: boolean } }>('/admin/b'),
    ])
    expect(a.data.ok).toBe(true)
    expect(b.data.ok).toBe(true)
    expect(refreshCalls).toBe(1)
    expect(store.access_token).toBe('new-access')
  })

  it('failed refresh clears auth once (single request)', async () => {
    let refreshCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/auth/refresh')) {
        refreshCalls++
        return new Response(JSON.stringify({ error: 'dead' }), { status: 401 })
      }
      if (u.includes('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }))

    const { api } = await import('./api')
    const { AUTH_SESSION_EXPIRED_EVENT } = await import('./authStorage')
    await expect(api.get('/admin/x')).rejects.toBeTruthy()
    expect(refreshCalls).toBe(1)
    expect(store.access_token).toBeUndefined()
    const expiredEvents = dispatchEvent.mock.calls.filter(
      (c) => c[0] instanceof Event && c[0].type === AUTH_SESSION_EXPIRED_EVENT,
    )
    expect(expiredEvents).toHaveLength(1)
  })

  it('auth/me 401: refresh then clear session without admin redirect on public path', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '', replace: locationReplace },
      writable: true,
      configurable: true,
    })
    let refreshCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/auth/refresh')) {
        refreshCalls++
        return new Response(JSON.stringify({ error: 'invalid' }), { status: 401 })
      }
      if (u.includes('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }))

    const { api } = await import('./api')
    const { AUTH_SESSION_EXPIRED_EVENT } = await import('./authStorage')
    await expect(api.get('/auth/me', { silent: true })).rejects.toBeTruthy()
    expect(refreshCalls).toBe(1)
    expect(store.access_token).toBeUndefined()
    expect(store.refresh_token).toBeUndefined()
    const expiredEvents = dispatchEvent.mock.calls.filter(
      (c) => c[0] instanceof Event && c[0].type === AUTH_SESSION_EXPIRED_EVENT,
    )
    expect(expiredEvents).toHaveLength(1)
    expect(locationReplace).not.toHaveBeenCalled()
  })

  it('auth/me recovers via silent refresh', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '', replace: locationReplace },
      writable: true,
      configurable: true,
    })
    let meCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/auth/refresh')) {
        return new Response(JSON.stringify({
          data: { access_token: 'new-access', refresh_token: 'refresh-2', expires_in: 3600 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      meCalls++
      if (meCalls === 1) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      }
      return new Response(JSON.stringify({ data: { name: 'Admin', role: 'admin', capabilities: ['dashboard.view'] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const { api } = await import('./api')
    const result = await api.get<{ data: { name: string } }>('/auth/me', { silent: true })
    expect(result.data.name).toBe('Admin')
    expect(store.access_token).toBe('new-access')
    expect(locationReplace).not.toHaveBeenCalled()
  })

  it('does not silent-refresh /auth/refresh itself', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { api } = await import('./api')
    // Force path through admin branch would not apply; call refresh path directly.
    // request() only silent-refreshes admin paths — /auth/refresh must never nest refresh.
    await expect(api.post('/auth/refresh', { refresh_token: 'x' })).rejects.toBeTruthy()
    const refreshUrls = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/auth/refresh'))
    // Only the original POST — no nested silent refresh
    expect(refreshUrls).toHaveLength(1)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('does not silent-refresh login requests', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { api } = await import('./api')
    await expect(api.post('/auth/login', { email: 'a', password: 'b' })).rejects.toBeTruthy()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.every((u) => !u.endsWith('/auth/refresh') || u.includes('/auth/login'))).toBe(true)
    expect(urls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(0)
  })
})
