import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Scroll to top on every route change (public site + admin). */
export function ScrollToTop() {
  const { pathname, search, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1))
      const el = id ? document.getElementById(id) : null
      if (el) {
        el.scrollIntoView()
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
