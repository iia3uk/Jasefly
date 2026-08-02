import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useAdminItem, useAdminList, useAdminSingleton, useCrud, useSingletonSave, useSite } from '@/hooks/useApi'
import { api, endpoints } from '@/lib/api'
import type { PageLayout, ThemeSettings } from '@/types'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { RichTextEditor } from '@/admin/components/RichTextEditor'
import { AdminSplitLayout, adminFormFullClass, adminFormGridClass } from '@/admin/components/AdminSplitLayout'
import { HeroPreview, HomepageSectionPreview, SingletonPreview, ThemePreview } from '@/admin/preview'
import { t, fieldLabel } from '@/admin/i18n'
import {
  applySiteTemplate,
  CUSTOM_TEMPLATE_ID,
  getSiteTemplate,
  SITE_TEMPLATES,
} from '@/shared/siteTemplates'
import { useAdminSaveHotkey, useHydratedForm, useUnsavedGuard } from '@/admin/hooks/useAdminFormGuards'
import { useFormAutosave } from '@/admin/hooks/useFormAutosave'
import { useAdminRouteParams } from '@/admin/AdminRouteParams'
import { HeroEditor } from '@/admin/components/HeroEditor'
import { adminUrl, normalizeAdminBase, setAdminBaseFromSite } from '@/admin/adminBasePath'
import { useAuth } from '@/context/AuthContext'
import { DEMO_NOTICE } from '@/admin/demo/demoNav'
import { layoutHeroMediaId, pushHeroMediaToHomeLayout } from '@/builder/editor/cmsSync'

type Data = Record<string, any>
function Field({ label, value, set, type = 'text' }: { label: string; value?: any; set: (v: any) => void; type?: string }) {
  return (
    <label className="block space-y-2 text-sm">
      <span>{label}</span>
      <input className="w-full" type={type} value={String(value ?? '')} onChange={e => set(type === 'number' ? Number(e.target.value) : e.target.value)} />
    </label>
  )
}
function Save({ run, saving, error }: { run: () => void; saving?: boolean; error?: string }) {
  return (
    <div className="sticky bottom-0 z-20 mt-8 border-t border-white/10 bg-[#0a0a0b]/92 px-0 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-[#0a0a0b]/80">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#151518] p-3 shadow-[0_-8px_32px_rgb(0_0_0/0.35)]">
        <Button type="button" onClick={run} disabled={saving}>{saving ? t.saving : t.saveChanges}</Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  )
}

const singletonFields: Record<string, string[]> = {
  hero: ['headline', 'subheadline', 'badge_text', 'primary_cta_label', 'primary_cta_href', 'secondary_cta_label', 'secondary_cta_href', 'animation_style'],
  footer: ['copyright_text', 'tagline'],
  'contact-info': ['email', 'phone', 'address', 'city', 'country', 'map_embed', 'form_success_message'],
  seo: ['site_title', 'site_description', 'site_keywords', 'canonical_base_url', 'og_title', 'og_description', 'twitter_card', 'twitter_handle', 'google_analytics_id', 'google_tag_manager_id'],
  'site-settings': [
    'site_name',
    'timezone',
    'locale',
    'posts_per_page',
    'projects_per_page',
    'maintenance_title',
    'maintenance_message',
  ],
  'email-settings': ['from_name', 'from_email', 'to_email', 'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password'],
}

const pathToContextKey: Record<string, string> = {
  hero: 'hero',
  footer: 'footer',
  'contact-info': 'contact-info',
  seo: 'seo',
  'site-settings': 'site-settings',
  'email-settings': 'email-settings',
}

