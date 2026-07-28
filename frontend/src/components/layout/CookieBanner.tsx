import { Link } from 'react-router-dom'
import { useSiteContext } from '@/context/SiteContext'
import { useCookieConsent, writeCookieConsent } from '@/lib/cookieConsent'

function defaultCookieBannerText(analyticsEnabled: boolean): string {
  return analyticsEnabled
    ? 'Мы используем cookies для работы сайта и аналитики. Подробнее — в политике конфиденциальности.'
    : 'Мы используем необходимые cookies для работы сайта. Подробнее — в политике конфиденциальности.'
}

/**
 * Bottom consent strip. Hidden when disabled in site settings or choice already stored.
 */
export function CookieBanner() {
  const { site } = useSiteContext()
  const consent = useCookieConsent()
  const settings = site?.site_settings
  const seo = site?.seo
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

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-white/10 bg-[color:var(--surface)]/95 px-4 py-4 shadow-2xl backdrop-blur-md sm:px-6"
      role="dialog"
      aria-label="Согласие на cookies"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {text}{' '}
          <Link to={policyHref} className="link-text text-[var(--text)] underline-offset-2 hover:underline">
            Политика
          </Link>
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-white/5 hover:text-[var(--text)]"
            onClick={() => writeCookieConsent('necessary')}
          >
            Только необходимые
          </button>
          <button
            type="button"
            className="button rounded-lg px-3 py-2 text-sm"
            onClick={() => writeCookieConsent('all')}
          >
            Принять
          </button>
        </div>
      </div>
    </div>
  )
}
