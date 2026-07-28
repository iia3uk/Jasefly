import { describe, expect, it } from 'vitest'
import {
  pluginForPath,
  pluginsForAdminResource,
  siteHasPlugin,
} from '@/core/pluginGates'

describe('pluginForPath', () => {
  it('gates portfolio data paths but not about/contact marketing pages', () => {
    expect(pluginForPath('/projects')).toBe('portfolio')
    expect(pluginForPath('/projects/foo')).toBe('portfolio')
    expect(pluginForPath('/services')).toBe('portfolio')
    expect(pluginForPath('/about')).toBeNull()
    expect(pluginForPath('/contact')).toBeNull()
    expect(pluginForPath('/')).toBeNull()
  })

  it('gates blog/products/lab and absolute URLs by pathname', () => {
    expect(pluginForPath('/blog')).toBe('blog')
    expect(pluginForPath('/products')).toBe('products')
    expect(pluginForPath('/lab')).toBe('lab')
    expect(pluginForPath('https://example.com/blog/post')).toBe('blog')
  })
})

describe('pluginsForAdminResource', () => {
  it('maps CRUD resources to owning plugins', () => {
    expect(pluginsForAdminResource('projects')).toEqual(['projects'])
    expect(pluginsForAdminResource('blog')).toEqual(['blog'])
    expect(pluginsForAdminResource('orders')).toEqual(['orders', 'payments'])
    expect(pluginsForAdminResource('pages')).toBeNull()
  })
})

describe('siteHasPlugin', () => {
  it('treats missing list as all-enabled (legacy)', () => {
    expect(siteHasPlugin(undefined, 'portfolio')).toBe(true)
    expect(siteHasPlugin(null, 'blog')).toBe(true)
  })

  it('aliases content ↔ site', () => {
    expect(siteHasPlugin(['content'], 'site')).toBe(true)
    expect(siteHasPlugin(['site'], 'content')).toBe(true)
    expect(siteHasPlugin(['blog'], 'portfolio')).toBe(false)
  })
})