export function SingletonPage({ path, title }: { path: string; title: string }) {
  const { data, isLoading } = useAdminSingleton<Data>(path)
  const { data: site } = useSite()
  const save = useSingletonSave(path)
  const nav = useNavigate()
  const qc = useQueryClient()
  const { isSuperAdmin, isDemo } = useAuth()
  const { form, setForm, baseline, setBaseline } = useHydratedForm<Data>(data, path)
  const set = (k: string, v: any) => {
    if (isDemo) return
    setForm(p => ({ ...p, [k]: v }))
  }
  const mediaField = path === 'hero' ? 'background_media_id' : path === 'seo' ? 'og_image_id' : path === 'site-settings' ? 'logo_media_id' : undefined
  const fields = singletonFields[path] ?? Object.keys(form).filter(k => k !== 'id' && k !== 'updated_at' && k !== 'created_at')
  const contextKey = pathToContextKey[path] ?? path
  const heroMediaHealed = useRef(false)

  // Builder home uses hero-block.media_id — heal empty Admin Hero from layout once.
  useEffect(() => {
    if (isDemo || path !== 'hero' || !data || heroMediaHealed.current) return
    const cmsMedia = data.background_media_id ?? data.background?.id
    if (cmsMedia != null && cmsMedia !== '' && cmsMedia !== 0) return
    const layout = site?.home_page?.layout as PageLayout | undefined
    if (!layout) return
    const layoutMedia = layoutHeroMediaId(layout)
    if (layoutMedia == null || layoutMedia === '' || layoutMedia === 0) return
    heroMediaHealed.current = true
    setForm((prev) => ({ ...prev, background_media_id: layoutMedia }))
    setBaseline((prev) => (prev ? { ...prev, background_media_id: layoutMedia } : prev))
    void endpoints.adminSingletonSave('hero', { background_media_id: layoutMedia })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['admin-singleton', 'hero'] })
        void qc.invalidateQueries({ queryKey: ['site'] })
      })
      .catch(() => { /* non-fatal */ })
  }, [isDemo, path, data, site?.home_page?.layout, setForm, setBaseline, qc])

  const baselineJson = useMemo(() => (baseline ? JSON.stringify(baseline) : null), [baseline])
  const dirty = !isDemo && baselineJson != null && JSON.stringify(form) !== baselineJson
  useUnsavedGuard(dirty)
  const { bannerNode, clearDraftLocal } = useFormAutosave(
    path,
    'singleton',
    form,
    baselineJson,
    dirty,
    setForm,
  )

  const onSave = useCallback(() => {
    if (isDemo) return
    const prevBase = normalizeAdminBase(baseline?.admin_base_path)
    const payload = { ...form }
    if (path === 'site-settings' && !isSuperAdmin()) {
      delete payload.admin_base_path
    }
    save.mutate(payload, {
      onSuccess: (saved) => {
        clearDraftLocal()
        setBaseline(form)
        if (path === 'hero') {
          void pushHeroMediaToHomeLayout(form.background_media_id ?? null, site)
            .then((changed) => {
              if (changed) {
                void qc.invalidateQueries({ queryKey: ['site'] })
                void qc.invalidateQueries({ queryKey: ['admin', 'pages'] })
              }
            })
            .catch(() => { /* non-fatal: singleton already saved */ })
          void qc.invalidateQueries({ queryKey: ['site'] })
        }
        if (path === 'site-settings') {
          const nextBase = normalizeAdminBase(
            (saved as Data)?.admin_base_path ?? form.admin_base_path,
          )
          setAdminBaseFromSite(nextBase === 'admin' ? null : nextBase)
          void qc.invalidateQueries({ queryKey: ['site'] })
          if (nextBase !== prevBase) {
            nav(adminUrl('/site-settings'), { replace: true })
          }
        }
      },
    })
  }, [isDemo, save, form, clearDraftLocal, path, baseline?.admin_base_path, nav, qc, setBaseline, isSuperAdmin, site])
  useAdminSaveHotkey(isDemo ? () => {} : onSave)

  const demoNotice = isDemo ? (
    <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
      {DEMO_NOTICE}
    </p>
  ) : null

  const formBody = path === 'hero' ? (
    isLoading ? (
      <Skeleton className="h-80" />
    ) : (
      <>
        {demoNotice}
        <HeroEditor
          form={form}
          set={set}
          onSave={onSave}
          saving={save.isPending}
          error={save.error?.message}
          banner={isDemo ? null : bannerNode}
        />
      </>
    )
  ) : (
    <>
      {demoNotice}
      {!isDemo ? bannerNode : null}
      {isLoading ? <Skeleton className="h-80" /> : (
        <GlassPanel className={adminFormGridClass}>
          {fields.map(key => {
            if (path === 'footer' && (key === 'tagline' || key === 'copyright_text')) {
              return (
                <label key={key} className={`${adminFormFullClass} block space-y-2 text-sm`}>
                  <span>{fieldLabel(key)}</span>
                  <textarea
                    className="min-h-[5.5rem] w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2 font-mono text-sm"
                    value={String(form[key] ?? '')}
                    onChange={(e) => set(key, e.target.value)}
                  />
                  <span className="block text-xs text-zinc-500">
                    Можно HTML (ссылки):{' '}
                    <code className="text-zinc-400">
                      {'<a href="https://iia3uk.ru" target="_blank" rel="noopener">IIA3UK</a>'}
                    </code>
                    . Опасные теги отфильтруются на сайте.
                  </span>
                </label>
              )
            }
            return (
              <Field
                key={key}
                label={fieldLabel(key)}
                value={form[key]}
                type={key.includes('port') || key.includes('per_page') ? 'number' : 'text'}
                set={v => set(key, v)}
              />
            )
          })}
          {path === 'seo' && (
            <>
              <div className={`${adminFormFullClass} space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4`}>
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{fieldLabel('target_regions')}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Целевые рынки для schema.org areaServed. Регион в Яндекс.Вебмастере задаётся отдельно
                    (один регион из их справочника) — эта настройка его не заменяет.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  {(['CIS', 'EU', 'USA', 'ASIA'] as const).map((code) => {
                    const selected = (() => {
                      const raw = form.target_regions
                      if (Array.isArray(raw)) return raw.map(String)
                      if (typeof raw === 'string' && raw.trim()) {
                        try {
                          const parsed = JSON.parse(raw) as unknown
                          return Array.isArray(parsed) ? parsed.map(String) : []
                        } catch {
                          return []
                        }
                      }
                      return [] as string[]
                    })()
                    const on = selected.includes(code)
                    return (
                      <label key={code} className="flex items-center gap-2 text-sm text-zinc-200">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selected.filter((x) => x !== code), code]
                              : selected.filter((x) => x !== code)
                            const order = ['CIS', 'EU', 'USA', 'ASIA']
                            set('target_regions', order.filter((c) => next.includes(c)))
                          }}
                        />
                        <span>{code}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className={adminFormFullClass}>
                <label className="block space-y-2 text-sm">
                  {fieldLabel('custom_head_scripts')}
                  <textarea value={form.custom_head_scripts ?? ''} onChange={e => set('custom_head_scripts', e.target.value)} />
                </label>
              </div>
              <div className={`${adminFormFullClass} rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400`}>
                <p className="font-medium text-zinc-200">Prerender для ботов</p>
                <p className="mt-1">
                  Поисковики и соцсети получают HTML из базы (не пустой SPA). Кэш сбрасывается
                  автоматически при сохранении контента (и раз в час). Проверка:{' '}
                  <code className="text-zinc-300">/?prerender=1</code> или{' '}
                  <code className="text-zinc-300">/sitemap.xml</code>.
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  onClick={() => {
                    void api.post<{ data?: { message?: string; cleared?: number } }>('/admin/seo/prerender-flush', {})
                      .then((res) => {
                        const d = (res as { data?: { message?: string } })?.data
                        window.alert(d?.message || 'Кэш очищен')
                      })
                      .catch((e: unknown) => window.alert(e instanceof Error ? e.message : 'Ошибка'))
                  }}
                >
                  Очистить кэш prerender
                </Button>
              </div>
            </>
          )}
          {path === 'footer' && (
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(form.show_social)} onChange={e => set('show_social', e.target.checked)} />
                {t.showSocial}
              </label>
              <p className="text-xs text-zinc-500">
                Сами ссылки — во вкладке{' '}
                <Link to={adminUrl('/social-links')} className="text-teal-300/90 underline-offset-2 hover:underline">
                  Соцсети
                </Link>
                {' '}(ядро CMS, не модуль Portfolio).
              </p>
            </div>
          )}
          {path === 'site-settings' && (
            <>
              <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Cookie-баннер</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Пока гость не нажал «Принять», Google Analytics / GTM не загружаются.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.cookie_banner_enabled === undefined || form.cookie_banner_enabled === null
                      ? true
                      : Boolean(form.cookie_banner_enabled)}
                    onChange={e => set('cookie_banner_enabled', e.target.checked ? 1 : 0)}
                  />
                  <span>Показывать баннер согласия</span>
                </label>
                <label className="block space-y-2 text-sm">
                  <span>Текст баннера</span>
                  <textarea
                    className="w-full min-h-[4rem]"
                    value={String(form.cookie_banner_text ?? '')}
                    onChange={e => set('cookie_banner_text', e.target.value)}
                    placeholder="Мы используем cookies…"
                  />
                </label>
                <Field
                  label="Ссылка на политику"
                  value={form.cookie_policy_href ?? '/privacy'}
                  set={v => set('cookie_policy_href', v)}
                />
              </div>
              <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Путь входа в админку</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Меняет только адрес UI (например <code className="text-zinc-300">/panel</code>).
                    API остаётся <code className="text-zinc-300">/api/v1/admin</code> — это не замена пароля и 2FA,
                    а снижение шума ботов по известному <code className="text-zinc-300">/admin</code>.
                    Старый путь после смены открывается как 404 (без редиректа на новый).
                    Изменять может только суперадмин (или MCP).
                  </p>
                </div>
                {isSuperAdmin() ? (
                  <>
                    <label className="block space-y-2 text-sm">
                      <span>Сегмент URL</span>
                      <input
                        className="w-full"
                        value={String(form.admin_base_path ?? '')}
                        onChange={e => set('admin_base_path', e.target.value.trim().toLowerCase())}
                        placeholder="admin"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <p className="text-xs text-zinc-500">
                      Вход: <code className="text-zinc-300">/{normalizeAdminBase(form.admin_base_path)}/login</code>
                      {' · '}оставьте пустым для <code className="text-zinc-300">/admin</code>.
                      После смены сохраните закладку. Если забыли путь — сбросьте через БД/MCP поле{' '}
                      <code className="text-zinc-300">admin_base_path</code>.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Текущий путь: <code className="text-zinc-300">/{normalizeAdminBase(form.admin_base_path)}/login</code>
                    {' · '}смену пути может выполнить только суперадмин.
                  </p>
                )}
              </div>
              <div className="space-y-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:col-span-2">
              <div>
                <p className="text-sm font-semibold text-amber-100">{t.maintenanceMode}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Гости видят шаблон «Техобслуживание». Вход в админку всегда доступен.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={Boolean(form.maintenance_mode)}
                  onChange={e => set('maintenance_mode', e.target.checked)}
                />
                <span>
                  Включить техработы
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    Неавторизованные пользователи не увидят контент сайта
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.maintenance_allow_staff === undefined || form.maintenance_allow_staff === null
                    ? true
                    : Boolean(form.maintenance_allow_staff)}
                  onChange={e => set('maintenance_allow_staff', e.target.checked)}
                />
                <span>
                  Staff может смотреть сайт
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    admin / editor / super_admin после входа видят сайт как обычно
                  </span>
                </span>
              </label>
              <Field
                label="Заголовок для гостей"
                value={form.maintenance_title}
                set={v => set('maintenance_title', v)}
              />
              <label className="block space-y-2 text-sm">
                <span>Текст для гостей</span>
                <textarea
                  className="w-full min-h-[5rem]"
                  value={String(form.maintenance_message ?? '')}
                  onChange={e => set('maintenance_message', e.target.value)}
                  placeholder="Сайт временно недоступен…"
                />
              </label>
              <div className="flex flex-wrap gap-3 text-sm">
                <Link to="/admin/pages" className="link-text">
                  Страницы → шаблон «Техобслуживание»
                </Link>
                <a href="/maintenance" target="_blank" rel="noreferrer" className="link-text">
                  Открыть /maintenance
                </a>
              </div>
            </div>
            </>
          )}
          {mediaField && <MediaPicker label={fieldLabel(mediaField)} value={form[mediaField]} onChange={v => set(mediaField, v)} />}
        </GlassPanel>
      )}
      {!isDemo ? <Save saving={save.isPending} error={save.error?.message} run={onSave} /> : null}
    </>
  )

  return (
    <AdminSplitLayout
      title={title}
      contextKey={contextKey}
      form={formBody}
      preview={path === 'hero' ? <HeroPreview form={form} /> : <SingletonPreview form={form} path={path} />}
    />
  )
}

