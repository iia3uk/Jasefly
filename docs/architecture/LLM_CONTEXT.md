# LLM_CONTEXT — machine-oriented architecture handoff

Do not treat historical audit docs as implementation guides.

## CURRENT ARCHITECTURE

- Platform: dual-runtime (PHP shared hosting · Node VPS/cloud)
- Domain features: **external packages** in **Jasefly-Modules** (local nested repo; future remote name `Jasefly-Modules`)
- Host/Core: infrastructure + composition only
- Canonical doc: `docs/architecture/CURRENT.md`
- Core git ≠ package source repository

## PACKAGE MODEL

- Identity: `module.json`
- Package source repo: `Jasefly-Modules/modules-src/{slug}/` (independent git)
- Tooling discovery: `JASEFLY_MODULES_ROOT` or auto `Jasefly-Modules/modules-src`
- Identity snapshot in Core: `release/catalog/manifests/{slug}.json`
- Index: `release/catalog/packages.json` (`sourceOwnership: external`, `externalRepository: Jasefly-Modules`)
- Artifact: `jasefly-module-{slug}-{version}.zip` (Module Hub / release storage — not Core git)
- ONE package · optional PHP entrypoint · optional Node entrypoint

## HOST OWNERSHIP

`backend/src/Modules/`: Access, Content, Ddos, Demo, Lab, Mail, Media, ModuleManager, Overload, Portfolio (deprecated shell), Scheduler, Seo, System, Template, Users  
Plus `backend/src/Core/*`, `backend/src/Platform/*`.

## PACKAGE OWNERSHIP

15 extracted (external): webhooks, comments, forms, analytics, newsletter, automation, notifications, support, translate, products, orders, payments, registration, blog, projects  

Missing package source in Core ≠ bug. Do not recreate under Core modules paths.

## PHP / NODE RUNTIME

Load installed ZIPs via PackageLoader / InstalledModuleLoader.  
Core runs without `Jasefly-Modules` present. Dev/build may use sibling modules root.

## WHERE TO ADD NEW FEATURES

1. New package under **Jasefly-Modules** `modules-src/{slug}/`
2. PlatformContext seams only
3. Generic host contract if Core must change — not slug allowlists
4. Build ZIP → certify → Hub/release → refresh Core catalog snapshots

## DO NOT

- Treat missing package source in Core as a defect to “fix” by re-embedding domains
- Commit product package sources into Core (`/Jasefly-Modules/` and `/modules-src/` gitignored)
- Create domain-specific PlatformContext methods
- Invent second PHP-only or Node-only package identities

## CURRENT VERIFIED BASELINE

- Final architecture regression: PASS (2026-08-08)
- Certify target: 15/15 extracted packages
- Dual-runtime: YES
