# Architecture

## Purpose

Show the layer stack and ownership. Detail lives under [`docs/`](docs/README.md).

## How it works

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

Live HTTP routes are registered by `ModuleRegistry` from modules — not by editing `backend/routes/api_v1.php` (test/legacy).

Enable stores and Plugin/Package terminology: [`docs/glossary.md`](docs/glossary.md).

## Execution flow

See [`docs/bootstrap-and-request.md`](docs/bootstrap-and-request.md).

## Key components

| Layer | Entry |
| --- | --- |
| API front controller | `backend/public/index.php` |
| Bootstrap | `backend/src/Bootstrap.php` |
| Registry | `backend/src/Core/ModuleRegistry.php` |
| SPA | `frontend/src/main.tsx` |

## Files involved

- This file (overview only)
- [`docs/ownership-boundaries.md`](docs/ownership-boundaries.md)
- [`docs/module-system.md`](docs/module-system.md)
- [`docs/platform-sdk.md`](docs/platform-sdk.md)

## Related pages

- [docs/README.md](docs/README.md)
- [CMS_MAP.md](CMS_MAP.md)

## Common mistakes

- Treating this file as the full system manual.
- Collapsing SoftPluginGate, `modules` table, and `installed_modules` into one concept.

## Extension points

See [`docs/extension-points.md`](docs/extension-points.md).

## See also

- [docs/ownership-boundaries.md](docs/ownership-boundaries.md)
- [docs/glossary.md](docs/glossary.md)
- [DEVELOPMENT.md](DEVELOPMENT.md)
