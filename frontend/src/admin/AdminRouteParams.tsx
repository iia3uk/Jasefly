import { createContext, useContext, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'

type Params = Record<string, string | undefined>

const AdminRouteParamsContext = createContext<Params | null>(null)

/** Injected by AdminScreenResolver when matching plugin screens (RR * route has no :id). */
export function AdminRouteParamsProvider({
  params,
  children,
}: {
  params: Params
  children: ReactNode
}) {
  return (
    <AdminRouteParamsContext.Provider value={params}>
      {children}
    </AdminRouteParamsContext.Provider>
  )
}

/**
 * Params for admin plugin screens. Prefer resolver-injected match params,
 * fall back to react-router useParams (real nested routes like pages/:id/builder).
 */
export function useAdminRouteParams(): Params {
  const injected = useContext(AdminRouteParamsContext)
  const fromRouter = useParams()
  if (injected) return { ...fromRouter, ...injected }
  return fromRouter
}
