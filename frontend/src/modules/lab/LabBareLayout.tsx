import { Helmet } from 'react-helmet-async'
import type { ReactNode } from 'react'

/**
 * Bare shell for Lab experiments — no SiteLayout, nav, theme, widgets.
 */
export function LabBareLayout({
  children,
  title,
  description,
  noindex,
  path,
}: {
  children: ReactNode
  title?: string
  description?: string
  noindex?: boolean
  path?: string
}) {
  return (
    <>
      <Helmet>
        {title ? <title>{title}</title> : null}
        {description ? <meta name="description" content={description} /> : null}
        {path ? <link rel="canonical" href={path} /> : null}
        {noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
      </Helmet>
      <div className="jasefly-lab-shell" style={{ minHeight: '100vh', margin: 0, padding: 0 }}>
        {children}
      </div>
    </>
  )
}
