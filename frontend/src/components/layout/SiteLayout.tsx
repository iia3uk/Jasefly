import { Link, NavLink } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Menu, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Container } from '@/components/ui'
import { useSiteContext } from '@/context/SiteContext'
import { useAuth } from '@/context/AuthContext'
import { mediaUrl } from '@/lib/api'
import { AppIcon } from '@/shared/icons'
import { sanitizeHtml } from '@/shared/sanitize'
import { SiteTemplateInjector } from '@/components/layout/SiteTemplateInjector'
import { AdminBar } from '@/components/layout/AdminBar'
import { ensureGoogleFontsLoaded, findGoogleFontPreset } from '@/builder/lib/googleFonts'
import { CookieBanner } from '@/components/layout/CookieBanner'
import { TranslateWidget } from '@/components/TranslateWidget'
import { SupportWidget } from '@/components/SupportWidget'
import { TranslateAutoWarmup } from '@/components/TranslateAutoWarmup'
import { SnapSectionRail } from '@/components/layout/SnapSectionRail'
import { useCookieConsent } from '@/lib/cookieConsent'
import { AnalyticsBeacon } from '@/modules/analytics/AnalyticsBeacon'

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T } catch { return fallback }
  }
  return value as T
}

export function ThemeApplier() {
  const { site } = useSiteContext()
  useEffect(() => {
    const t = site?.theme
    if (!t) return
    const root = document.documentElement
    const map: Record<string, string | undefined> = {
      '--primary': t.primary_color,
      '--accent': t.accent_color,
      '--background': t.background_color,
      '--surface': t.surface_color,
      '--text': t.text_color,
      '--muted': t.muted_color,
      '--font-heading': t.font_display ? `"${t.font_display}", sans-serif` : undefined,
      '--font-body': t.font_body ? `"${t.font_body}", sans-serif` : undefined,
      '--radius': t.border_radius,
      '--glass-opacity': t.glass_opacity != null ? String(t.glass_opacity) : undefined,
    }
    Object.entries(map).forEach(([k, v]) => { if (v) root.style.setProperty(k, v) })

    const themeFonts = [t.font_display, t.font_body]
      .map((name) => {
        if (!name) return null
        return findGoogleFontPreset(`"${name}", sans-serif`)?.family
          || findGoogleFontPreset(name)?.family
          || name
      })
      .filter((f): f is string => Boolean(f))
    if (themeFonts.length) ensureGoogleFontsLoaded(themeFonts)
  }, [site])
  return null
}

