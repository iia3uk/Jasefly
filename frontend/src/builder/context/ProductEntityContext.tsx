import { createContext, useContext, type ReactNode } from 'react'
import type { Product } from '@/types'
import { DEMO_PRODUCT } from '@/builder/bind/resolveBound'

const ProductEntityContext = createContext<Product | null>(null)

export function ProductEntityProvider({
  product,
  children,
  /** В билдере без реального товара — показать демо. */
  useDemoFallback = false,
}: {
  product?: Product | null
  children: ReactNode
  useDemoFallback?: boolean
}) {
  const value = product ?? (useDemoFallback ? DEMO_PRODUCT : null)
  return (
    <ProductEntityContext.Provider value={value}>
      {children}
    </ProductEntityContext.Provider>
  )
}

export function useProductEntity(): Product | null {
  return useContext(ProductEntityContext)
}
