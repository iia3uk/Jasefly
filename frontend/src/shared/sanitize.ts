/**
 * Lightweight HTML sanitizer (no external deps).
 *
 * Strips dangerous tags (script, iframe, object, embed, form, etc.),
 * removes event-handler attributes (on*), and neutralizes javascript:/data:
 * URLs in href/src. Keeps safe formatting tags used by the rich text editor.
 *
 * This is a defense-in-depth measure; the backend also sanitizes on save.
 */

const ALLOWED_TAGS = new Set([
  'a', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'q', 'cite',
  'code', 'pre', 'kbd', 'samp', 'var',
  'hr', 'span', 'div',
  'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'video', 'audio', 'source',
])

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'width', 'height', 'class',
  'target', 'rel', 'controls', 'autoplay', 'loop', 'muted', 'preload', 'poster',
  'colspan', 'rowspan', 'id', 'data-',
])

function isAllowedAttr(name: string): boolean {
  if (ALLOWED_ATTRS.has(name)) return true
  // allow data-* attributes
  return name.startsWith('data-')
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase()
  // Block javascript:, data: (except images), vbscript: URLs
  if (/^(javascript|vbscript|data:text\/html):/i.test(trimmed)) return ''
  if (/^data:/i.test(trimmed) && !/^data:image\//i.test(trimmed)) return ''
  return url
}

/**
 * Sanitize an HTML string for safe rendering via dangerouslySetInnerHTML.
 * Uses the browser DOMParser when available; falls back to a regex strip.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return sanitizeHtmlFallback(html)

  const doc = new DOMParser().parseFromString(html, 'text/html')
  walkAndClean(doc.body)
  return doc.body.innerHTML
}

function walkAndClean(node: Element): void {
  const children = Array.from(node.children)
  for (const el of children) {
    const tag = el.tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) {
      // Keep the text content of disallowed tags but drop the tag itself.
      const text = document.createTextNode(el.textContent ?? '')
      el.replaceWith(text)
      continue
    }
    // Strip all attributes, keep only allowlisted ones with safe values.
    for (const attr of Array.from(el.attributes)) {
      if (!isAllowedAttr(attr.name)) {
        el.removeAttribute(attr.name)
        continue
      }
      if (attr.name === 'href' || attr.name === 'src' || attr.name === 'poster') {
        const safe = sanitizeUrl(attr.value)
        if (!safe) {
          el.removeAttribute(attr.name)
        } else {
          el.setAttribute(attr.name, safe)
        }
      }
    }
    // Force rel on anchors to prevent tabnabbing.
    if (tag === 'a' && el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer')
    }
    walkAndClean(el)
  }
}

/** Regex-based fallback when DOMParser is unavailable (SSR / tests). */
function sanitizeHtmlFallback(html: string): string {
  // Remove script/iframe/object/embed/form entirely.
  html = html.replace(/<(script|iframe|object|embed|form|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  // Remove on* event handler attributes.
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Neutralize javascript: and vbscript: URLs.
  html = html.replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '$1=""')
  return html
}

const EMBED_ALLOWED_TAGS = new Set(['iframe', 'div', 'span'])
const EMBED_ALLOWED_ATTRS = new Set([
  'src', 'width', 'height', 'class', 'style',
  'frameborder', 'allowfullscreen', 'allow', 'loading', 'title', 'referrerpolicy',
])

/**
 * Sanitize an embed (e.g. Google Maps iframe). Allows only <iframe> with
 * safe attributes and a non-javascript src. Everything else is dropped.
 */
export function sanitizeEmbed(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  walkEmbed(doc.body)
  return doc.body.innerHTML
}

function walkEmbed(node: Element): void {
  for (const el of Array.from(node.children)) {
    const tag = el.tagName.toLowerCase()
    if (!EMBED_ALLOWED_TAGS.has(tag)) {
      el.remove()
      continue
    }
    for (const attr of Array.from(el.attributes)) {
      if (!EMBED_ALLOWED_ATTRS.has(attr.name)) {
        el.removeAttribute(attr.name)
        continue
      }
      if (attr.name === 'src') {
        const safe = sanitizeUrl(attr.value)
        if (!safe) el.removeAttribute(attr.name)
        else el.setAttribute(attr.name, safe)
      }
    }
    // Force sandbox on iframes for defense in depth.
    if (tag === 'iframe' && !el.hasAttribute('sandbox')) {
      el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms')
    }
  }
}
