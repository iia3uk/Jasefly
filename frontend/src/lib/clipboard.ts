/**
 * Copy text to clipboard with fallback for non-secure contexts / denied permissions.
 * Returns true if the text was copied (or selected for manual Ctrl+C as last resort).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '')
  if (!value) return false

  // Preferred API (needs secure context + permission)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* fall through to legacy */
  }

  // Legacy execCommand — works more often inside click handlers
  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0;'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return true
  } catch {
    /* fall through */
  }

  // Last resort: prompt so user can Ctrl+C
  try {
    window.prompt('Скопируйте текст (Ctrl+C):', value)
    return true
  } catch {
    return false
  }
}
