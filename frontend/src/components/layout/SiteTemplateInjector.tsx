import { useEffect, useMemo } from 'react'
import { useSiteContext } from '@/context/SiteContext'
import { getTemplateCss } from '@/shared/siteTemplates'

function useInjectMarkup(target: 'head' | 'body', html: string | undefined, markerId: string) {
  useEffect(() => {
    const raw = html?.trim()
    if (!raw) return

    const holder = document.createElement('div')
    holder.innerHTML = raw
    const nodes = Array.from(holder.childNodes)
    const parent = target === 'head' ? document.head : document.body

    nodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        ;(node as HTMLElement).dataset.siteInject = markerId
      }
      parent.appendChild(node)
    })

    return () => {
      parent.querySelectorAll(`[data-site-inject="${markerId}"]`).forEach((el) => el.remove())
      nodes.forEach((node) => {
        if (node.parentNode) node.parentNode.removeChild(node)
      })
    }
  }, [html, target, markerId])
}

export function SiteTemplateInjector() {
  const { site } = useSiteContext()
  const theme = site?.theme
  const seo = site?.seo

  const presetCss = useMemo(() => getTemplateCss(theme?.preset), [theme?.preset])
  const customCss = theme?.custom_css?.trim() ?? ''
  const customJs = theme?.custom_js?.trim() ?? ''

  useInjectMarkup('head', seo?.custom_head_scripts, 'seo-head')
  useInjectMarkup('body', seo?.custom_body_scripts, 'seo-body')

  useEffect(() => {
    if (!customJs) return
    const script = document.createElement('script')
    script.id = 'site-template-custom-js'
    script.dataset.siteInject = 'template-js'
    script.text = customJs
    document.body.appendChild(script)
    return () => {
      script.remove()
    }
  }, [customJs])

  return (
    <>
      {presetCss ? <style id="site-template-preset">{presetCss}</style> : null}
      {customCss ? <style id="site-template-custom-css">{customCss}</style> : null}
    </>
  )
}
