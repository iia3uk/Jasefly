import { describe, expect, it } from 'vitest'
import {
  permissionVisibleForPlugins,
  pluginForPath,
  pluginsForAdminResource,
  siteHasPlugin,
} from '@/core/pluginGates'

describe('pluginForPath', () => {
  it('gates projects via projects plugin; services via portfolio chrome; about/contact ungated', () => {
    expect(pluginForPath('/projects')).toBe('projects')
    expect(pluginForPath('/projects/foo')).toBe('projects')
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
  it('treats missing list as fail-closed (no spam to disabled plugin APIs)', () => {
    expect(siteHasPlugin(undefined, 'portfolio')).toBe(false)
    expect(siteHasPlugin(null, 'blog')).toBe(false)
  })

  it('aliases content ↔ site', () => {
    expect(siteHasPlugin(['content'], 'site')).toBe(true)
    expect(siteHasPlugin(['site'], 'content')).toBe(true)
    expect(siteHasPlugin(['blog'], 'portfolio')).toBe(false)
  })
})

describe('permissionVisibleForPlugins', () => {
  it('hides plugin-owned permissions when plugin is off', () => {
    expect(permissionVisibleForPlugins('commerce.manage', ['content'])).toBe(false)
    expect(permissionVisibleForPlugins('commerce.manage', ['products'])).toBe(true)
    expect(permissionVisibleForPlugins('content.view', ['content'])).toBe(true)
  })
})
