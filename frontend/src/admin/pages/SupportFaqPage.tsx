import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, Field, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { adminUrl } from '@/admin/adminBasePath'
import { usePluginEnabled } from '@/hooks/useApi'

type FaqItem = {
  id: number
  question: string
  answer: string
  keywords?: string | null
  sort_order?: number
  is_active?: number | boolean
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

export function SupportFaqPage() {
  return (
    <RequirePermission permission="support.manage">
      <SupportFaqInner />
    </RequirePermission>
  )
}

function SupportFaqInner() {
  const qc = useQueryClient()
  const pluginOn = usePluginEnabled('support')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [keywords, setKeywords] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editQ, setEditQ] = useState('')
  const [editA, setEditA] = useState('')
  const [editK, setEditK] = useState('')

  const list = useQuery({
    queryKey: ['admin', 'support', 'faq'],
    enabled: pluginOn,
    queryFn: async () => asData<FaqItem[]>(await api.get('/admin/support/faq')),
  })

  const create = useMutation({
    mutationFn: async () => {
      await api.post('/admin/support/faq', { question, answer, keywords })
    },
    onSuccess: async () => {
      setQuestion('')
      setAnswer('')
      setKeywords('')
      await qc.invalidateQueries({ queryKey: ['admin', 'support', 'faq'] })
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      if (editId == null) return
      await api.put(`/admin/support/faq/${editId}`, {
        question: editQ,
        answer: editA,
        keywords: editK,
      })
    },
    onSuccess: async () => {
      setEditId(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'support', 'faq'] })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/support/faq/${id}`)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'support', 'faq'] })
    },
  })

  const toggle = useMutation({
    mutationFn: async (item: FaqItem) => {
      await api.put(`/admin/support/faq/${item.id}`, {
        is_active: !(item.is_active === 1 || item.is_active === true),
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'support', 'faq'] })
    },
  })

  const startEdit = (item: FaqItem) => {
    setEditId(item.id)
    setEditQ(item.question)
    setEditA(item.answer)
    setEditK(item.keywords || '')
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        title="FAQ бота поддержки"
        hint="Если агентов нет онлайн, бот ищет ответ по ключевым словам. Сиды помечены «БАЗОВЫЙ ОТВЕТ» — правьте под себя."
        eyebrow="Коммуникации"
        accent="emerald"
        actions={
          <Link to={adminUrl('support')} className="text-sm text-zinc-300 underline hover:text-white">
            ← Inbox
          </Link>
        }
      />

      <GlassPanel className="space-y-3 p-5">
        <h2 className="text-sm font-medium text-white">Новая запись</h2>
        <Field label="Вопрос">
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </Field>
        <Field label="Ответ">
          <textarea
            className="min-h-[100px] w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </Field>
        <Field label="Ключевые слова (через запятую)">
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="доставка, оплата, возврат"
          />
        </Field>
        <Button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || !question.trim() || !answer.trim()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="ml-2">Добавить</span>
        </Button>
      </GlassPanel>

      <div className="space-y-3">
        {list.isLoading ? <Skeleton className="h-24" /> : null}
        {(list.data ?? []).map((item) => {
          const active = item.is_active === 1 || item.is_active === true
          const editing = editId === item.id
          return (
            <GlassPanel key={item.id} className="p-4">
              {editing ? (
                <div className="space-y-3">
                  <Field label="Вопрос">
                    <input
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                      value={editQ}
                      onChange={(e) => setEditQ(e.target.value)}
                    />
                  </Field>
                  <Field label="Ответ">
                    <textarea
                      className="min-h-[120px] w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                      value={editA}
                      onChange={(e) => setEditA(e.target.value)}
                    />
                  </Field>
                  <Field label="Ключевые слова">
                    <input
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                      value={editK}
                      onChange={(e) => setEditK(e.target.value)}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || !editQ.trim() || !editA.trim()}>
                      {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      <span className={save.isPending ? 'ml-2' : ''}>Сохранить</span>
                    </Button>
                    <GhostButton type="button" onClick={() => setEditId(null)}>Отмена</GhostButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-white">{item.question}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{item.answer}</p>
                    {item.keywords ? (
                      <p className="mt-2 text-xs text-zinc-500">Ключи: {item.keywords}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <GhostButton type="button" onClick={() => startEdit(item)} title="Редактировать">
                      <Pencil className="h-4 w-4" />
                    </GhostButton>
                    <GhostButton type="button" onClick={() => toggle.mutate(item)}>
                      {active ? 'Выкл' : 'Вкл'}
                    </GhostButton>
                    <GhostButton type="button" onClick={() => remove.mutate(item.id)} disabled={remove.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </GhostButton>
                  </div>
                </div>
              )}
            </GlassPanel>
          )
        })}
        {!list.isLoading && !(list.data ?? []).length ? (
          <p className="text-sm text-zinc-500">Пока нет FAQ — бот будет отдавать запасной текст из настроек плагина.</p>
        ) : null}
      </div>
    </div>
  )
}
