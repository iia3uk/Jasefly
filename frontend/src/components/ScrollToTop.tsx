import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { findHubByPath } from '@/admin/adminHubs'
import { isAdminPathname } from '@/admin/adminBasePath'

/** Scroll to top on route change — but not when switching tabs inside the same admin hub. */
export function ScrollToTop() {
  const { pathname, search, hash } = useLocation()
  const prevPath = useRef(pathname)

  useEffect(() => {
    const from = prevPath.current
    prevPath.current = pathname

    if (hash) {
      const id = decodeURIComponent(hash.slice(1))
      const el = id ? document.getElementById(id) : null
      if (el) {
        el.scrollIntoView()
        return
      }
    }

    // Hub tabs (Оформление / Пользователи / …): stay put — no jump to top.
    if (isAdminPathname(pathname) && isAdminPathname(from)) {
      const hubTo = findHubByPath(pathname)
      const hubFrom = findHubByPath(from)
      if (hubTo && hubFrom && hubTo.id === hubFrom.id) {
        return
      }
    }

    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0

    document.querySelectorAll<HTMLElement>('[data-scroll-reset]').forEach((node) => {
      node.scrollTop = 0
    })
  }, [pathname, search, hash])

  return null
}
