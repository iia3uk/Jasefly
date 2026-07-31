import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useSiteContext } from '@/context/SiteContext'
import {
  isCookieConsentModuleEnabled,
  useCookieConsent,
  writeCookieConsent,
} from '@/lib/cookieConsent'

function defaultCookieBannerText(analyticsEnabled: boolean): string {
  return analyticsEnabled
    ? 'Сайт использует необходимые cookie, а с вашего согласия — аналитические инструменты для оценки работы страниц.'
    : 'Сайт использует технически необходимые cookie для работы интерфейса, авторизации и сохранения выбранных настроек.'
}

/**
 * Bottom consent strip (core fallback).
 * Hidden when Cookie Consent ZIP is enabled or choice already stored.
 */
export function CookieBanner() {
  const { site } = useSiteContext()
  const consent = useCookieConsent()
  const settings = site?.site_settings
  const seo = site?.seo

  if (isCookieConsentModuleEnabled(site?.enabled_plugins)) return null

  const enabled = settings?.cookie_banner_enabled === undefined || settings?.cookie_banner_enabled === null
    ? true
    : Boolean(Number(settings.cookie_banner_enabled))

  if (!enabled || consent != null) return null

  const analyticsEnabled = Boolean(
    String(seo?.google_analytics_id || '').trim()
    || String(seo?.google_tag_manager_id || '').trim(),
  )
  const text = String(
    settings?.cookie_banner_text
      || defaultCookieBannerText(analyticsEnabled),
  )
  const policyHref = String(settings?.cookie_policy_href || '/privacy')
  const title = analyticsEnabled ? null : 'Необходимые файлы cookie'

  return (
    <CookieBannerPanel
      analyticsEnabled={analyticsEnabled}
      text={text}
      policyHref={policyHref}
      title={title}
    />
  )
}

function CookieBannerPanel({
  analyticsEnabled,
  text,
  policyHref,
  title,
}: {
  analyticsEnabled: boolean
  text: string
  policyHref: string
  title: string | null
}) {
  useEffect(() => {
    document.documentElement.dataset.cookieBanner = '1'
    return () => {
      delete document.documentElement.dataset.cookieBanner
    }
  }, [])

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-white/10 bg-[color:var(--surface)]/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-2xl backdrop-blur-md sm:px-6"
      role="dialog"
      aria-label="Согласие на cookies"
      data-cms-cookie-banner
      data-translate-root
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-relaxed text-[var(--muted)]">
          {title ? <p className="mb-1 font-medium text-[var(--text)]">{title}</p> : null}
          <p>{text}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="button rounded-lg px-3 py-2 text-sm"
            onClick={() => writeCookieConsent(analyticsEnabled ? 'necessary' : 'all')}
          >
            Понятно
          </button>
          <Link
            to={policyHref}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-white/5 hover:text-[var(--text)]"
          >
            Подробнее
          </Link>
        </div>
      </div>
    </div>
  )
}
