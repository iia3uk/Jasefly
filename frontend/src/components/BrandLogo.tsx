import { withAssetVersion } from '@/lib/assetVersion'

type BrandLogoProps = {
  /** full / full2 = wordmark, mini = mark only */
  variant?: 'full' | 'full2' | 'mini'
  className?: string
  /** Accessible name */
  alt?: string
}

const SRC = {
  full: '/brand/jasefly/logo_full.svg',
  full2: '/brand/jasefly/logo_full_2.svg',
  mini: '/brand/jasefly/logo_mini.svg',
} as const

/** Jasefly brand mark — assets in public/brand/jasefly/ */
export function BrandLogo({ variant = 'full', className = '', alt = 'Jasefly' }: BrandLogoProps) {
  return (
    <img
      src={withAssetVersion(SRC[variant])}
      alt={alt}
      className={`block max-w-full object-contain ${className}`.trim()}
      draggable={false}
      decoding="async"
    />
  )
}
