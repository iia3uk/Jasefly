# Architecture

## Purpose

Show the layer stack and ownership. Detail: [`docs/architecture/CURRENT.md`](docs/architecture/CURRENT.md).

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
                 Platform SDK · MCP
                             │
              ONE PACKAGE (module.json)
         external packages → Module Hub / release ZIP
        optional PHP · optional Node entrypoints
```

**Dual** (`jasefly dev|test --runtime=dual`) boots PHP + Node together for local work and behavioral parity. It is not a separate production server.

### Ownership shape

```
REST /api/v1 · /api
        │
Platform SDK         packages → App\Platform\* / Node PlatformContext only
        │
Host modules         backend/src/Modules/* (infra/composition — not extracted domains)
        │
ZIP packages         external Module Hub · App\PackageModules\* / package node entry (local modules-src gitignored)
        │
Core / infra         router · DB · auth · registry · events · surfaces · middleware
        │
Database             MySQL (typical prod) · SQLite/Pg via transpiler
```

Extracted domains (15) are **package-owned** — listed in [`release/catalog/packages.md`](release/catalog/packages.md).  
Portfolio remains a **deprecated host composition shell**, not a product ZIP.

## Key components

| Layer | Entry |
| --- | --- |
| Unified CLI | `scripts/jasefly/cli.mjs` |
| PHP API | `backend/public/index.php` · `backend/src/Bootstrap.php` |
| Node API | `runtime-node/src/index.ts` |
| Package host (Node) | `runtime-node/src/packages/` |
| Platform SDK (PHP) | `backend/src/Platform/` |
| Contracts | `contracts/` |
| Agent handoff | `AGENTS.md` · `docs/architecture/LLM_CONTEXT.md` |

## Related pages

- [docs/architecture/CURRENT.md](docs/architecture/CURRENT.md)
- [docs/ownership-boundaries.md](docs/ownership-boundaries.md)
- [docs/package-lifecycle.md](docs/package-lifecycle.md)
- [docs/platform-sdk.md](docs/platform-sdk.md)
- [CMS_MAP.md](CMS_MAP.md)

## Common mistakes

- Treating PHP and Node as two package products.
- Re-embedding extracted domains into `backend/src/Modules` or `runtime-node/src/modules`.
- Using historical audit docs as current guides.
