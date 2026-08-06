import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X, Loader2 } from 'lucide-react'
import { useSiteContext } from '@/context/SiteContext'
import { siteHasPlugin } from '@/core/pluginGates'
import { api } from '@/lib/api'
import { playSupportSound, unlockSupportSound } from '@/lib/supportNotifySound'

const VISITOR_KEY = 'site.support.visitor_key'
const TICKET_KEY = 'site.support.ticket_id'
const COOKIE = 'jasefly_support_vk'

type SupportConfig = {
  widget_enabled?: boolean
  position?: string
  title?: string
  greeting?: string
  require_contact_on_leave?: boolean
  social_types?: string[]
  agents_online?: boolean
  poll_interval_ms?: number
  faq?: Array<{ id: number; question: string }>
}

type Ticket = {
  id: number
  public_id: string
  status: string
  needs_contact?: boolean
  has_contact?: boolean
  contact_email?: string | null
  updated_at?: string | null
}

type ChatMessage = {
  id: number
  sender: string
  body: string
  created_at?: string | null
}

function positionClass(pos: string): string {
  const fabBottom = 'bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+var(--cms-fab-lift,0px)))]'
  return pos === 'bottom-right'
    ? `right-[max(1rem,env(safe-area-inset-right,0px))] ${fabBottom} sm:right-6`
    : `left-[max(1rem,env(safe-area-inset-left,0px))] ${fabBottom} sm:left-6`
}

function readCookie(name: string): string {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&') + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : ''
  } catch {
    return ''
  }
}

