# Architecture

## Purpose

Show the layer stack and ownership. Detail lives under [`docs/`](docs/README.md).

## How it works

Jasefly is **one architecture, two production runtimes** (plus a dual harness for dev/CI):

```
                         Contracts (SoT)
                             │
              ┌──────────────┴──────────────┐
              │                             │
         PHP Runtime                   Node Runtime
         backend/                      runtime-node/
       Shared Hosting                  VPS / Cloud
              │                             │
              └──────────────┬──────────────┘
                             │
                    React Frontend
             Public Site · Admin · Builder
                             │
                 Platform SDK · MCP · ZIP modules
```

**Dual** (`jasefly dev|test --runtime=dual`) boots PHP + Node together for local work and the behavioral parity gate. It is not a separate production server.

Inside each runtime, ownership is the same shape:

```
REST /api/v1 · /api
        │
Platform SDK         packages → App\Platform\* / FE platform only
        │
Modules              bundled · ZIP packages
        │
Core / infra         router · DB · auth · registry · events · middleware
        │
Database             MySQL (typical prod) · SQLite/Pg via transpiler
```

Live PHP HTTP routes are registered by `ModuleRegistry` from modules — not by editing `backend/routes/api_v1.php` (test/legacy).

Enable stores and Plugin/Package terminology: [`docs/glossary.md`](docs/glossary.md). Runtime matrix: [`docs/runtime-target-matrix.md`](docs/runtime-target-matrix.md).

## Execution flow

- PHP request path: [`docs/bootstrap-and-request.md`](docs/bootstrap-and-request.md)
- Dual / Node ops: [`docs/dual-runtime.md`](docs/dual-runtime.md)

## Key components

| Layer | Entry |
| --- | --- |
| Unified CLI | `scripts/jasefly/cli.mjs` |
| PHP API | `backend/public/index.php` · `backend/src/Bootstrap.php` |
| Node API | `runtime-node/src/index.ts` |
| Contracts | `contracts/` |
| Registry (PHP) | `backend/src/Core/ModuleRegistry.php` |
| SPA | `frontend/src/main.tsx` |

## Files involved

- This file (overview only)
- [`docs/ownership-boundaries.md`](docs/ownership-boundaries.md)
- [`docs/module-system.md`](docs/module-system.md)
- [`docs/platform-sdk.md`](docs/platform-sdk.md)
- [`docs/core-freeze-1.0.md`](docs/core-freeze-1.0.md)

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
