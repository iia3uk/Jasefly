import { useEffect, useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { registerWidget } from '@/builder/registry'

type CommentRow = { id: number; author_name: string; body: string; rating?: number; verified_purchase?: number; created_at: string }
type Payload = { items: CommentRow[]; rating: { count: number; average: number; distribution: Record<number, number> } }
type Props = { settings?: Record<string, unknown>; editMode?: boolean }
const unpack = <T,>(value: { data?: T } | T): T => value && typeof value === 'object' && 'data' in value ? (value as { data: T }).data : value as T

function useComments(settings: Record<string, unknown>, type?: 'comment' | 'review') {
  const [data, setData] = useState<Payload>({ items: [], rating: { count: 0, average: 0, distribution: {} } })
  const targetType = String(settings.target_type || 'page')
  const targetId = Number(settings.target_id || 0)
  useEffect(() => {
    if (!targetId) return
    const query = new URLSearchParams({ target_type: targetType, target_id: String(targetId) })
    if (type) query.set('type', type)
    api.get<{ data: Payload }>(`/comments?${query}`).then((res) => setData(unpack(res))).catch(() => setData({ items: [], rating: { count: 0, average: 0, distribution: {} } }))
  }, [targetId, targetType, type])
  return data
}

function CommentList({ settings = {}, type = 'comment' }: Props & { type?: 'comment' | 'review' }) {
  const data = useComments(settings, type)
  return <section className="mx-auto max-w-3xl">
    <h2 className="font-heading text-2xl">{String(settings.title || (type === 'review' ? 'Отзывы' : 'Комментарии'))}</h2>
    {!data.items.length ? <p className="mt-3 text-sm text-[var(--muted)]">Пока нет публикаций.</p> : null}
    <div className="mt-4 space-y-3">{data.items.map((row) => <article key={row.id} className="rounded-[var(--radius)] border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center gap-2"><strong>{row.author_name}</strong>
        {row.rating ? <span aria-label={`${row.rating} из 5`} className="text-amber-400">{'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}</span> : null}
        {row.verified_purchase ? <span className="text-xs text-emerald-500">Покупка подтверждена</span> : null}</div>
      <p className="mt-2 whitespace-pre-wrap">{row.body}</p><time className="mt-2 block text-xs text-[var(--muted)]">{row.created_at}</time>
    </article>)}</div>
  </section>
}

function RatingSummary({ settings = {} }: Props) {
  const { rating } = useComments(settings, 'review')
  return <div className="mx-auto max-w-md rounded-[var(--radius)] border border-[var(--border)] p-5 text-center">
    <div className="font-heading text-4xl">{rating.average.toFixed(1)}</div>
    <div className="text-xl text-amber-400">★★★★★</div>
    <p className="text-sm text-[var(--muted)]">{rating.count} отзывов</p>
  </div>
}

function ReviewForm({ settings = {}, editMode }: Props) {
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editMode) return
    const form = new FormData(event.currentTarget)
    setPending(true); setStatus('')
    try {
      await api.post('/comments', {
        type: 'review', target_type: String(settings.target_type || 'product'), target_id: Number(settings.target_id || 0),
        author_name: String(form.get('name') || ''), author_email: String(form.get('email') || ''),
        rating: Number(form.get('rating') || 5), body: String(form.get('body') || ''),
      })
      setStatus(String(settings.success_text || 'Спасибо! Отзыв отправлен на модерацию.'))
      event.currentTarget.reset()
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Не удалось отправить отзыв') }
    finally { setPending(false) }
  }
  return <form onSubmit={submit} className="mx-auto max-w-xl space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-5">
    <h2 className="font-heading text-2xl">{String(settings.title || 'Оставить отзыв')}</h2>
    <div className="grid gap-3 sm:grid-cols-2"><input name="name" required placeholder="Имя" className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" />
      <input name="email" type="email" placeholder="Email" className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" /></div>
    <select name="rating" className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2">{[5,4,3,2,1].map((n) => <option key={n} value={n}>{n} из 5</option>)}</select>
    <textarea name="body" required rows={4} placeholder="Ваш отзыв" className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" />
    <button className="button" disabled={pending || editMode}>{pending ? 'Отправка…' : 'Отправить'}</button>
    {status ? <p className="text-sm text-[var(--muted)]">{status}</p> : null}
  </form>
}

const fields = [
  { key: 'title', label: 'Заголовок', type: 'text' as const },
  { key: 'target_type', label: 'Тип объекта', type: 'text' as const },
  { key: 'target_id', label: 'ID объекта', type: 'number' as const },
]

export function registerCommentWidgets() {
  registerWidget({ type: 'comments', label: 'Комментарии', category: 'content', plugin: 'comments', defaultSettings: { title: 'Комментарии', target_type: 'page', target_id: '' }, settingsFields: fields, Render: (props) => <CommentList {...props} type="comment" /> })
  registerWidget({ type: 'reviews', label: 'Отзывы', category: 'content', plugin: 'comments', defaultSettings: { title: 'Отзывы', target_type: 'product', target_id: '' }, settingsFields: fields, Render: (props) => <CommentList {...props} type="review" /> })
  registerWidget({ type: 'rating-summary', label: 'Рейтинг', category: 'content', plugin: 'comments', defaultSettings: { target_type: 'product', target_id: '' }, settingsFields: fields.slice(1), Render: RatingSummary })
  registerWidget({ type: 'review-form', label: 'Форма отзыва', category: 'content', plugin: 'comments', defaultSettings: { title: 'Оставить отзыв', target_type: 'product', target_id: '', success_text: 'Спасибо! Отзыв отправлен на модерацию.' }, settingsFields: [...fields, { key: 'success_text', label: 'Сообщение успеха', type: 'text' }], Render: ReviewForm })
}