export function SeoHead({
  title,
  description,
  path,
  image,
  noIndex = false,
}: {
  title?: string
  description?: string
  path?: string
  /** Absolute or site-relative OG image URL */
  image?: string | null
  noIndex?: boolean
}) {
  const { site } = useSiteContext()
  const consent = useCookieConsent()
  const seo = site?.seo
  const siteName = site?.site_settings?.site_name
  const bannerOn = site?.site_settings?.cookie_banner_enabled === undefined
    || site?.site_settings?.cookie_banner_enabled === null
    ? true
    : Boolean(Number(site.site_settings.cookie_banner_enabled))
  // Banner off → analytics allowed. Banner on → only after explicit "all".
  const analyticsOk = !bannerOn || consent === 'all'

  const finalTitle = title
    ? `${title}${siteName ? ` · ${siteName}` : ''}`
    : seo?.site_title || siteName || 'Jasefly CMS'
  const desc = description || seo?.site_description || ''
  const base = (seo?.canonical_base_url || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '')
  const canonical = base && path ? `${base}${path}` : undefined

  const siteOg = seo?.og_image_id != null ? mediaUrl(seo.og_image_id) : undefined
  const rawImage = image || siteOg || undefined
  const ogImage = rawImage
    ? (rawImage.startsWith('http') ? rawImage : `${base}${rawImage.startsWith('/') ? '' : '/'}${rawImage}`)
    : undefined

  const gaId = seo?.google_analytics_id?.trim()
  const gtmId = seo?.google_tag_manager_id?.trim()

  return (
    <Helmet>
      <title>{finalTitle}</title>
      {desc && <meta name="description" content={desc} />}
      {seo?.site_keywords && <meta name="keywords" content={seo.site_keywords} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {canonical && <link rel="canonical" href={canonical} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={siteName || 'Jasefly'} />
      {canonical && <meta property="og:url" content={canonical} />}
      <meta property="og:title" content={seo?.og_title || finalTitle} />
      <meta property="og:description" content={seo?.og_description || desc} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta name="twitter:card" content={seo?.twitter_card || 'summary_large_image'} />
      {seo?.twitter_handle && <meta name="twitter:site" content={seo.twitter_handle} />}
      <meta name="twitter:title" content={seo?.twitter_title || finalTitle} />
      <meta name="twitter:description" content={seo?.twitter_description || desc} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      {analyticsOk && gaId ? (
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
      ) : null}
      {analyticsOk && gaId ? (
        <script>{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}</script>
      ) : null}
      {analyticsOk && gtmId ? (
        <script>{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}</script>
      ) : null}
    </Helmet>
  )
}

/** CTA-пункты в header (кнопка справа), остальные — текстовые ссылки. */
function isHeaderCta(item: { label?: string }) {
  const label = (item.label || '').trim().toLowerCase()
  return /^(начать|посмотреть|скачать|получить|связаться|попробовать)\b/i.test(label)
}

export function Header() {
  const { site, loading } = useSiteContext()
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const nav = site?.navigation ?? []
  const name = site?.site_settings?.site_name
  const links = nav.filter((item) => !isHeaderCta(item))
  const ctas = nav.filter((item) => isHeaderCta(item))
  const primaryCta = ctas[ctas.length - 1]

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <header
      className="sticky z-50 border-b border-white/[0.06] bg-[color:var(--background)]/75 backdrop-blur-xl"
      style={{ top: token ? 'var(--admin-bar-h, 36px)' : 0 }}
    >
      <Container className="flex h-14 items-center justify-between gap-4 sm:h-[4.25rem]">
        <Link to="/" className="shrink-0 font-heading text-[0.95rem] font-semibold tracking-[-0.02em] transition hover:text-[var(--accent)]">
          {loading && !name ? <span className="inline-block h-4 w-28 animate-pulse rounded bg-white/10" /> : name}
        </Link>
        <nav className="hidden min-w-0 flex-1 items-center justify-end gap-6 lg:flex xl:gap-7" aria-label="Основная навигация">
          {links.map((item) => (
            <NavLink
              key={String(item.id)}
              to={item.href}
              className={({ isActive }) =>
                `link-nav shrink-0 text-sm ${isActive ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {primaryCta ? (
            <NavLink
              to={primaryCta.href}
              className="shrink-0 rounded-[var(--radius)] bg-[color:var(--primary)] px-4 py-2 text-sm font-semibold text-[color:var(--background)] transition-opacity hover:opacity-90"
            >
              {primaryCta.label}
            </NavLink>
          ) : null}
        </nav>
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 text-[var(--text)] transition hover:border-white/40 hover:bg-white/[0.06] active:scale-95 lg:hidden"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </Container>

      {open && (
        <div
          className={
            token
              ? 'fixed inset-x-0 bottom-0 z-40 top-[calc(var(--admin-bar-h,36px)+3.5rem)] sm:top-[calc(var(--admin-bar-h,36px)+4.25rem)] lg:hidden'
              : 'fixed inset-x-0 bottom-0 z-40 top-14 sm:top-[4.25rem] lg:hidden'
          }
        >
          <button type="button" className="absolute inset-0 bg-black/65" aria-label="Закрыть" onClick={() => setOpen(false)} />
          <nav className="absolute inset-x-0 top-0 max-h-[min(70dvh,calc(100dvh-3.5rem))] overflow-y-auto overscroll-contain border-b border-white/[0.08] bg-[color:var(--background)] px-4 py-2 shadow-2xl sm:max-h-[min(70dvh,calc(100dvh-4.25rem))] sm:px-6" aria-label="Мобильная навигация">
            {links.map((item) => (
              <NavLink
                key={String(item.id)}
                to={item.href}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `block border-b border-white/[0.05] py-4 text-base transition ${isActive ? 'text-[var(--text)]' : 'text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--text)]'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {primaryCta ? (
              <NavLink
                to={primaryCta.href}
                onClick={() => setOpen(false)}
                className="mt-3 mb-2 block rounded-[var(--radius)] bg-[color:var(--primary)] px-4 py-3 text-center text-base font-semibold text-[color:var(--background)]"
              >
                {primaryCta.label}
              </NavLink>
            ) : null}
          </nav>
        </div>
      )}
    </header>
  )
}

export function Footer() {
  const { site } = useSiteContext()
  const year = new Date().getFullYear()
  const copyright = (site?.footer?.copyright_text || '').replace('{year}', String(year))
  const columns = parseJson(site?.footer?.columns_json, [] as Array<{ title?: string; links?: Array<{ label: string; href: string }> }>)
  const footerNav = site?.footer_nav ?? []
  const social = site?.social ?? []

  const footerHref = (href: string) => {
    const h = (href || '').trim()
    const external = /^https?:\/\//i.test(h) || h.startsWith('mailto:') || h.startsWith('tel:')
    return { href: h, external }
  }

  return (
    <footer className="cms-snap-footer border-t border-white/[0.06] pt-12 pb-8 sm:pt-16 sm:pb-10">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="font-heading text-lg font-semibold">{site?.site_settings?.site_name}</p>
            {site?.footer?.tagline && (
              <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">{site.footer.tagline}</p>
            )}
            {!!site?.footer?.show_social && (
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3">
                {social.map((s) => (
                  <a key={String(s.id)} href={s.url} className="link-text inline-flex items-center gap-1.5 text-sm text-[var(--muted)]" target="_blank" rel="noreferrer">
                    {s.icon && <AppIcon name={s.icon} size={14} fallback={false} />}
                    {s.label || s.platform || s.url}
                  </a>
                ))}
              </div>
            )}
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-medium">{col.title}</p>
              <div className="mt-4 space-y-2">
                {col.links?.map((l) => {
                  const { href, external } = footerHref(l.href)
                  if (!href) return null
                  if (external) {
                    return (
                      <a key={href + l.label} href={href} className="link-text block text-sm text-[var(--muted)]" target="_blank" rel="noreferrer">
                        {l.label}
                      </a>
                    )
                  }
                  return (
                    <Link key={href + l.label} to={href} className="link-text block text-sm text-[var(--muted)]">
                      {l.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
          {!columns.length && (
            <div>
              <p className="text-sm font-medium">Навигация</p>
              <div className="mt-4 space-y-2">
                {footerNav.map((n) => {
                  const { href, external } = footerHref(n.href)
                  if (!href) return null
                  if (external) {
                    return (
                      <a key={String(n.id)} href={href} className="link-text block text-sm text-[var(--muted)]" target="_blank" rel="noreferrer">
                        {n.label}
                      </a>
                    )
                  }
                  return (
                    <Link key={String(n.id)} to={href} className="link-text block text-sm text-[var(--muted)]">
                      {n.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <p className="mt-10 text-sm text-[var(--muted)] sm:mt-12">{copyright}</p>
      </Container>
    </footer>
  )
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const { site } = useSiteContext()
  const { token } = useAuth()
  const customHtml = site?.theme?.custom_html?.trim()

  return (
    <>
      <ThemeApplier />
      <SiteTemplateInjector />
      <AdminBar />
      <div style={token ? { paddingTop: 'var(--admin-bar-h, 36px)' } : undefined}>
        <Header />
        {/* Only this node scrolls when page snap is on (html/body overflow hidden). */}
        <div id="cms-snap-scroller" className="min-w-0">
          {customHtml ? (
            <div
              id="site-template-custom-html"
              className="site-template-custom-html"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(customHtml) }}
            />
          ) : null}
          <main className="min-w-0 overflow-x-clip">{children}</main>
          <Footer />
        </div>
      </div>
      <CookieBanner />
      <SnapSectionRail />
      <TranslateWidget />
      <SupportWidget />
      <TranslateAutoWarmup />
      <AnalyticsBeacon />
    </>
  )
}
