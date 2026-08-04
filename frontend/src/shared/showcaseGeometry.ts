/**
 * Locked desktop geometry for projects-grid `lead-with-stack`.
 *
 * Assumptions (site Container):
 * - max-w-6xl (1152px) + lg:px-8 → content width 1088px
 * - columns 1.45fr / 1fr, gap 1.25rem (20px)
 * - primary media lg aspect 2/3 (matches Jasefly portrait 1024×1536)
 * - primary text block lg min-height 10.5rem (168px)
 * - secondary text block fixed 6.75rem (108px)
 *
 * Derived secondary media slot ≈ 436×440 → aspect ≈ 0.99 → treat as 1:1.
 */
export const SHOWCASE_DESKTOP = {
  contentWidthPx: 1088,
  columnGapPx: 20,
  primaryFr: 1.45,
  secondaryFr: 1,
  primaryMediaAspect: { w: 2, h: 3 },
  primaryTextMinPx: 168,
  secondaryTextPx: 108,
  /** Secondary media container — compose assets to this ratio. */
  secondaryMediaAspect: { w: 1, h: 1 },
  /** Recommended export sizes for secondary landscape/square covers. */
  secondaryAssetPx: {
    x1: { w: 1200, h: 1200 },
    x2: { w: 2400, h: 2400 },
  },
  /** Keep titles / hero UI inside this inset (fraction of edge). */
  safeInset: 0.1,
} as const

export function showcaseSecondaryMediaSlot(contentWidthPx = SHOWCASE_DESKTOP.contentWidthPx) {
  const { columnGapPx, primaryFr, secondaryFr, primaryMediaAspect, primaryTextMinPx, secondaryTextPx } =
    SHOWCASE_DESKTOP
  const track = contentWidthPx - columnGapPx
  const frSum = primaryFr + secondaryFr
  const primaryW = (track * primaryFr) / frSum
  const secondaryW = (track * secondaryFr) / frSum
  const primaryMediaH = (primaryW * primaryMediaAspect.h) / primaryMediaAspect.w
  const primaryH = primaryMediaH + primaryTextMinPx
  const secondaryCardH = (primaryH - columnGapPx) / 2
  const secondaryMediaH = secondaryCardH - secondaryTextPx
  return {
    primaryW: Math.round(primaryW * 10) / 10,
    secondaryW: Math.round(secondaryW * 10) / 10,
    primaryH: Math.round(primaryH * 10) / 10,
    secondaryCardH: Math.round(secondaryCardH * 10) / 10,
    secondaryMediaW: Math.round(secondaryW * 10) / 10,
    secondaryMediaH: Math.round(secondaryMediaH * 10) / 10,
    secondaryMediaAspect: Math.round((secondaryW / secondaryMediaH) * 1000) / 1000,
  }
}
