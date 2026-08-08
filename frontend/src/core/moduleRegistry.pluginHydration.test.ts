import { beforeEach, describe, expect, it } from 'vitest'
import {
  arePluginsHydrated,
  isPluginEnabledReady,
  setEnabledPlugins,
  setPluginEnabled,
} from '@/core/moduleRegistry'

describe('plugin enable hydration', () => {
  beforeEach(() => {
    setEnabledPlugins(['system', 'users', 'content', 'media', 'seo', 'forms'])
  })

  it('keeps optional plugins off after SoT hydrate', () => {
    expect(arePluginsHydrated()).toBe(true)
    expect(isPluginEnabledReady('forms')).toBe(true)
    expect(isPluginEnabledReady('comments')).toBe(false)
    expect(isPluginEnabledReady('notifications')).toBe(false)
    expect(isPluginEnabledReady('overload')).toBe(false)
  })

  it('package setPluginEnabled does not fail-open other optionals', () => {
    setEnabledPlugins(['system', 'users', 'content', 'media', 'seo'])
    setPluginEnabled('forms', true)
    expect(isPluginEnabledReady('forms')).toBe(true)
    expect(isPluginEnabledReady('notifications')).toBe(false)
    expect(isPluginEnabledReady('comments')).toBe(false)
    expect(isPluginEnabledReady('overload')).toBe(false)
  })

  it('setPluginEnabled alone never marks map hydrated (race with /site)', async () => {
    const mod = await import('@/core/moduleRegistry?hydrate-race=' + Date.now())
    expect(mod.arePluginsHydrated()).toBe(false)
    expect(mod.isPluginEnabledReady('notifications')).toBe(false)

    mod.setPluginEnabled('forms', true)
    expect(mod.arePluginsHydrated()).toBe(false)
    expect(mod.isPluginEnabledReady('forms')).toBe(false)
    expect(mod.isPluginEnabledReady('notifications')).toBe(false)
    expect(mod.isPluginEnabledReady('overload')).toBe(false)

    mod.setEnabledPlugins(['system', 'users', 'content', 'media', 'seo', 'forms'])
    expect(mod.arePluginsHydrated()).toBe(true)
    expect(mod.isPluginEnabledReady('forms')).toBe(true)
    expect(mod.isPluginEnabledReady('notifications')).toBe(false)
  })
})
