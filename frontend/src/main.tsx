import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from '@/context/AuthContext'
import { SiteProvider } from '@/context/SiteContext'
import { AdminLocaleProvider } from '@/admin/i18n'
import { AppRouter } from '@/routes/AppRouter'
import { ScrollToTop } from '@/components/ScrollToTop'
import '@/index.css'

// Feature modules (self-register via moduleRegistry)
import '@/modules/system'
import '@/modules/site'
import '@/modules/users'
import '@/modules/portfolio'
import '@/modules/services'
import '@/modules/media'
// webhooks — ZIP package (modules-src/webhooks); loaded via packageModuleLoader
// products — ZIP package (modules-src/products); loaded via packageModuleLoader
import '@/modules/ddos'
import '@/modules/overload'
import '@/modules/mail'
// translate — ZIP package (modules-src/translate); loaded via packageModuleLoader
// support — ZIP package (modules-src/support); loaded via packageModuleLoader
import '@/modules/lab'
import '@/modules/scheduler'
// forms — ZIP package (modules-src/forms); loaded via packageModuleLoader
// automation — ZIP package (modules-src/automation); loaded via packageModuleLoader
// notifications — ZIP package (modules-src/notifications); loaded via packageModuleLoader
// newsletter — ZIP package (modules-src/newsletter); loaded via packageModuleLoader
// comments — ZIP package (modules-src/comments); loaded via packageModuleLoader
// analytics — ZIP package (modules-src/analytics); loaded via packageModuleLoader
// registration — ZIP package (modules-src/registration); loaded via packageModuleLoader
import '@/modules/module-manager'
import { loadPackageModules } from '@/core/packageModuleLoader'
import { ensureJaseflySpiritGlobal } from '@/lib/jaseflySpirit'
import { provideHostAdminPage } from '@/platform/hostAdminPages'
import { FormsAdminPage } from '@/admin/pages/FormsAdminPage'
import { FormSubmissionsPage } from '@/admin/pages/FormSubmissionsPage'
import { AnalyticsAdminPage } from '@/admin/pages/AnalyticsAdminPage'
import {
  NewsletterCampaignsPage,
  NewsletterSubscribersPage,
} from '@/admin/pages/NewsletterAdminPages'
import { AutomationAdminPage } from '@/admin/pages/AutomationAdminPage'
import { NotificationsPage } from '@/admin/pages/NotificationsPage'
import { NotificationsBell } from '@/admin/components/NotificationsBell'
import { SupportInboxPage } from '@/admin/pages/SupportInboxPage'
import { SupportFaqPage } from '@/admin/pages/SupportFaqPage'
import { SupportWidget } from '@/components/SupportWidget'
import { TranslateWidget } from '@/components/TranslateWidget'
import { TranslateAutoWarmup } from '@/components/TranslateAutoWarmup'
import { TranslatePage } from '@/admin/pages/TranslatePage'
import { ProductsAdminPage } from '@/admin/pages/ProductsAdminPage'
import { ProductEditPage } from '@/modules/products/ProductEditPage'
import { ProductsSettingsPage } from '@/modules/products/ProductsSettingsPage'
import { OrdersAdminPage } from '@/admin/pages/OrdersAdminPage'
import { CrudListPage, ProjectEditPage } from '@/admin/pages/AdminPages'
import { BlogEditPage } from '@/modules/blog/admin/BlogEditPage'

// Host-bound admin pages for extracted packages (universal hostPageKey bridge)
provideHostAdminPage('forms.admin', FormsAdminPage)
provideHostAdminPage('forms.submissions', FormSubmissionsPage)
provideHostAdminPage('analytics.admin', AnalyticsAdminPage)
provideHostAdminPage('newsletter.subscribers', NewsletterSubscribersPage)
provideHostAdminPage('newsletter.campaigns', NewsletterCampaignsPage)
provideHostAdminPage('automation.admin', AutomationAdminPage)
provideHostAdminPage('notifications.admin', NotificationsPage)
provideHostAdminPage('notifications.bell', NotificationsBell)
provideHostAdminPage('support.inbox', SupportInboxPage)
provideHostAdminPage('support.faq', SupportFaqPage)
provideHostAdminPage('support.site_widget', SupportWidget)
provideHostAdminPage('translate.admin', TranslatePage)
provideHostAdminPage('translate.site_widget', TranslateWidget)
provideHostAdminPage('translate.auto_warmup', TranslateAutoWarmup)
provideHostAdminPage('products.admin', ProductsAdminPage)
provideHostAdminPage('products.new', ProductEditPage)
provideHostAdminPage('products.edit', ProductEditPage)
provideHostAdminPage('products.templates', ProductsSettingsPage)
provideHostAdminPage('orders.admin', OrdersAdminPage)
provideHostAdminPage('payments.admin', () => <CrudListPage resource="payments" />)
provideHostAdminPage('blog.editor', BlogEditPage)
provideHostAdminPage('projects.editor', ProjectEditPage)

ensureJaseflySpiritGlobal()
void loadPackageModules()

/** Successful boot — allow a future deploy to auto-reload again; strip cache-bust `?_=` from URL. */
try {
  sessionStorage.removeItem('jasefly_stale_asset_reload')
  sessionStorage.removeItem('jasefly_vite_preload_reload')
  const u = new URL(window.location.href)
  if (u.searchParams.has('_')) {
    u.searchParams.delete('_')
    const clean = u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash
    window.history.replaceState(null, '', clean)
  }
} catch {
  /* ignore */
}

/** After deploy, stale hashed chunks can 404 — hard-reload once (HTML may still be cached). */
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const key = 'jasefly_vite_preload_reload'
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  try {
    const u = new URL(window.location.href)
    u.searchParams.set('_', Date.now().toString(36))
    window.location.replace(u.toString())
  } catch {
    window.location.reload()
  }
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AdminLocaleProvider>
          <SiteProvider>
            <BrowserRouter>
              <ScrollToTop />
              <AppRouter />
            </BrowserRouter>
          </SiteProvider>
          </AdminLocaleProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)
