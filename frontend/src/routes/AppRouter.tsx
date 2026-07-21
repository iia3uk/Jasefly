import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { useAuth, STAFF_ROLES } from '@/context/AuthContext'
import { AdminShell, DashboardPage, LoginPage } from '@/admin/AdminApp'
import { AdminScreenResolver } from '@/admin/adminRoutes'
import { ApiErrorDebugger } from '@/admin/components/ApiErrorDebugger'
import { PageBuilderPage } from '@/builder/editor/PageBuilderPage'
import { CmsPageBySlug, LazyLoaderFallback, PreferCmsLayout } from '@/builder/public/CmsPages'
import { SiteLayout } from '@/components/layout/SiteLayout'
import { MaintenanceGate } from '@/components/MaintenanceGate'
import { RequirePlugin } from '@/components/RequirePlugin'
import { useSiteContext } from '@/context/SiteContext'
import { SLUG_PLUGIN_GATES, siteHasPlugin } from '@/core/pluginGates'
import { RegisterPage, RegisterVerifyPage } from '@/pages/RegisterPages'
import { adminUrl, getAdminBase, isAdminPathname, setAdminBaseFromSite } from '@/admin/adminBasePath'

const publicPage = <T extends keyof typeof import('@/pages/PublicPages')>(name: T) =>
  lazy(() => import('@/pages/PublicPages').then((module) => ({ default: module[name] as ComponentType })))

const HomePage = publicPage('HomePage')
const AboutPage = publicPage('AboutPage')
const ProjectsPage = publicPage('ProjectsPage')
const ProjectDetailPage = publicPage('ProjectDetailPage')
const ServicesPage = publicPage('ServicesPage')
const ProductDetailPage = publicPage('ProductDetailPage')
const BlogPage = publicPage('BlogPage')
const BlogPostPage = publicPage('BlogPostPage')
const ContactPage = publicPage('ContactPage')
const PrivacyPage = publicPage('PrivacyPage')
const NotFoundPage = publicPage('NotFoundPage')

function RequireAuth() {
  const { token, role } = useAuth()
  if (!token) {
    const next = `${window.location.pathname}${window.location.search}`
    const login = adminUrl('/login')
    const qs = next && !next.startsWith(login) ? `?next=${encodeURIComponent(next)}` : ''
    return <Navigate to={`${login}${qs}`} replace />
  }
  if (role && !STAFF_ROLES.has(role)) {
    return <Navigate to="/" replace />
  }
  return (
    <>
      <Outlet />
      <ApiErrorDebugger />
    </>
  )
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { token, role } = useAuth()
  if (token && role && STAFF_ROLES.has(role)) {
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next')
    const nextPath = next?.split('?')[0] || ''
    const dest = next && isAdminPathname(nextPath) && !nextPath.endsWith('/login')
      ? next
      : adminUrl()
    return <Navigate to={dest} replace />
  }
  if (token && role && !STAFF_ROLES.has(role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function PublicLayout() {
  return (
    <MaintenanceGate>
      <SiteLayout>
        <Outlet />
      </SiteLayout>
    </MaintenanceGate>
  )
}

function CmsOr({ slug, path, children }: { slug: string; path: string; children: ReactNode }) {
  return (
    <PreferCmsLayout slug={slug} seoPath={path} fallback={children} />
  )
}

function CmsSlugPage() {
  const { slug = '' } = useParams()
  const { site, loading } = useSiteContext()
  const gate = SLUG_PLUGIN_GATES[slug]
  if (slug && slug === getAdminBase()) {
    return <Navigate to={adminUrl()} replace />
  }
  if (loading) return <LazyLoaderFallback />
  if (gate && !siteHasPlugin(site?.enabled_plugins, gate)) {
    return <NotFoundPage />
  }
  return <CmsPageBySlug slug={slug} />
}

function PluginOr404({ plugin, children }: { plugin: string; children: ReactNode }) {
  return (
    <RequirePlugin plugin={plugin} fallback={<NotFoundPage />}>
      {children}
    </RequirePlugin>
  )
}

/** Old /admin when base was renamed — never redirect to the new path (would leak it). */
function RetiredAdminPath() {
  return (
    <MaintenanceGate>
      <SiteLayout>
        <NotFoundPage />
      </SiteLayout>
    </MaintenanceGate>
  )
}

export function AppRouter() {
  const { site } = useSiteContext()
  if (site?.site_settings) {
    setAdminBaseFromSite(site.site_settings.admin_base_path)
  }
  const base = getAdminBase()
  const adminRoot = `/${base}`
  const adminLogin = `${adminRoot}/login`

  return (
    <Suspense fallback={<LazyLoaderFallback />}>
      <Routes>
        <Route path={adminLogin} element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />

        <Route path={adminRoot} element={<RequireAuth />}>
          <Route path="pages/:id/builder" element={<PageBuilderPage />} />
          <Route element={<AdminShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="*" element={<AdminScreenResolver />} />
          </Route>
        </Route>

        {base !== 'admin' && (
          <Route path="/admin/*" element={<RetiredAdminPath />} />
        )}

        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<PluginOr404 plugin="registration"><RegisterPage /></PluginOr404>} />
          <Route path="/register/verify" element={<PluginOr404 plugin="registration"><RegisterVerifyPage /></PluginOr404>} />
          <Route path="/about" element={<PluginOr404 plugin="portfolio"><CmsOr slug="about" path="/about"><AboutPage /></CmsOr></PluginOr404>} />
          <Route path="/projects" element={<PluginOr404 plugin="portfolio"><CmsOr slug="projects" path="/projects"><ProjectsPage /></CmsOr></PluginOr404>} />
          <Route path="/projects/:slug" element={<PluginOr404 plugin="portfolio"><ProjectDetailPage /></PluginOr404>} />
          <Route path="/services" element={<PluginOr404 plugin="portfolio"><CmsOr slug="services" path="/services"><ServicesPage /></CmsOr></PluginOr404>} />
          <Route path="/products/:slug" element={<PluginOr404 plugin="products"><ProductDetailPage /></PluginOr404>} />
          <Route path="/blog" element={<PluginOr404 plugin="portfolio"><CmsOr slug="blog" path="/blog"><BlogPage /></CmsOr></PluginOr404>} />
          <Route path="/blog/:slug" element={<PluginOr404 plugin="portfolio"><BlogPostPage /></PluginOr404>} />
          <Route path="/contact" element={<PluginOr404 plugin="portfolio"><CmsOr slug="contact" path="/contact"><ContactPage /></CmsOr></PluginOr404>} />
          <Route path="/privacy" element={<CmsOr slug="privacy" path="/privacy"><PrivacyPage /></CmsOr>} />
          <Route path="/:slug" element={<CmsSlugPage />} />
          <Route path="*" element={<CmsOr slug="not-found" path="/not-found"><NotFoundPage /></CmsOr>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
