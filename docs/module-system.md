# Module system (host / Core)

## Purpose

Describe how **host-owned** modules under `backend/src/Modules/` are discovered, enabled, booted, and exposed.

Extracted domain features are **packages** (`modules-src/` → ZIP), not folders here. See [architecture/CURRENT.md](architecture/CURRENT.md) and [package-lifecycle.md](package-lifecycle.md).

## How it works

Every feature implements `ModuleInterface` (usually via `AbstractModule`). `ModuleRegistry::discover` scans `Modules/*/{Name}Module.php`, constructs instances, optionally registers classes from `app.modules.register`, then sorts by `priority()` ascending. After ZIP packages are loaded, `boot()` runs `boot()` + `hooks()` for enabled modules, dispatches `module.boot`, and may one-shot seed demo pages (`storage/.pages_seeded`).

Enablement for the registry is always read through `PluginStateService` → table `modules` (`is_enabled`). No row → module’s `enabled($app)` / config `modules.disabled` (default on). For ZIP packages the canonical status is elsewhere — see [package-lifecycle.md](package-lifecycle.md) and [glossary.md](glossary.md).

Admin UI label is **Plugins** (`/admin/plugins`); the PHP type is still Module.

## Execution flow

1. `discover()` — filesystem + manual register + `usort` by priority.
2. `InstalledModuleLoader::loadEnabled()` — see package docs (adapters enter the same list).
3. `boot()` — for each **on** module: `boot` + `wireHooks`; failures → `loadFailures` stage `boot`.
4. Dispatch `module.boot`; `autoSeedPluginPages()` if marker absent.
5. HTTP: `registerRoutes` for on modules **or** `registersRoutesWhenDisabled()`.
6. Aggregates used elsewhere: `adminNav`, `blueprints`, `blocks`, `publicRoutes`, `globalMiddleware`, `catalog()`.

### Known priority examples

Lower boots first. Examples from code: ModuleManager `5`, System `10`, Scheduler `12`, Users/Ddos `15`, Content `20`, Media `25`; `AbstractModule` default `100`.

## Key components

| Component | Role |
| --- | --- |
| `ModuleInterface` / `AbstractModule` | Contract |
| `ModuleRegistry` | Discover, boot, routes, catalog |
| `PluginStateService` | Read/write `modules.is_enabled` |
| `PluginCatalogMeta` | Catalog descriptions / requires / suggests |
| `PageSeedService` | Demo/default pages from `demoPages()` |

## Files involved

- `backend/src/Core/Contract/ModuleInterface.php`
- `backend/src/Core/AbstractModule.php`
- `backend/src/Core/ModuleRegistry.php`
- `backend/src/Services/PluginStateService.php`
- `backend/src/Modules/*/*Module.php`
- `frontend/src/modules/*` (compile-time FE mirror)
- `frontend/src/core/moduleRegistry.ts`

## Related pages

- [glossary.md](glossary.md)
- [plugin-gates.md](plugin-gates.md)
- [package-lifecycle.md](package-lifecycle.md)
- [events.md](events.md)

## Common mistakes

- Patching `Bootstrap` or `index.php` to add a feature instead of a module folder.
- Expecting disabled modules’ `boot()` to run — only enabled modules boot.
- Confusing Plugins admin toggle for packages — packages delegate to `ModulePackageService`.

## Extension points

- Add `backend/src/Modules/{Name}/{Name}Module.php` + FE under `frontend/src/modules/{name}/`.
- Contribute nav, blueprints, blocks, publicRoutes, hooks, settingsSchema, demoPages.
- See [extension-points.md](extension-points.md).

## See also

- [plugin-gates.md](plugin-gates.md)
- [package-lifecycle.md](package-lifecycle.md)
- [events.md](events.md)
- [ownership-boundaries.md](ownership-boundaries.md)
