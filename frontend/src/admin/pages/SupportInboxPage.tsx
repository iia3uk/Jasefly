import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Loader2, MessageCircle, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { adminUrl } from '@/admin/adminBasePath'
import { playSupportSound, unlockSupportSound } from '@/lib/supportNotifySound'

type Ticket = {
  id: number
  public_id: string
  status: string
  contact_email?: string | null
  contact_social?: string | null
  contact_social_type?: string | null
  page_url?: string | null
  last_body?: string | null
  last_message_at?: string | null
  updated_at?: string | null
  assigned_user_id?: number | null
}

type ChatMessage = {
  id: number
  sender: string
  body: string
  created_at?: string | null
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт',
  awaiting_contact: 'Ждёт контакт',
  waiting_agent: 'Ждёт агента',
  bot: 'Бот',
  closed: 'Закрыт',
}

export function SupportInboxPage() {
  return (
    <RequirePermission permission="support.agent">
      <SupportInboxInner />
    </RequirePermission>
  )
}

function SupportInboxInner() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const primedListRef = useRef(false)
  const knownTicketsRef = useRef<Map<number, string>>(new Map())
  const primedDetailRef = useRef(false)
  const lastMsgIdRef = useRef(0)
  const selectedIdRef = useRef<number | null>(null)
  selectedIdRef.current = selectedId

  // Unlock audio on first interaction with inbox
  useEffect(() => {
    const unlock = () => unlockSupportSound()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Agent heartbeat while inbox is open
  useEffect(() => {
    const beat = () => {
      void api.post('/admin/support/presence', {}).catch(() => {})
    }
    beat()
    const id = window.setInterval(beat, 20000)
    return () => window.clearInterval(id)
  }, [])

  const tickets = useQuery({
    queryKey: ['admin', 'support', 'tickets', status],
    queryFn: async () => {
      const q = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`
      return asData<Ticket[]>(await api.get(`/admin/support/tickets${q}`))
    },
    refetchInterval: 5000,
  })

  // New ticket / new activity in list → agent ping
  useEffect(() => {
    const rows = tickets.data
    if (!rows) return
    const map = knownTicketsRef.current
    if (!primedListRef.current) {
      for (const t of rows) {
        map.set(t.id, `${t.updated_at ?? ''}|${t.last_message_at ?? ''}|${t.last_body ?? ''}`)
      }
      primedListRef.current = true
      return
    }
    let ping = false
    for (const t of rows) {
      const sig = `${t.updated_at ?? ''}|${t.last_message_at ?? ''}|${t.last_body ?? ''}`
      const prev = map.get(t.id)
      if (prev === undefined) {
        ping = true
      } else if (prev !== sig && t.id !== selectedIdRef.current) {
        // Activity on another ticket (or list preview changed)
        ping = true
      }
      map.set(t.id, sig)
    }
    if (ping) playSupportSound('agent')
  }, [tickets.data])

  const detail = useQuery({
    queryKey: ['admin', 'support', 'ticket', selectedId],
    enabled: selectedId != null,
    queryFn: async () =>
      asData<{ ticket: Ticket; messages: ChatMessage[] }>(
        await api.get(`/admin/support/tickets/${selectedId}`),
      ),
    refetchInterval: 2500,
  })

  // Reset detail prime when switching tickets
  useEffect(() => {
    primedDetailRef.current = false
    lastMsgIdRef.current = 0
  }, [selectedId])

  useEffect(() => {
    const msgs = detail.data?.messages
    if (!msgs) return
    const maxId = msgs.reduce((m, x) => Math.max(m, x.id), 0)
    if (!primedDetailRef.current) {
      lastMsgIdRef.current = maxId
      primedDetailRef.current = true
      return
    }
    const fresh = msgs.filter((m) => m.id > lastMsgIdRef.current)
    lastMsgIdRef.current = maxId
    if (fresh.some((m) => m.sender === 'visitor')) {
      playSupportSound('agent')
    }
  }, [detail.data?.messages])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [detail.data?.messages?.length])

  const reply = useMutation({
    mutationFn: async () => {
      if (!selectedId || !draft.trim()) return
      await api.post(`/admin/support/tickets/${selectedId}/messages`, { body: draft.trim() })
    },
    onSuccess: async () => {
      setDraft('')
      await qc.invalidateQueries({ queryKey: ['admin', 'support', 'ticket', selectedId] })
      await qc.invalidateQueries({ queryKey: ['admin', 'support', 'tickets'] })
    },
  })

  const closeTicket = useMutation({
    mutationFn: async () => {
      if (!selectedId) return
      await api.post(`/admin/support/tickets/${selectedId}/close`, {})
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'support'] })
    },
  })

  const assignMe = useMutation({
    mutationFn: async () => {
      if (!selectedId) return
      await api.post(`/admin/support/tickets/${selectedId}/assign`, {})
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'support'] })
    },
  })

  const rows = tickets.data ?? []
  const msgs = detail.data?.messages ?? []
  const ticket = detail.data?.ticket

  const statusFilters = useMemo(
    () => ['all', 'waiting_agent', 'open', 'bot', 'awaiting_contact', 'closed'],
    [],
  )

  return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl text-white">Поддержка</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Inbox тикетов. Пока страница открыта — вы «онлайн». Звук при новых сообщениях посетителя.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="text-sm text-zinc-300 underline hover:text-white"
            onClick={() => {
              void api.post('/admin/support/test-telegram', {}).then(() => {
                window.alert('Тест отправлен в Telegram (если настроен бот в Support или Почте).')
              }).catch((e: unknown) => {
                const msg = e && typeof e === 'object' && 'message' in e
                  ? String((e as { message: string }).message)
                  : 'Не удалось'
                window.alert(msg)
              })
            }}
          >
            Тест Telegram
          </button>
          <Link to={adminUrl('support/faq')} className="text-sm text-zinc-300 underline hover:text-white">
            FAQ бота
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusFilters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs ${
              status === s ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {s === 'all' ? 'Все' : STATUS_LABEL[s] || s}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <GlassPanel className="max-h-[70vh] overflow-y-auto p-2">
          {tickets.isLoading ? <Skeleton className="h-40" /> : null}
          {!tickets.isLoading && !rows.length ? (
            <p className="p-4 text-sm text-zinc-500">Пока нет тикетов</p>
          ) : null}
          {rows.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`mb-1 w-full rounded-xl px-3 py-2 text-left transition ${
                selectedId === t.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-zinc-400">{t.public_id.slice(0, 8)}</span>
                <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                  {STATUS_LABEL[t.status] || t.status}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-200">{t.last_body || '—'}</p>
            </button>
          ))}
        </GlassPanel>

        <GlassPanel className="flex max-h-[70vh] flex-col p-0">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-zinc-500">
              <MessageCircle className="h-8 w-8" />
              <p className="text-sm">Выберите тикет</p>
            </div>
          ) : detail.isLoading ? (
            <div className="p-6"><Skeleton className="h-48" /></div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-zinc-400">{ticket?.public_id}</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    {ticket?.contact_email || (ticket?.contact_social
                      ? `${ticket.contact_social_type}: ${ticket.contact_social}`
                      : 'Без контакта')}
                  </div>
                  {ticket?.page_url ? (
                    <a href={ticket.page_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-emerald-400/80">
                      {ticket.page_url}
                    </a>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <GhostButton type="button" onClick={() => assignMe.mutate()} disabled={assignMe.isPending}>
                    На себя
                  </GhostButton>
                  <GhostButton type="button" onClick={() => closeTicket.mutate()} disabled={closeTicket.isPending}>
                    Закрыть
                  </GhostButton>
                </div>
              </div>
              <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {msgs.map((m) => {
                  const agent = m.sender === 'agent'
                  return (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        agent
                          ? 'ml-auto bg-emerald-700/70 text-white'
                          : m.sender === 'visitor'
                            ? 'bg-zinc-800 text-zinc-100'
                            : 'mx-auto bg-zinc-900 text-center text-xs text-zinc-500'
                      }`}
                    >
                      <div className="mb-0.5 text-[10px] uppercase opacity-60">{m.sender}</div>
                      {m.body}
                    </div>
                  )
                })}
              </div>
              {ticket?.status !== 'closed' ? (
                <div className="flex gap-2 border-t border-zinc-800 p-3">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        reply.mutate()
                      }
                    }}
                    placeholder="Ответ посетителю…"
                  />
                  <Button type="button" onClick={() => reply.mutate()} disabled={reply.isPending || !draft.trim()}>
                    {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  )
}
