# Current package architecture (canonical)

**Status:** CURRENT · Final architecture regression **PASS** (2026-08-08)

Jasefly is **not** a core with ~30 built-in domain modules.

**Core repository ≠ package source repository.** This git tree publishes Host/Core, Platform SDK, package loaders, catalog, and tooling. Domain package **implementations** are external (Module Hub / release ZIPs). Optional local authoring workspace `modules-src/` is gitignored.

## Principles

| Principle | Meaning |
| --- | --- |
| ONE PACKAGE | One slug · one `module.json` · one release ZIP |
| ONE IDENTITY | PHP and Node are optional **adapters**, not separate products |
| HOST / CORE | Platform infrastructure only |
| DOMAIN = PACKAGE | Product features ship as installable **external** packages |
| CORE RUNS WITHOUT PACKAGE SOURCES | Install ZIPs at runtime; missing `modules-src/` is normal |

## Authoring & artifact

| Role | Path |
| --- | --- |
| Identity snapshot (in Core) | `release/catalog/manifests/{slug}.json` |
| Derived catalog | `release/catalog/packages.json` |
| Local authoring (optional, gitignored) | `modules-src/{slug}/` |
| Distributable ZIP | `jasefly-module-{slug}-{version}.zip` → Module Hub / `release/modules/` (not Core git) |
| CI / SDK fixtures | `backend/tests/fixtures/modules/`, `runtime-node/tests/fixtures/modules/zed/` |

Build ZIP (needs local source or fixture): `node scripts/build-module.js {slug} --yes`  
Refresh catalog: `node scripts/build-package-catalog.mjs`

## Host / Core (bundled under `backend/src/Modules/`)

Access · Content · Ddos · Demo · Lab · Mail · Media · ModuleManager · Overload · Portfolio (**deprecated** composition shell, not a product ZIP) · Scheduler · Seo · System · Template · Users

Plus Core/Platform infra: Router, DB, Auth/ACL, ModuleRegistry, Platform SDK, EventCatalog, PackageSurfaceRegistry, MPM services.

## Extracted domain packages (15, external)

See [`release/catalog/packages.md`](../../release/catalog/packages.md). All fifteen are **dual-runtime** (PHP + Node entrypoints on the same ZIP).

webhooks · comments · forms · analytics · newsletter · automation · notifications · support · translate · products · orders · payments · registration · blog · projects

`sourceOwnership`: **external package/module distribution** — not bundled Core modules.

## Runtime adapters

| Adapter | Loads |
| --- | --- |
| PHP | `entrypoints.backend` → `AbstractPackageModule` / `PlatformContext` |
| Node | `entrypoints.node` → `register(ctx)` / PackageLoader |

## Key contracts

- Surfaces: `module.json` → `surfaces` + `ctx.surfaces().register()` → SoftDelete / Dashboard / Sitemap / MediaUsage / content ACL / schema ownership
- Settings SoT: `modules.settings` JSON (`modules.name` = slug); PHP may mirror/fallback `settings_kv`
- Lifecycle: `installed` → `enabled` ↔ `disabled` · `failed`/`quarantined` · `uninstalled`
- Packages talk only through Platform SDK / PlatformContext

## Verified baseline

| Gate | Result |
| --- | --- |
| PHP suite | 1277 / 0 |
| Node suite | 71 / 0 |
| Certify | 15 / 15 |
| MySQL live lifecycle | 15 / 15 |
| Combos | YES |
| Dual-runtime | YES |
| Final architecture regression | PASS |

## Related

- LLM short context: [LLM_CONTEXT.md](LLM_CONTEXT.md)
- Agent rules: [`../../AGENTS.md`](../../AGENTS.md)
- PHP freeze notes: [../php-architecture-final.md](../php-architecture-final.md)
- Cross-runtime: [../cross-runtime-architecture.md](../cross-runtime-architecture.md)
