# LLM_CONTEXT — machine-oriented architecture handoff

Do not treat historical audit docs as implementation guides.

## CURRENT ARCHITECTURE

- Platform: dual-runtime (PHP shared hosting · Node VPS/cloud)
- Domain features: **external packages**, not Core modules
- Host/Core: infrastructure + composition only
- Canonical doc: `docs/architecture/CURRENT.md`
- Core git ≠ package source repository

## PACKAGE MODEL

- Identity: `module.json`
- Identity snapshot in Core: `release/catalog/manifests/{slug}.json`
- Index: `release/catalog/packages.json` (`sourceOwnership: external package/module distribution`)
- Artifact: `jasefly-module-{slug}-{version}.zip` (Module Hub / release storage — **not** Core git)
- Local authoring (optional, **gitignored**): `modules-src/{slug}/`
- ONE package · optional PHP entrypoint · optional Node entrypoint

## HOST OWNERSHIP

`backend/src/Modules/`: Access, Content, Ddos, Demo, Lab, Mail, Media, ModuleManager, Overload, Portfolio (deprecated shell), Scheduler, Seo, System, Template, Users  
Plus `backend/src/Core/*`, `backend/src/Platform/*`, shared Controllers/Services used by host.

## PACKAGE OWNERSHIP

15 extracted (external): webhooks, comments, forms, analytics, newsletter, automation, notifications, support, translate, products, orders, payments, registration, blog, projects  

Not in Core source. Missing `modules-src/` ≠ bug. Do not recreate under `backend/src/Modules` or `runtime-node/src/modules`.

## PHP RUNTIME

- Boot: `InstalledModuleLoader` + `PackageModuleAdapter`
- SDK: `App\Platform\PlatformContext`
- Surfaces registry: `App\Platform\Surfaces\PackageSurfaceRegistry`
- Lifecycle: `ModulePackageService`
- Core runs without domain package sources present; packages load from installed ZIPs

## NODE RUNTIME

- Boot: `runtime-node/src/packages/PackageLoader.ts`
- SDK: `createPlatformContext` / `ctx.surfaces()` / `ctx.http().permission()`
- Host baselines: `runtime-node/src/system/hostBaselines.ts`
- Domain code lives in package artifact `backend/node/`, not host `src/modules/{domain}.ts`

## PACKAGE LIFECYCLE

States: installed → enabled ↔ disabled · failed/quarantined · uninstalled  
Install from ZIP / Module Hub. Install records `installed`; PHP may explicit-transition install→enabled for BC after health.

## SURFACE REGISTRY

Packages declare `surfaces` (trash, dashboard, sitemap, media, content_acl, schema).  
Host consumers merge HOST baseline ∪ registry. No extracted-slug hardcodes.

## SETTINGS SoT

Canonical: `modules.settings` JSON keyed by `modules.name` (= slug).  
PHP SettingsAdapter: bag first; `settings_kv` fallback + mirror.

## SCHEMA OWNERSHIP

`surfaces.schema` role=`owner` — one owner per table.  
orders owns `orders`; payments consumes (legacy CREATE IF NOT EXISTS frozen).

## SECURITY / ACL

Package declares permission → host resolves principal → fail-closed.  
Node: no admin-role soft bypass on `permission()`.

## MCP

Lifecycle tools slug-agnostic via installed_modules.  
`cms_list_resources` = UX hints ∪ runtime `surfaces.content_acl`.

## WHERE TO ADD NEW FEATURES

1. Prefer a new **external package** (local `modules-src/` workspace or separate package repo) — not Core
2. Use PlatformContext seams (http, events, surfaces, settings, permissions, scheduler)
3. If host must change: require a **generic** contract — not a slug allowlist
4. Build ZIP → certify → publish to Hub/release storage → refresh Core catalog identity snapshots

## DO NOT

- Treat missing package source in Core git as a defect to “fix” by re-embedding domains
- Re-create `backend/src/Modules/{Domain}` or `runtime-node/src/modules/{domain}.ts` for extracted packages
- Commit product package sources into Core (`modules-src/` is gitignored)
- Create domain-specific PlatformContext methods (`blogPosts()`, …)
- Create static host whitelists of package tables/resources/slugs
- Invent a second PHP-only or Node-only package identity
- Rewrite released migration checksums
- Start extraction/redesign without an explicit user request

## CURRENT VERIFIED BASELINE

- PHP: 1277 / 0
- Node: 71 / 0
- Certify: 15/15
- MySQL live: 15/15
- Combos: YES
- Dual-runtime: YES
- Final architecture regression: PASS
- Date: 2026-08-08
- Git: look up commit message `refactor: finalize package architecture and separate domain modules from core`
