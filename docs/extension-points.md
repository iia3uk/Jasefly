# Extension points

## Purpose

Show where to add a feature without patching Core bootstrap.

## How it works

| Goal | Extend |
| --- | --- |
| Ship with CMS (bundled) | `backend/src/Modules/{Name}/{Name}Module.php` + `frontend/src/modules/{name}/` |
| Soft-disable API | `registersRoutesWhenDisabled` + `SoftPluginGate` |
| Distribute ZIP | [Jasefly-Modules](https://github.com/iia3uk/Jasefly-Modules) → `build-module.js` → Module Manager; `bootPlatform` |
| Install-time side effects | `module.json` `hooks.*` + hook class |
| Subscribe to CMS events | `hooks()` or `boot()` → `EventDispatcher` / `$ctx->events()` |
| Gate SPA routes | `pluginGates.ts` + `RequirePlugin` |
| Admin screens | Module FE registry / blueprints / package `ctx.admin` |
| Builder widget | `initBuilderWidgets` register **or** package `ctx.builder.registerWidget` |
| Schema change | Core `0xx_*.sql` in `MigrationService::FILES`, or module/package migrations |
| Public FE route (package) | Platform FE `ctx.public.registerRoute` |
| Stay SDK-legal | Only `App\Platform\*` (+ package NS); certify |

Core must not import feature modules. Features must not edit `Bootstrap` / `index.php` for domain work.

## Execution flow

1. Choose bundled vs ZIP (see [glossary.md](glossary.md)).
2. Implement contract methods / Platform entry.
3. Add FE registration.
4. Run tests / certify (ZIP).
5. Enable via Plugins or Modules UI.

## Key components

- `ModuleInterface`
- `InstallableModuleInterface` / `AbstractPackageModule`
- `frontend/src/core/moduleRegistry.ts`
- `frontend/src/platform/`

## Files involved

- `backend/src/Core/Contract/ModuleInterface.php`
- `backend/src/Platform/Package/`
- `scripts/create-module.js`, `scripts/build-module.js`
- `docs/modules/` for ownership notes

## Related pages

- [module-system.md](module-system.md)
- [package-lifecycle.md](package-lifecycle.md)
- [platform-sdk.md](platform-sdk.md)
- [page-builder.md](page-builder.md)
- [events.md](events.md)

## Common mistakes

- Patching `routes/api_v1.php` for production routes.
- Importing Core from a ZIP package.
- Duplicating lifecycle docs inside a feature module README.

## Extension points

This page **is** the map — follow the table; detail lives in the linked pages once.

## See also

- [ownership-boundaries.md](ownership-boundaries.md)
- [testing.md](testing.md)
- [sdk-certification.md](sdk-certification.md)