export function ThemeSettingsPage() {
  const { isDemo } = useAuth()
  const { data } = useAdminSingleton<Data>('theme')
  const save = useSingletonSave('theme')
  const { form, setForm, baseline, setBaseline } = useHydratedForm<Data>(data, 'theme')
  const [codeTab, setCodeTab] = useState<'html' | 'css' | 'js'>('html')
  const [showFineTune, setShowFineTune] = useState(false)
  const baselineJson = useMemo(() => (baseline ? JSON.stringify(baseline) : null), [baseline])
  const dirty = !isDemo && baselineJson != null && JSON.stringify(form) !== baselineJson
  useUnsavedGuard(dirty)
  const { bannerNode, clearDraftLocal } = useFormAutosave('theme', 'singleton', form, baselineJson, dirty, setForm)

  const onSave = useCallback(() => {
    if (isDemo) return
    save.mutate(form, {
      onSuccess: () => {
        clearDraftLocal()
        setBaseline(form)
      },
    })
  }, [isDemo, save, form, clearDraftLocal, setBaseline])
  useAdminSaveHotkey(isDemo ? () => {} : onSave)

  const preset = form.preset || 'midnight'
  const isCustom = preset === CUSTOM_TEMPLATE_ID
  const activeTemplate = getSiteTemplate(preset)

  const selectTemplate = (templateId: string) => {
    if (isDemo) return
    const template = getSiteTemplate(templateId)
    if (!template) return
    setForm((prev) => applySiteTemplate(prev as ThemeSettings, template))
  }

  const codeTabs = [
    { id: 'html' as const, label: t.customHtml, value: form.custom_html ?? '', key: 'custom_html' },
    { id: 'css' as const, label: t.customCss, value: form.custom_css ?? '', key: 'custom_css' },
    { id: 'js' as const, label: t.customJs, value: form.custom_js ?? '', key: 'custom_js' },
  ]

  return (
    <AdminSplitLayout
      title={t.themeSettings}
      contextKey="theme"
      form={
        <>
          {isDemo ? (
            <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
              {DEMO_NOTICE}
            </p>
          ) : bannerNode}
          <GlassPanel className="p-6">
            <p className="text-sm text-zinc-400">{t.templatePickerHint}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {SITE_TEMPLATES.map((template) => {
                const selected = preset === template.id
                const [bg, accent] = template.preview
                return (
                  <button
                    type="button"
                    key={template.id}
                    onClick={() => selectTemplate(template.id)}
                    className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-[var(--accent,#8eb6ff)] ring-2 ring-[var(--accent,#8eb6ff)]/30'
                        : 'border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div
                      className="mb-3 h-16 rounded-xl border border-white/10"
                      style={{
                        background: `linear-gradient(135deg, ${bg} 55%, ${accent} 140%)`,
                      }}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{template.name}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">{template.description}</p>
                      </div>
                      {selected && (
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent,#8eb6ff)]/20 text-[var(--accent,#8eb6ff)]">
                          <Check size={14} />
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </GlassPanel>

          <GlassPanel className="mt-6 p-6">
            <label className="block space-y-2 text-sm">
              <span>Шапка (navbar)</span>
              <select
                className="w-full"
                value={String(form.header_style || 'overlay')}
                onChange={(e) => setForm((p) => ({ ...p, header_style: e.target.value }))}
              >
                <option value="overlay">Прозрачная до скролла (основной)</option>
                <option value="solid">Сплошная (классическая)</option>
              </select>
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Прозрачная шапка лежит поверх Hero на весь экран; после первого скролла становится плотной.
            </p>
          </GlassPanel>

          {isCustom ? (
            <GlassPanel className="mt-6 p-6">
              <div className="flex flex-wrap gap-2">
                {codeTabs.map((tab) => (
                  <Button
                    type="button"
                    key={tab.id}
                    className={codeTab === tab.id ? '' : 'bg-white/5'}
                    onClick={() => setCodeTab(tab.id)}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>
              <p className="mt-4 text-sm text-zinc-400">
                {codeTab === 'html' && t.customHtmlHint}
                {codeTab === 'css' && t.customCssHint}
                {codeTab === 'js' && t.customJsHint}
              </p>
              {codeTabs.map((tab) => (
                codeTab === tab.id && (
                  <label key={tab.id} className="mt-4 block space-y-2 text-sm">
                    <span>{tab.label}</span>
                    <textarea
                      className="min-h-[280px] font-mono text-xs leading-5"
                      spellCheck={false}
                      value={tab.value}
                      onChange={(e) => setForm((p) => ({ ...p, [tab.key]: e.target.value }))}
                      placeholder={
                        tab.id === 'html'
                          ? '<div class="promo-banner">...</div>'
                          : tab.id === 'css'
                            ? '.promo-banner { padding: 1rem; }'
                            : "document.querySelector('.promo-banner')?.classList.add('ready')"
                      }
                    />
                  </label>
                )
              ))}
            </GlassPanel>
          ) : (
            <>
              <GlassPanel className="mt-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{activeTemplate?.name ?? preset}</p>
                    <p className="mt-1 text-sm text-zinc-400">{t.presetAppliedHint}</p>
                  </div>
                  <Button type="button" className="bg-white/5" onClick={() => setShowFineTune((v) => !v)}>
                    {showFineTune ? t.hideFineTune : t.showFineTune}
                  </Button>
                </div>
                {showFineTune && (
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    {['primary_color', 'accent_color', 'background_color', 'surface_color', 'text_color', 'muted_color', 'font_display', 'font_body', 'border_radius', 'glass_opacity'].map((key) => (
                      <Field key={key} label={fieldLabel(key)} value={form[key]} set={(v) => setForm((p) => ({ ...p, [key]: v }))} type={key === 'glass_opacity' ? 'number' : 'text'} />
                    ))}
                  </div>
                )}
              </GlassPanel>
              <GlassPanel className="mt-6 p-6">
                <label className="block space-y-2 text-sm">
                  {t.extraCustomCss}
                  <textarea
                    className="min-h-[160px] font-mono text-xs"
                    spellCheck={false}
                    value={form.custom_css ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, custom_css: e.target.value }))}
                    placeholder="/* Дополнительные стили поверх выбранного шаблона */"
                  />
                </label>
              </GlassPanel>
            </>
          )}

          {isDemo ? (
            <p className="mt-6 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
              {DEMO_NOTICE}
            </p>
          ) : (
            <Save saving={save.isPending} error={save.error?.message} run={onSave} />
          )}
        </>
      }
      preview={<ThemePreview form={form} />}
    />
  )
}

/**
 * Appearance → «Главная» used to list legacy `homepage_sections`.
 * Live home content is in `pages.layout_json` (Page Builder) — redirect there.
 */
export function HomepagePage() {
  const nav = useNavigate()
  const pages = useAdminList<{
    id: number | string
    is_home?: boolean | number
    title?: string
    template?: string
  }>('pages')
  const homePage = (pages.data ?? []).find((p) => Number(p.is_home) === 1 || p.is_home === true)
  const builderHref = homePage ? adminUrl(`/pages/${homePage.id}/builder`) : null

  useEffect(() => {
    if (builderHref) nav(builderHref, { replace: true })
  }, [builderHref, nav])

  if (pages.isLoading) {
    return <Skeleton className="h-40" />
  }

  if (!builderHref) {
    return (
      <GlassPanel className="p-8 text-center text-sm text-zinc-400">
        Страница «Главная» не найдена в <code className="text-zinc-300">pages</code>.
        <div className="mt-4">
          <Link to={adminUrl('/pages')}>
            <Button type="button">К списку страниц</Button>
          </Link>
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="p-8 text-center text-sm text-zinc-400">
      Переходим в билдер главной…
      <div className="mt-4">
        <Link to={builderHref}>
          <Button type="button" className="admin-primary">Открыть билдер</Button>
        </Link>
      </div>
    </GlassPanel>
  )
}

export function HomepageEditPage() {
  const { id = 'new' } = useAdminRouteParams()
  const { data } = useAdminItem<Data>('homepage-sections', id)
  const crud = useCrud('homepage-sections')
  const { form, setForm } = useHydratedForm<Data>(data, String(id))
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  return (
    <AdminSplitLayout
      title={id === 'new' ? t.newHomepageSection : t.editHomepageSection}
      contextKey="homepage-sections"
      form={
        <>
          <GlassPanel className={adminFormGridClass}>
            <Field label={fieldLabel('section_key')} value={form.section_key} set={v => set('section_key', v)} />
            <Field label={fieldLabel('title')} value={form.title} set={v => set('title', v)} />
            <Field label={fieldLabel('subtitle')} value={form.subtitle} set={v => set('subtitle', v)} />
            <Field label={fieldLabel('cta_label')} value={form.cta_label} set={v => set('cta_label', v)} />
            <Field label={fieldLabel('cta_href')} value={form.cta_href} set={v => set('cta_href', v)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.is_visible)} onChange={e => set('is_visible', e.target.checked)} />
              {t.visible}
            </label>
            <div className={adminFormFullClass}>
              <label className="block space-y-2 text-sm">
                {fieldLabel('content')}
                <RichTextEditor value={form.content ?? ''} onChange={v => set('content', v)} />
              </label>
            </div>
          </GlassPanel>
          <Save saving={crud.save.isPending} error={crud.save.error?.message} run={() => crud.save.mutate({ data: form, id: id === 'new' ? undefined : id })} />
        </>
      }
      preview={<HomepageSectionPreview form={form} />}
    />
  )
}
