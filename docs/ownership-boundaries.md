# Ownership boundaries

## Purpose

State which layer owns which responsibility so features are not patched into core.

## How it works

Dual-runtime platform: Host/Core owns infrastructure; **domain features are external ZIP packages** (one ZIP identity with optional PHP/Node entrypoints). Core git publishes contracts/loaders/catalog — not product package source. Optional local `modules-src/` is gitignored. Packages talk only through the Platform SDK / PlatformContext.

```
Frontend (React)     admin · builder · package FE loader · platform FE SDK
        │
REST /api/v1 · /api
        │
Platform SDK         App\Platform\* / Node PlatformContext  (packages only)
        │
Host modules         App\Modules\*  (Access, Content, Mail, Scheduler, … — not extracted domains)
        │
ZIP packages         App\PackageModules\* · package backend/node register(ctx)
        │
Core                 Router · Database · Jwt · ModuleRegistry · EventCatalog · Surfaces · Middleware
        │
Database             MySQL (prod) · SQLite/Pg via SqlTranspiler
```

Canonical list: [`architecture/CURRENT.md`](architecture/CURRENT.md) · [`../release/catalog/packages.md`](../release/catalog/packages.md).

## Execution flow

Not a runtime flow — a responsibility map. At request time, ownership follows [bootstrap-and-request.md](bootstrap-and-request.md).

## Key components

| Layer | Owns | Does not own |
| --- | --- | --- |
| `public/index.php` | Error handlers, global middleware stack, dispatch | Domain routes |
| `Bootstrap` | Autoload, env, config, DB, container, registry lifecycle | Route definitions |
| `ModuleRegistry` | Discovery, enable gating, boot, route aggregation, events | Domain business logic |
| `Modules/*` (host) | Infra/composition routes, chrome, scheduler, mail | Extracted product domains (those are ZIP packages) |
| ZIP packages | Domain routes/FE/migrations/surfaces | Core internals |
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
- Putting feature UI in `shared/` instead of package FE / host pages via `hostPageKey`.
- Moving extracted packages back into `backend/src/Modules` or `runtime-node/src/modules`.

## Extension points

See [extension-points.md](extension-points.md).

## See also

- [module-system.md](module-system.md)
- [package-lifecycle.md](package-lifecycle.md)
- [extension-points.md](extension-points.md)
