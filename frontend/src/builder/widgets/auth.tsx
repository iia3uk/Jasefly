import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { registerWidget } from '@/builder/registry'
import { useAuth, STAFF_ROLES } from '@/context/AuthContext'
import { Button, Skeleton } from '@/components/ui'
import { endpoints } from '@/lib/api'
import { t } from '@/admin/i18n'
import { adminUrl, isAdminPathname } from '@/admin/adminBasePath'

/** Виджет формы входа в админку (email/пароль + 2FA) для шаблона admin-login. */
function AuthLoginRender({ settings }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const { login, verify2fa } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const title = String(settings.title || t.signInTitle)
  const subtitle = String(settings.subtitle || '')

  const goAfterLogin = () => {
    const r = localStorage.getItem('user_role') || ''
    if (!STAFF_ROLES.has(r)) {
      navigate('/')
      return
    }
    const next = new URLSearchParams(window.location.search).get('next')
    const nextPath = next?.split('?')[0] || ''
    const dest = next && isAdminPathname(nextPath) && !nextPath.endsWith('/login')
      ? next
      : adminUrl()
    navigate(dest)
  }

  const goBack = () => {
    setChallenge(null)
    setOtp('')
    setPassword('')
    setError('')
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-black/20 p-6">
      {challenge ? (
        <form
          key="auth-2fa"
          className="space-y-4"
          autoComplete="off"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await verify2fa(challenge, otp.trim())
              setOtp('')
              goAfterLogin()
            } catch (x) {
              setOtp('')
              setError(x instanceof Error ? x.message : t.unableToSignIn)
            }
          }}
        >
          <h2 className="font-heading text-2xl">{t.twoFactorTitle}</h2>
          <p className="text-sm text-zinc-400">{t.twoFactorHint}</p>
          <div aria-hidden className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
            <input type="text" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} />
            <input type="password" name="password" autoComplete="current-password" value="" readOnly tabIndex={-1} />
          </div>
          <input
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t.twoFactorCode}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 tracking-widest"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button className="w-full" type="submit">{t.signIn}</Button>
          <button type="button" className="w-full text-sm text-zinc-500 underline" onClick={goBack}>
            {t.twoFactorBack}
          </button>
        </form>
      ) : (
        <form
          key="auth-password"
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              const result = await login(email, password)
              setPassword('')
              if (result.requires_2fa) {
                setOtp('')
                setChallenge(result.challenge_token)
                setError('')
                return
              }
              goAfterLogin()
            } catch (x) {
              setPassword('')
              setError(x instanceof Error ? x.message : t.unableToSignIn)
            }
          }}
        >
          <h2 className="font-heading text-2xl">{title}</h2>
          {subtitle && <p className="text-sm text-zinc-400">{subtitle}</p>}
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.email}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          />
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.password}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button className="w-full" type="submit">{t.signIn}</Button>
        </form>
      )}
    </div>
  )
}

function AuthRegisterRender({ settings }: { settings: Record<string, unknown>; editMode?: boolean }) {
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const title = String(settings.title || 'Создать аккаунт')
  const subtitle = String(settings.subtitle || '')
  const { data: config, isLoading } = useQuery({
    queryKey: ['registration-config'],
    queryFn: () => endpoints.registrationConfig(),
  })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [terms, setTerms] = useState(false)
  const [website, setWebsite] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [pending, setPending] = useState(false)

  if (isLoading || !config) {
    return <Skeleton className="mx-auto h-72 max-w-md" />
  }
  if (!config.enabled) {
    return (
      <div className="mx-auto w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-black/20 p-6">
        <h2 className="font-heading text-2xl">{title}</h2>
        <p className="text-sm text-zinc-400">{config.closed_message}</p>
      </div>
    )
  }

  return (
    <form
      className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-black/20 p-6"
      onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        setInfo('')
        setPending(true)
        try {
          const result = await endpoints.register({
            email,
            password,
            name: config.require_name ? name : name || undefined,
            password_confirm: password2,
            terms_accepted: terms,
            website,
          })
          if (result.access_token) {
            acceptSession(result)
            const role = result.user?.role ?? ''
            const redirect = 'redirect' in result ? String(result.redirect || '') : ''
            navigate(redirect || (STAFF_ROLES.has(role) ? adminUrl() : '/'))
            return
          }
          setInfo(('message' in result && result.message) ? String(result.message) : config.success_message)
        } catch (x) {
          setError(x instanceof Error ? x.message : 'Ошибка регистрации')
        } finally {
          setPending(false)
        }
      }}
    >
      <h2 className="font-heading text-2xl">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-400">{subtitle}</p>}
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
      {config.require_name && (
        <input required name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" />
      )}
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" />
      <input required type="password" minLength={config.min_password_length} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" />
      {config.require_password_confirm && (
        <input required type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="Повторите пароль" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" />
      )}
      {config.terms_required && (
        <label className="flex gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required className="mt-1" />
          <span>{config.terms_label}</span>
        </label>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-emerald-400">{info}</p>}
      <Button className="w-full" type="submit" disabled={pending}>{pending ? '…' : 'Зарегистрироваться'}</Button>
      {config.show_login_link && (
        <p className="text-center text-sm text-zinc-500">
          <Link to={config.login_path || adminUrl('/login')} className="underline">Войти</Link>
        </p>
      )}
    </form>
  )
}

export function registerAuthWidgets() {
  registerWidget({
    type: 'auth-login',
    label: 'Форма входа (админка)',
    category: 'system',
    defaultSettings: {
      title: 'Вход в админку',
      subtitle: 'Email и пароль администратора',
    },
    settingsFields: [
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'text' },
    ],
    Render: AuthLoginRender,
  })

  registerWidget({
    type: 'auth-register',
    label: 'Форма регистрации',
    category: 'system',
    plugin: 'registration',
    defaultSettings: {
      title: 'Создать аккаунт',
      subtitle: 'Email и пароль',
    },
    settingsFields: [
      { key: 'title', label: 'Заголовок', type: 'text' },
      { key: 'subtitle', label: 'Подзаголовок', type: 'text' },
    ],
    Render: AuthRegisterRender,
  })
}
