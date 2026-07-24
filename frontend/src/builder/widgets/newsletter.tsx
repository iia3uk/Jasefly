import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { registerWidget } from '@/builder/registry'

function NewsletterSignup({ settings = {}, editMode }: { settings?: Record<string, unknown>; editMode?: boolean }) {
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true); setStatus('')
    try {
      await api.post('/newsletter/subscribe', {
        email: String(form.get('email') || ''), name: String(form.get('name') || ''),
        list_id: Number(settings.list_id || 0) || null, source: 'widget',
      })
      setStatus(String(settings.success_text || 'Проверьте почту для подтверждения подписки.'))
      event.currentTarget.reset()
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Не удалось подписаться') }
    finally { setPending(false) }
  }
  return <div className="mx-auto max-w-xl rounded-[var(--radius)] border border-[var(--border)] p-5">
    <h2 className="font-heading text-2xl">{String(settings.title || 'Подпишитесь на рассылку')}</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">{String(settings.description || 'Новости и полезные материалы без спама.')}</p>
    <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
      {settings.show_name ? <input name="name" className="min-w-40 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" placeholder="Имя" /> : null}
      <input name="email" type="email" required className="min-w-56 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" placeholder="Email" />
      <button className="button" disabled={pending || editMode}>{pending ? 'Отправка…' : String(settings.button_text || 'Подписаться')}</button>
    </form>{status ? <p className="mt-2 text-sm text-[var(--muted)]">{status}</p> : null}
  </div>
}

export function registerNewsletterWidgets() {
  registerWidget({
    type: 'newsletter-signup', label: 'Подписка на рассылку', category: 'basic', plugin: 'newsletter',
    defaultSettings: { title: 'Подпишитесь на рассылку', description: 'Новости и полезные материалы без спама.',
      button_text: 'Подписаться', success_text: 'Проверьте почту для подтверждения подписки.', list_id: '', show_name: false },
    settingsFields: [
      { key: 'title', label: 'Заголовок', type: 'text' }, { key: 'description', label: 'Описание', type: 'textarea' },
      { key: 'button_text', label: 'Текст кнопки', type: 'text' }, { key: 'success_text', label: 'Успешная отправка', type: 'text' },
      { key: 'list_id', label: 'ID списка', type: 'number' }, { key: 'show_name', label: 'Показывать поле имени', type: 'toggle' },
    ],
    Render: NewsletterSignup,
  })
}
