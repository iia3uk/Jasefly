# Agent instructions — Jasefly

Read [`CMS_MAP.md`](CMS_MAP.md) first for path lookup. Product rules: [`.cursorrules`](.cursorrules).

---

## ARCHITECTURE WARNING FOR AI AGENTS / LLMs

**Before changing Jasefly, do not assume the old “~30 core domain modules” model from historical commits or audits.**

### Mandatory read order

1. [`docs/architecture/LLM_CONTEXT.md`](docs/architecture/LLM_CONTEXT.md) — short machine facts  
2. [`docs/architecture/CURRENT.md`](docs/architecture/CURRENT.md) — canonical current architecture  
3. [`release/catalog/packages.json`](release/catalog/packages.json) — index of **external** domain packages  
4. Identity snapshots under [`release/catalog/manifests/`](release/catalog/manifests/) (not full package source)  
5. PHP: `backend/src/Platform/` (PlatformContext, Surfaces, contracts)  
6. Node: `runtime-node/src/packages/`, `runtime-node/src/platform/`

### Critical: package sources are NOT in Jasefly Core

**Extracted domain package source does not live in this repository.**

Canonical first-party package source repository:

**https://github.com/iia3uk/Jasefly-Modules**

| Need | Where |
| --- | --- |
| Code for one of the 15 first-party modules (blog, projects, orders, forms, …) | Clone/open **https://github.com/iia3uk/Jasefly-Modules** first |
| Package implementation change | **Jasefly-Modules** |
| Generic Platform / SDK / Package Host / loaders / catalog | **this Jasefly Core repo** |

Rules:

- Absence of `blog` / `projects` / `orders` / etc. under Core is **intentional**, not missing code.
- Do **not** restore them into `backend/src/Modules/{Domain}` or `runtime-node/src/modules/{domain}.ts`.
- Do **not** invent domain-specific `PlatformContext` methods or host slug allowlists for convenience.
- Local nested `Jasefly-Modules/` (if present) is the same repo, gitignored by Core; tooling: `JASEFLY_MODULES_ROOT` or auto-detect.
- ONE ZIP · one `module.json` · optional PHP + Node entrypoints (not two package products).

### Verified 15 (external)

webhooks · comments · forms · analytics · newsletter · automation · notifications · support · translate · products · orders · payments · registration · blog · projects

### Verified baseline

Certify 15/15 · Dual-runtime YES · Final architecture regression PASS · synthetic proof `runtime-node/tests/fixtures/modules/zed/`.

### Historical docs

Files marked **Historical / superseded** are records only — not implementation guides.
