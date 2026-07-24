/**
 * Frontend module registry — mirrors backend ModuleRegistry.
 * Each feature package exports a ModuleManifest for navigation, routing,
 * blueprints and builder blocks.
 */

import type { Blueprint, BlockDefinition, AdminScreen, PublicRouteDef, SettingsField } from '@/core/pluginTypes'

export type ModuleManifest = {
  name: string
  label: string
  enabled?: boolean
  /** Public SPA routes contributed by this module. */
  publicRoutes?: PublicRouteDef[]
  /** Admin sidebar entries contributed by this module. */
  adminNav?: Array<{ group: string; path: string; label: string; permission?: string; icon?: string }>
  /** Declarative content type blueprints (mirror of backend). */
  blueprints?: Blueprint[]
  /** Builder blocks contributed by this module (renderer + settings schema). */
  blocks?: BlockDefinition[]
  /** Custom admin screens beyond generic CRUD (e.g. dedicated editors). */
  adminScreens?: AdminScreen[]
}

/**
 * A plugin's settings field as returned by the backend `settingsSchema()`.
 * Mirrors the PHP shape (key/label/type/default/help/options); `type` is a
 * loose union so backend-declared widgets (e.g. "checkbox") don't fight the
 * frontend's stricter `SettingsField` union.
 */
export type PluginSettingField = {
  key: string
  label: string
  type: string
  default?: unknown
  help?: string
  options?: Array<{ value: string; label: string }>
}

/** Runtime state of a plugin from /admin/plugins (enable flag + settings). */
export type PluginDepRef = {
  name: string
  label: string
  is_enabled?: boolean
}

export type PluginState = {
  name: string
  label?: string
  description?: string
  long_description?: string
  category?: string
  category_label?: string
  is_enabled: boolean
  requires?: string[]
  requires_labels?: PluginDepRef[]
  suggests?: string[]
  suggests_labels?: PluginDepRef[]
  missing_requires?: string[]
  required_by?: string[]
  required_by_labels?: PluginDepRef[]
  can_enable?: boolean
  can_disable?: boolean
  block_enable_reason?: string | null
  block_disable_reason?: string | null
  settings: Record<string, unknown>
  settings_schema: PluginSettingField[]
  demo_pages?: Array<{ slug: string; title: string }>
}

const manifests: ModuleManifest[] = []

/** Runtime disabled set, populated from /admin/plugins or /site.enabled_plugins. */
const runtimeDisabled = new Set<string>()
let pluginsHydrated = false

/** Backend `content` ↔ frontend `site` are the same surface. */
const PLUGIN_ALIASES: Record<string, string[]> = {
  content: ['content', 'site'],
  site: ['site', 'content'],
}

const KNOWN_PLUGINS = [
  'system', 'users', 'content', 'site', 'media', 'portfolio', 'projects', 'blog',
  'services', 'seo', 'template', 'products', 'payments', 'mail', 'registration',
  'ddos', 'webhooks', 'translate', 'support', 'lab', 'scheduler', 'forms',
  'automation', 'notifications', 'newsletter', 'orders', 'comments', 'analytics',
]

/** Subscribers notified whenever plugin enable/disable state changes
 *  (so the admin sidebar / screens can re-render). */
const pluginStateListeners = new Set<() => void>()

function notifyPluginStateListeners(): void {
  for (const cb of pluginStateListeners) {
    try { cb() } catch { /* ignore subscriber errors */ }
  }
}

function expandEnabled(names: Iterable<string>): Set<string> {
  const enabled = new Set<string>()
  for (const name of names) {
    enabled.add(name)
    for (const alias of PLUGIN_ALIASES[name] ?? []) enabled.add(alias)
  }
  return enabled
}

function syncDisabledFromEnabled(enabled: Set<string>): void {
  runtimeDisabled.clear()
  const known = new Set<string>([...KNOWN_PLUGINS, ...manifests.map((m) => m.name)])
  for (const name of known) {
    if (!enabled.has(name)) runtimeDisabled.add(name)
  }
  pluginsHydrated = true
  notifyPluginStateListeners()
}

