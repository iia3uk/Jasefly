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
import '@/modules/projects'
import '@/modules/blog'
import '@/modules/services'
import '@/modules/media'
import '@/modules/webhooks'
import '@/modules/orders'
import '@/modules/payments'
import '@/modules/products'
import '@/modules/ddos'
import '@/modules/mail'
import '@/modules/registration'
import '@/modules/translate'
import '@/modules/support'
import '@/modules/lab'
import '@/modules/scheduler'
import '@/modules/forms'
import '@/modules/automation'
import '@/modules/notifications'
import '@/modules/newsletter'
import '@/modules/comments'
import '@/modules/analytics'

/** After deploy, stale hashed chunks/CSS can 404 — soft-reload once. */
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const key = 'jasefly_vite_preload_reload'
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1')
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
