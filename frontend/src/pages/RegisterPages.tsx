import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PreferCmsLayout } from '@/builder/public/CmsPages'
import { Button, Container, Skeleton } from '@/components/ui'
import { SeoHead } from '@/components/layout/SiteLayout'
import { useAuth, STAFF_ROLES } from '@/context/AuthContext'
import { endpoints } from '@/lib/api'
import { initBuilderWidgets } from '@/builder/widgets'

initBuilderWidgets()

type RegConfig = Awaited<ReturnType<typeof endpoints.registrationConfig>>

function RegisterForm({ config }: { config: RegConfig }) {
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [terms, setTerms] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [pending, setPending] = useState(false)

  if (!config.enabled) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-black/20 p-6">
        <h1 className="font-heading text-2xl">Регистрация</h1>
        <p className="text-sm text-[var(--muted)]">{config.closed_message}</p>
        {config.show_login_link && (
          <Link to={config.login_path || '/admin/login'} className="link-text text-sm">
            Войти
          </Link>
        )}
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
          const body: Record<string, unknown> = {
            email,
            password,
            name: config.require_name ? name : name || undefined,
            password_confirm: password2,
            terms_accepted: terms,
            website,
          }
          const result = await endpoints.register(body)
          if (result.access_token) {
            acceptSession(result)
            const role = result.user?.role ?? ''
            const dest = result.redirect || '/'
            navigate(STAFF_ROLES.has(role) && dest === '/' ? '/admin' : dest)
            return
          }
          setInfo(result.message || config.success_message)
          if (result.needs_verification) {
            setPassword('')
            setPassword2('')
          } else if (result.redirect) {
            navigate(result.redirect)
          }
        } catch (x) {
          setError(x instanceof Error ? x.message : 'Не удалось зарегистрироваться')
        } finally {
          setPending(false)
        }
      }}
    >
      <h1 className="font-heading text-2xl">Создать аккаунт</h1>
      <p className="text-sm text-[var(--muted)]">Email и пароль для входа на сайт</p>

      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      {config.require_name && (
        <input
          required
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
        />
      )}
      <input
        required
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
      />
      <input
        required
        type="password"
        name="password"
        autoComplete="new-password"
        minLength={config.min_password_length}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={`Пароль (от ${config.min_password_length} символов)`}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
      />
      {config.require_password_confirm && (
        <input
          required
          type="password"
          name="password_confirm"
          autoComplete="new-password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          placeholder="Повторите пароль"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
        />
      )}

      {config.terms_required && (
        <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-1"
            required
          />
          <span>
            {config.terms_label}{' '}
            {config.terms_url ? (
              <Link to={config.terms_url} className="link-text" target="_blank">
                открыть
              </Link>
            ) : null}
          </span>
        </label>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-emerald-400">{info}</p>}

      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? 'Создание…' : 'Зарегистрироваться'}
      </Button>

      {config.show_login_link && (
        <p className="text-center text-sm text-[var(--muted)]">
          Уже есть аккаунт?{' '}
          <Link to={config.login_path || '/admin/login'} className="link-text">
            Войти
          </Link>
        </p>
      )}
    </form>
  )
}

function ClassicRegisterFallback() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['registration-config'],
    queryFn: () => endpoints.registrationConfig(),
  })

  if (isLoading) {
    return (
      <Container className="flex min-h-[70vh] max-w-md items-center py-16">
        <Skeleton className="h-80 w-full" />
      </Container>
    )
  }
  if (error || !data) {
    return (
      <Container className="py-16">
        <p className="text-sm text-red-400">Не удалось загрузить настройки регистрации</p>
      </Container>
    )
  }
  return (
    <Container className="flex min-h-[70vh] items-center py-12 sm:py-16">
      <RegisterForm config={data} />
    </Container>
  )
}

export function RegisterPage() {
  return (
    <>
      <SeoHead title="Регистрация" path="/register" />
      <PreferCmsLayout slug="register" seoPath="/register" fallback={<ClassicRegisterFallback />} />
    </>
  )
}

export function RegisterVerifyPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('Подтверждаем email…')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!token) {
      setErr('Нет токена в ссылке')
      setMsg('')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await endpoints.verifyEmail(token)
        if (cancelled) return
        if (result.access_token) {
          acceptSession(result)
        }
        setMsg(result.message || 'Email подтверждён')
        const dest = result.redirect || '/admin/login'
        setTimeout(() => navigate(dest), 1200)
      } catch (x) {
        if (!cancelled) {
          setMsg('')
          setErr(x instanceof Error ? x.message : 'Ошибка подтверждения')
        }
      }
    })()
    return () => { cancelled = true }
  }, [token, acceptSession, navigate])

  return (
    <>
      <SeoHead title="Подтверждение email" path="/register/verify" />
      <Container className="flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 py-16 text-center">
        {msg && <p className="text-[var(--muted)]">{msg}</p>}
        {err && <p className="text-red-400">{err}</p>}
        <Link to="/register" className="link-text text-sm">К регистрации</Link>
      </Container>
    </>
  )
}
