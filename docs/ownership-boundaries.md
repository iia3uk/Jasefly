# Ownership boundaries

## Purpose

State which layer owns which responsibility so features are not patched into core.

## How it works

The CMS is a modular PHP API plus a React SPA. Domain features live in modules. Core provides routing, DB, JWT, registry, and shared controllers. ZIP packages talk only through the Platform SDK.

```
Frontend (React)     admin · builder · modules · platform FE SDK
        │
REST /api/v1 · /api
        │
Platform SDK         App\Platform\*  (ZIP packages only)
        │
Modules              bundled App\Modules\* · ZIP App\PackageModules\*
        │
Core                 Router · Database · Jwt · ModuleRegistry · EventDispatcher · Middleware
        │
Database             MySQL (prod) · SQLite/Pg via SqlTranspiler
```

## Execution flow

Not a runtime flow — a responsibility map. At request time, ownership follows [bootstrap-and-request.md](bootstrap-and-request.md).

## Key components

| Layer | Owns | Does not own |
| --- | --- | --- |
| `public/index.php` | Error handlers, global middleware stack, dispatch | Domain routes |
| `Bootstrap` | Autoload, env, config, DB, container, registry lifecycle | Route definitions |
| `ModuleRegistry` | Discovery, enable gating, boot, route aggregation, events | Domain business logic |
| `Modules/*` | Domain routes, hooks, blueprints, global MW | Core infra |
| `Controllers/*` | Shared HTTP adapters wired by modules | Self-registration |
| `App\Platform\*` | Public surface for ZIP packages | Direct Core types in package code |
| FE `modules/*` | Compile-time domain UI | Hosting of ZIP FE (that is `/modules/{slug}/`) |

## Files involved

- `backend/public/index.php`
- `backend/src/Bootstrap.php`
- `backend/src/Core/ModuleRegistry.php`
- `backend/src/Core/Contract/ModuleInterface.php`
- `backend/src/Platform/`
- `frontend/src/core/moduleRegistry.ts`
- `frontend/src/platform/`

## Related pages

- [glossary.md](glossary.md)
- [bootstrap-and-request.md](bootstrap-and-request.md)
- [module-system.md](module-system.md)
- [platform-sdk.md](platform-sdk.md)

## Common mistakes

- Importing `App\Core\*` from a ZIP package.
- Adding domain routes in `routes/api_v1.php` (not used by live HTTP).
- Putting feature UI in `shared/` instead of `frontend/src/modules/{name}/`.

## Extension points

See [extension-points.md](extension-points.md).

## See also

- [module-system.md](module-system.md)
- [package-lifecycle.md](package-lifecycle.md)
- [extension-points.md](extension-points.md)
