import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePluginEnabled } from '@/hooks/useApi'
import { allowsAnalytics, useCookieConsent } from '@/lib/cookieConsent'
import { useSiteContext } from '@/context/SiteContext'
import { trackAnalytics } from './beacon'

/** Sends page_view when Analytics plugin is on and cookie consent allows it. */
export function AnalyticsBeacon() {
  const enabled = usePluginEnabled('analytics')
  const { pathname } = useLocation()
  const consent = useCookieConsent()
  const { site } = useSiteContext()
  const bannerOn = site?.site_settings?.cookie_banner_enabled === undefined
    || site?.site_settings?.cookie_banner_enabled === null
    ? true
    : Boolean(Number(site.site_settings.cookie_banner_enabled))
  const analyticsOk = !bannerOn || allowsAnalytics(consent)

  useEffect(() => {
    if (!enabled || !analyticsOk) return
    trackAnalytics('page_view', { path: pathname })
  }, [enabled, analyticsOk, pathname])

  return null
}