/** Subscribe to plugin enable/disable changes. Returns an unsubscribe fn. */
export function subscribePluginState(cb: () => void): () => void {
  pluginStateListeners.add(cb)
  return () => { pluginStateListeners.delete(cb) }
}

export function registerModule(manifest: ModuleManifest): void {
  if (!manifests.find((m) => m.name === manifest.name)) {
    manifests.push(manifest)
  }
}

/** Apply plugin states fetched from the backend (toggles runtime visibility). */
export function setPluginStates(states: PluginState[]): void {
  const enabled = expandEnabled(states.filter((s) => s.is_enabled).map((s) => s.name))
  syncDisabledFromEnabled(enabled)
}

/** Hydrate from public `/site` payload (`enabled_plugins`). */
export function setEnabledPlugins(names: string[]): void {
  syncDisabledFromEnabled(expandEnabled(names))
}

/** Mark a single plugin enabled/disabled at runtime (after a toggle action). */
export function setPluginEnabled(name: string, enabled: boolean): void {
  const aliases = PLUGIN_ALIASES[name] ?? [name]
  if (enabled) {
    for (const a of aliases) runtimeDisabled.delete(a)
  } else {
    for (const a of aliases) runtimeDisabled.add(a)
  }
  pluginsHydrated = true
  notifyPluginStateListeners()
}

/** True when the plugin is on (or state not hydrated yet — fail-open for admin boot UI). */
export function isPluginEnabled(name: string): boolean {
  if (!pluginsHydrated) return true
  const aliases = PLUGIN_ALIASES[name] ?? [name]
  return aliases.every((a) => !runtimeDisabled.has(a))
}

/**
 * Strict gate for API calls: false until /site or /admin/plugins hydrates.
 * Prevents fail-open spam like GET /admin/projects → 404 when Projects is off.
 */
export function isPluginEnabledReady(name: string): boolean {
  return pluginsHydrated && isPluginEnabled(name)
}

export function arePluginsHydrated(): boolean {
  return pluginsHydrated
}

export function getModules(): ModuleManifest[] {
  return manifests.filter((m) => m.enabled !== false && !runtimeDisabled.has(m.name))
}

/** All registered manifests regardless of enabled state (for the Plugins page). */
export function getAllModules(): ModuleManifest[] {
  return manifests
}

/** Sidebar groups by plugin label (enabled modules only, registration order). */
export function getAdminNavGrouped(): Record<string, ModuleManifest['adminNav']> {
  const grouped: Record<string, NonNullable<ModuleManifest['adminNav']>> = {}
  const seenPaths = new Set<string>()
  for (const mod of getModules()) {
    const items = mod.adminNav ?? []
    if (items.length === 0) continue
    const section = mod.label || mod.name
    grouped[section] ??= []
    for (const item of items) {
      if (seenPaths.has(item.path)) continue
      seenPaths.add(item.path)
      grouped[section]!.push(item)
    }
  }
  return grouped
}

/** Aggregated blueprints across all enabled modules, keyed by resource key. */
export function getBlueprints(): Record<string, Blueprint> {
  const out: Record<string, Blueprint> = {}
  for (const mod of getModules()) {
    for (const bp of mod.blueprints ?? []) {
      out[bp.key] = bp
    }
  }
  return out
}

/** Aggregated builder blocks across all enabled modules. */
export function getBlocks(): BlockDefinition[] {
  const out: BlockDefinition[] = []
  for (const mod of getModules()) {
    for (const block of mod.blocks ?? []) {
      out.push(block)
    }
  }
  return out
}

/** Aggregated custom admin screens across all enabled modules. */
export function getAdminScreens(): AdminScreen[] {
  const out: AdminScreen[] = []
  for (const mod of getModules()) {
    for (const screen of mod.adminScreens ?? []) {
      out.push(screen)
    }
  }
  return out
}

/** Aggregated public routes across all enabled modules. */
export function getPublicRoutes(): PublicRouteDef[] {
  const out: PublicRouteDef[] = []
  for (const mod of getModules()) {
    for (const route of mod.publicRoutes ?? []) {
      out.push(route)
    }
  }
  return out
}

export type { Blueprint, BlockDefinition, AdminScreen, PublicRouteDef, SettingsField }