function writeCookie(name: string, value: string) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${86400 * 365};SameSite=Lax`
  } catch {
    /* ignore */
  }
}

function readLs(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function writeLs(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function persistVisitorKey(key: string) {
  writeLs(VISITOR_KEY, key)
  writeCookie(COOKIE, key)
}

function readStoredVisitorKey(): string {
  return readLs(VISITOR_KEY) || readCookie(COOKIE) || ''
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

const SOCIAL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  vk: 'VK',
  whatsapp: 'WhatsApp',
  max: 'Max',
  discord: 'Discord',
}

/**
 * Floating live-chat widget (HTTP polling). Mount in SiteLayout.
 * Session = stable visitor_key (localStorage + cookie); history restored via GET /support/active.
 */
export function SupportWidget() {
  const { site } = useSiteContext()
  // Fail-closed until /site.enabled_plugins hydrates (siteHasPlugin is fail-closed on undefined).
  const enabledPlugin =
    Array.isArray(site?.enabled_plugins) && siteHasPlugin(site.enabled_plugins, 'support')

  const [cfg, setCfg] = useState<SupportConfig | null>(null)
  const [open, setOpen] = useState(false)
  const [visitorKey, setVisitorKey] = useState(() => readStoredVisitorKey())
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showContact, setShowContact] = useState(false)
  const [email, setEmail] = useState('')
  const [socialType, setSocialType] = useState('telegram')
  const [social, setSocial] = useState('')
  const [agentsOnline, setAgentsOnline] = useState(false)
  const [unread, setUnread] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const lastIdRef = useRef(0)
  const openRef = useRef(false)
  const pathnameRef = useRef(typeof window !== 'undefined' ? window.location.pathname : '/')
  openRef.current = open

  useEffect(() => {
    if (!enabledPlugin) return
    let cancelled = false
    ;(async () => {
      try {
        const data = asData<SupportConfig>(await api.get('/support/config'))
        if (!cancelled) {
          setCfg(data)
          setAgentsOnline(!!data.agents_online)
          const types = data.social_types || ['telegram']
          setSocialType(types[0] || 'telegram')
        }
      } catch {
        if (!cancelled) setCfg({ widget_enabled: false })
      }
    })()
    return () => { cancelled = true }
  }, [enabledPlugin])

  const ensureSession = useCallback(async (): Promise<string> => {
    let key = visitorKey || readStoredVisitorKey()
    try {
      const data = asData<{ visitor_key: string }>(
        await api.post('/support/session', key ? { visitor_key: key } : {}),
      )
      key = data.visitor_key || key
    } catch {
      if (!key) {
        key = Array.from(crypto.getRandomValues(new Uint8Array(24)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      }
    }
    persistVisitorKey(key)
    setVisitorKey(key)
    return key
  }, [visitorKey])

  const scrollBottom = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    })
  }

  const applyHistory = useCallback((
    t: Ticket,
    msgs: ChatMessage[],
    opts?: { notify?: boolean; agents?: boolean },
  ) => {
    setTicket(t)
    writeLs(TICKET_KEY, t.public_id)
    if (t.needs_contact) setShowContact(true)
    const shouldNotify = opts?.notify === true
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id))
      const fresh = msgs.filter((m) => !known.has(m.id))
      if (shouldNotify && fresh.some((m) => m.sender === 'agent' || m.sender === 'bot')) {
        playSupportSound('visitor')
        if (!openRef.current) setUnread(true)
      }
      const map = new Map(prev.map((m) => [m.id, m]))
      for (const m of msgs) map.set(m.id, m)
      const next = [...map.values()].sort((a, b) => a.id - b.id)
      lastIdRef.current = next.length ? next[next.length - 1].id : 0
      return next
    })
    if (typeof opts?.agents === 'boolean') setAgentsOnline(opts.agents)
    scrollBottom()
  }, [])

  // Restore active chat by visitor hash once config is ready.
  useEffect(() => {
    if (!cfg?.widget_enabled) return
    let cancelled = false
    ;(async () => {
      setLoadingHistory(true)
      try {
        const key = await ensureSession()
        if (cancelled) return
        const pack = asData<{
          ticket: Ticket
          messages: ChatMessage[]
          agents_online?: boolean
        } | null>(await api.get(`/support/active?visitor_key=${encodeURIComponent(key)}`))
        if (cancelled) return
        if (!pack?.ticket) {
          const pid = readLs(TICKET_KEY)
          if (pid) {
            try {
              const full = asData<{ messages: ChatMessage[]; ticket: Ticket; agents_online?: boolean }>(
                await api.get(`/support/tickets/${pid}/messages?visitor_key=${encodeURIComponent(key)}&after_id=0`),
              )
              if (!cancelled && full.ticket) {
                applyHistory(full.ticket, full.messages || [], { notify: false, agents: !!full.agents_online })
              } else if (!cancelled) {
                writeLs(TICKET_KEY, '')
              }
            } catch {
              writeLs(TICKET_KEY, '')
            }
          }
          return
        }
        applyHistory(pack.ticket, pack.messages || [], { notify: false, agents: !!pack.agents_online })
      } catch {
        /* empty chat for new visitors */
      } finally {
        // Always clear — even if this run was cancelled by a re-render.
        setLoadingHistory(false)
      }
    })()
    return () => { cancelled = true }
    // Only when widget turns on; session helpers via refs would be overkill.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per enable
  }, [cfg?.widget_enabled])

  // Poll while ticket exists (stable interval — do not depend on ticket object)
  useEffect(() => {
    if (!ticket?.public_id || !visitorKey) return
    const publicId = ticket.public_id
    let ms = Math.max(2500, cfg?.poll_interval_ms ?? 3500)
    let timer: number | null = null
    let stopped = false
    let inFlight = false

    const schedule = (delay: number) => {
      if (stopped) return
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(() => { void tick() }, delay)
    }

    const tick = async () => {
      if (stopped || inFlight) {
        schedule(ms)
        return
      }
      inFlight = true
      try {
        const pack = asData<{
          messages?: ChatMessage[]
          ticket?: Ticket | null
          agents_online?: boolean | null
          throttled?: boolean
        }>(
          await api.get(
            `/support/tickets/${publicId}/messages?visitor_key=${encodeURIComponent(visitorKey)}&after_id=${lastIdRef.current}`,
          ),
        )
        if (pack.throttled) {
          ms = Math.min(12000, Math.round(ms * 1.5))
          return
        }
        ms = Math.max(2500, cfg?.poll_interval_ms ?? 3500)
        if (pack.ticket) {
          setTicket((prev) => {
            if (
              prev
              && prev.status === pack.ticket!.status
              && prev.updated_at === (pack.ticket as Ticket & { updated_at?: string }).updated_at
              && prev.needs_contact === pack.ticket!.needs_contact
            ) {
              return prev
            }
            if (pack.ticket!.needs_contact) setShowContact(true)
            return pack.ticket!
          })
        }
        if (pack.messages?.length) {
          applyHistory(pack.ticket || { id: 0, public_id: publicId, status: 'open' }, pack.messages, {
            notify: true,
            agents: !!pack.agents_online,
          })
        } else if (typeof pack.agents_online === 'boolean') {
          setAgentsOnline(pack.agents_online)
        }
      } catch (e: unknown) {
        const status = e && typeof e === 'object' && 'details' in e
          ? (e as { details?: { status?: number } }).details?.status
          : undefined
        if (status === 429) {
          ms = Math.min(15000, Math.round(ms * 2))
        }
      } finally {
        inFlight = false
        schedule(ms)
      }
    }

    schedule(ms)
    return () => {
      stopped = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [ticket?.public_id, visitorKey, cfg?.poll_interval_ms, applyHistory])

  // Leave without contact → gate
  useEffect(() => {
    if (!cfg?.require_contact_on_leave || !ticket?.public_id || !visitorKey) return
    if (ticket.has_contact) return

    const signalLeave = () => {
      const body = JSON.stringify({
        public_id: ticket.public_id,
        visitor_key: visitorKey,
        leaving: true,
      })
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([body], { type: 'application/json' })
          navigator.sendBeacon('/api/v1/support/heartbeat', blob)
        }
      } catch {
        /* ignore */
      }
      void api.post('/support/heartbeat', {
        public_id: ticket.public_id,
        visitor_key: visitorKey,
        leaving: true,
      }).catch(() => {})
      setShowContact(true)
    }

    const onVis = () => {
      if (document.visibilityState === 'hidden') signalLeave()
    }
    window.addEventListener('beforeunload', signalLeave)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', signalLeave)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [cfg?.require_contact_on_leave, ticket?.public_id, ticket?.has_contact, visitorKey])

  const startNewChat = useCallback(() => {
    setTicket(null)
    setMessages([])
    setShowContact(false)
    setError(null)
    setDraft('')
    lastIdRef.current = 0
    writeLs(TICKET_KEY, '')
  }, [])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    unlockSupportSound()
    setSending(true)
    setError(null)
    try {
      const key = await ensureSession()
      const needNew = !ticket || ticket.status === 'closed'
      if (needNew) {
        if (ticket?.status === 'closed') {
          startNewChat()
        }
        const res = asData<{ ticket: Ticket; messages: ChatMessage[] }>(
          await api.post('/support/tickets', {
            visitor_key: key,
            body: text,
            page_url: typeof window !== 'undefined' ? window.location.href : pathnameRef.current,
          }),
        )
        applyHistory(res.ticket, res.messages || [], { notify: false })
        setDraft('')
      } else {
        const res = asData<{ message: ChatMessage; bot_message?: ChatMessage | null; ticket?: Ticket }>(
          await api.post(`/support/tickets/${ticket.public_id}/messages`, {
            visitor_key: key,
            body: text,
          }),
        )
        const extra: ChatMessage[] = []
        if (res.message) extra.push(res.message)
        if (res.bot_message) extra.push(res.bot_message)
        applyHistory(res.ticket || ticket, extra, { notify: false })
        setDraft('')
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Не удалось отправить'
      const code = e && typeof e === 'object' && 'details' in e
        ? (e as { details?: { raw?: { code?: string } } }).details?.raw?.code
        : undefined
      if (code === 'contact_required' || /контакт/i.test(msg)) {
        setShowContact(true)
      }
      // Closed ticket on server → open a fresh one with the same text
      if (/закрыт/i.test(msg)) {
        startNewChat()
        try {
          const key = await ensureSession()
          const res = asData<{ ticket: Ticket; messages: ChatMessage[] }>(
            await api.post('/support/tickets', {
              visitor_key: key,
              body: text,
              page_url: typeof window !== 'undefined' ? window.location.href : pathnameRef.current,
            }),
          )
          applyHistory(res.ticket, res.messages || [], { notify: false })
          setDraft('')
          setError(null)
        } catch (e2: unknown) {
          setError(e2 && typeof e2 === 'object' && 'message' in e2 ? String((e2 as { message: string }).message) : msg)
        }
      } else {
        setError(msg)
      }
    } finally {
      setSending(false)
    }
  }

  const saveContact = async () => {
    if (!ticket || !visitorKey) return
    unlockSupportSound()
    setSending(true)
    setError(null)
    try {
      const t = asData<Ticket>(
        await api.post(`/support/tickets/${ticket.public_id}/contact`, {
          visitor_key: visitorKey,
          email: email.trim() || undefined,
          social: social.trim() || undefined,
          social_type: socialType,
        }),
      )
      setTicket(t)
      setShowContact(false)
    } catch (e: unknown) {
      setError(e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Ошибка контакта')
    } finally {
      setSending(false)
    }
  }

  const askFaq = async (faqId: number) => {
    if (sending || (showContact && !ticket?.has_contact && ticket?.status !== 'closed')) return
    unlockSupportSound()
    setSending(true)
    setError(null)
    try {
      if (ticket?.status === 'closed') {
        startNewChat()
      }
      const key = await ensureSession()
      const res = asData<{ ticket: Ticket; messages: ChatMessage[] }>(
        await api.post(`/support/faq/${faqId}/ask`, {
          visitor_key: key,
          page_url: typeof window !== 'undefined' ? window.location.href : pathnameRef.current,
        }),
      )
      if (res.ticket) {
        applyHistory(res.ticket, res.messages || [], { notify: false })
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Не удалось'
      const code = e && typeof e === 'object' && 'details' in e
        ? (e as { details?: { raw?: { code?: string } } }).details?.raw?.code
        : undefined
      if (code === 'contact_required' || /контакт/i.test(msg)) {
        setShowContact(true)
      }
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  if (!enabledPlugin || !cfg?.widget_enabled) return null

  const pos = positionClass(cfg.position || 'bottom-left')
  const title = cfg.title || 'Поддержка'
  const socialTypes = cfg.social_types || ['telegram', 'vk']
  const ticketClosed = ticket?.status === 'closed'
  const inputBlocked = !ticketClosed && showContact && !ticket?.has_contact
  const faqList = cfg.faq || []
  const showFaqChips = !loadingHistory && !inputBlocked && faqList.length > 0

  return (
    <div className={`support-widget fixed z-[60] ${pos}`} data-no-translate>
      {open ? (
        <div className="mb-3 flex h-[min(420px,70vh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-white">{title}</div>
              <div className="text-[11px] text-zinc-400">
                {agentsOnline ? 'Оператор онлайн' : 'Бот / офлайн'}
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
            {loadingHistory ? (
              <p className="flex items-center gap-2 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Загрузка истории…
              </p>
            ) : null}
            {!loadingHistory && !messages.length ? (
              <p className="text-zinc-400">{cfg.greeting || 'Здравствуйте! Чем можем помочь?'}</p>
            ) : null}
            {messages.map((m) => {
              const mine = m.sender === 'visitor'
              const tone = mine
                ? 'ml-8 bg-emerald-700/80 text-white'
                : m.sender === 'system'
                  ? 'mx-4 bg-zinc-800/80 text-zinc-400 text-center text-xs'
                  : 'mr-8 bg-zinc-800 text-zinc-100'
              return (
                <div key={m.id} className={`rounded-xl px-3 py-2 whitespace-pre-wrap ${tone}`}>
                  {m.body}
                </div>
              )
            })}
            {showFaqChips ? (
              <div className="pt-2">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">
                  Частые вопросы
                </p>
                <div className="flex flex-col gap-1.5">
                  {faqList.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={sending}
                      onClick={() => void askFaq(f.id)}
                      className="rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2 text-left text-sm text-zinc-200 transition hover:border-emerald-600/60 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {f.question}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {ticketClosed ? (
            <div className="space-y-2 border-t border-zinc-800 bg-zinc-900/80 px-3 py-3 text-sm">
              <p className="text-xs text-zinc-400">Диалог закрыт оператором.</p>
              <button
                type="button"
                onClick={() => {
                  unlockSupportSound()
                  startNewChat()
                }}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
              >
                Начать новый диалог
              </button>
            </div>
          ) : null}

          {showContact && !ticketClosed ? (
            <div className="space-y-2 border-t border-amber-900/50 bg-amber-950/40 px-3 py-3 text-sm">
              <p className="text-xs text-amber-100/90">
                Оставьте email или соцсеть, чтобы продолжить и получить ответ офлайн.
              </p>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                  value={socialType}
                  onChange={(e) => setSocialType(e.target.value)}
                >
                  {socialTypes.map((t) => (
                    <option key={t} value={t}>{SOCIAL_LABELS[t] || t}</option>
                  ))}
                </select>
                <input
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  value={social}
                  onChange={(e) => setSocial(e.target.value)}
                  placeholder="@username"
                />
              </div>
              <button
                type="button"
                disabled={sending || (!email.trim() && !social.trim())}
                onClick={() => void saveContact()}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {sending ? 'Сохранение…' : 'Сохранить контакт'}
              </button>
            </div>
          ) : null}

          {error ? <p className="px-3 text-xs text-red-400">{error}</p> : null}
          {!ticketClosed ? (
          <div className="flex gap-2 border-t border-zinc-800 p-3">
            <input
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={inputBlocked ? 'Сначала укажите контакт…' : 'Напишите сообщение…'}
              disabled={sending || inputBlocked}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim() || inputBlocked}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 text-white disabled:opacity-50"
              aria-label="Отправить"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          unlockSupportSound()
          setOpen((v) => !v)
          setUnread(false)
        }}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500"
        aria-label={title}
      >
        {unread ? (
          <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-zinc-950" />
        ) : null}
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  )
}
