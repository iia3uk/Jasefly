# LLM_CONTEXT — machine-oriented architecture handoff

Do not treat historical audit docs as implementation guides.

## CURRENT ARCHITECTURE

- Platform: dual-runtime (PHP shared hosting · Node VPS/cloud)
- Domain features: **external packages** — not Core modules
- Host/Core: infrastructure + composition only
- Canonical doc: `docs/architecture/CURRENT.md`
- Core git ≠ package source repository

## PACKAGE SOURCE REPOSITORY (CANONICAL)

**https://github.com/iia3uk/Jasefly-Modules**

If you need implementation code for any of the 15 first-party modules:

1. Open / clone that repository first  
2. Do **not** search Core for “missing” `blog` / `projects` / `orders` / …  
3. Absence in Core is intentional — not a defect to fix by re-embedding domains

| Change type | Repository |
| --- | --- |
| Package implementation | https://github.com/iia3uk/Jasefly-Modules |
| Platform / SDK / Package Host / loaders / catalog | this Jasefly Core repo |

Local nested path (optional, gitignored by Core): `Jasefly-Modules/modules-src/{slug}/`  
Tooling: `JASEFLY_MODULES_ROOT` or auto-detect nested `Jasefly-Modules/modules-src`

## PACKAGE MODEL

- Identity: `module.json`
- Identity snapshot in Core: `release/catalog/manifests/{slug}.json`
- Index: `release/catalog/packages.json` (`sourceOwnership: external`, `repository: https://github.com/iia3uk/Jasefly-Modules`)
- Artifact: `jasefly-module-{slug}-{version}.zip` (Module Hub / release storage — not Core git)
- ONE package · optional PHP entrypoint · optional Node entrypoint

## HOST OWNERSHIP

`backend/src/Modules/`: Access, Content, Ddos, Demo, Lab, Mail, Media, ModuleManager, Overload, Portfolio (deprecated shell), Scheduler, Seo, System, Template, Users  
Plus `backend/src/Core/*`, `backend/src/Platform/*`.

## PACKAGE OWNERSHIP (15)

webhooks, comments, forms, analytics, newsletter, automation, notifications, support, translate, products, orders, payments, registration, blog, projects  

**Do not** recreate under `backend/src/Modules` or `runtime-node/src/modules`.

## PHP / NODE RUNTIME

Load installed ZIPs via PackageLoader / InstalledModuleLoader.  
Core runs without Jasefly-Modules present.

## WHERE TO ADD NEW FEATURES

1. New package in **Jasefly-Modules**  
2. PlatformContext seams only  
3. Generic host contract if Core must change — not slug allowlists  
4. Build ZIP → certify → Hub → refresh Core catalog snapshots

## DO NOT

- Treat missing package source in Core as a bug to “fix” by re-embedding domains  
- Restore extracted domains into Core Controllers / host allowlists  
- Commit product package sources into Core  
- Invent second PHP-only or Node-only package identities  

## CURRENT VERIFIED BASELINE

- Final architecture regression: PASS  
- Certify target: 15/15  
- Dual-runtime: YES  
- Package source remote: https://github.com/iia3uk/Jasefly-Modules  
