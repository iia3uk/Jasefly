import { Link } from 'react-router-dom'
import { MediaImage, RichText } from '@/components/ui'
import { formatProductPrice } from '@/builder/bind/resolveBound'
import type { Product } from '@/types'

export function ProductDetailFallback({ product }: { product: Product }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-0 md:grid-cols-2 md:gap-10">
      <div>
        {product.media_id ? (
          <MediaImage media={product.media_id as never} alt={product.title} className="aspect-square w-full rounded-2xl object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-white/15 text-sm text-[var(--muted)]">Нет обложки</div>
        )}
      </div>
      <div className="min-w-0">
        <h1 className="break-words font-heading text-2xl font-semibold tracking-[-0.03em] sm:text-3xl md:text-4xl">{product.title}</h1>
        {product.short_description ? <p className="mt-3 text-sm text-[var(--muted)] sm:text-base">{product.short_description}</p> : null}
        <p className="mt-6 font-heading text-xl text-[var(--accent)] sm:text-2xl">{formatProductPrice(product)}</p>
        {product.description ? <div className="prose mt-6 max-w-none overflow-x-auto"><RichText html={String(product.description)} /></div> : null}
        {product.is_purchasable !== false && product.is_purchasable !== 0 ? (
          <Link to={`/payment?item=product:${product.id}`} className="mt-8 inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent,#2563eb)] px-5 py-2.5 text-sm font-medium text-white sm:w-auto">Купить</Link>
        ) : null}
      </div>
    </div>
  )
}
