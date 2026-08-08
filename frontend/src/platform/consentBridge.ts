import {
  allowsAnalytics,
  readCookieCategories,
  type CookieConsentCategories,
} from '@/lib/cookieConsent'

/**
 * Generic consent helpers for package FE (no product-slug imports in packages).
 * Category keys follow cookie-consent taxonomy (necessary / analytics / marketing).
 */
export function getConsentCategories(): CookieConsentCategories | null {
  return readCookieCategories()
}

export function allowsConsentCategory(category: string): boolean {
  const cat = category.trim().toLowerCase()
  if (!cat) return true
  if (cat === 'necessary') return true
  const cons = getConsentCategories()
  if (cat === 'analytics') return allowsAnalytics(cons)
  if (!cons) return false
  if (cat === 'marketing') return Boolean(cons.marketing)
  return Boolean(cons[cat])
}
