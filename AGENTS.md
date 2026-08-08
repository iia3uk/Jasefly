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

### Critical: package sources are NOT in this repository

**Extracted domain packages intentionally DO NOT live in the Core repository source tree.**

- `modules-src/` is a **local gitignored** authoring workspace (optional on a developer machine).
- Absence of `modules-src/{slug}/` is **not** missing Core code and **not** a reason to recreate domains in Core.
- Do **not** regenerate:
  - `backend/src/Modules/{Domain}`
  - `runtime-node/src/modules/{domain}.ts`
- Package implementations ship separately via **Module Hub / release ZIP artifacts** (`jasefly-module-{slug}-{version}.zip`).
- Core contains: contracts · loaders · catalog · tooling · host modules · approved test fixtures.
- If you need a specific package’s implementation, work from its **external** package source / artifact — do not pull domain ownership back into Core.

### Critical ownership rules

- **Core no longer owns extracted domain modules.**
- Do **not** move package code back into Core Controllers or host static slug/table/resource allowlists for convenience.
- Do **not** invent domain-specific `PlatformContext` methods without an architectural need.
- Do **not** treat PHP package and Node package as two products — **one ZIP, one identity, optional entrypoints**.
- New functional domains are **packages by default** unless they require host/core ownership.
- Packages interact via: PlatformContext · capabilities · events · resources · **surfaces** · lifecycle contracts.
- If a task needs a host change for a specific package slug: **stop** and check for a missing generic seam first.

### Verified baseline (do not “re-extract” to re-prove)

PHP 1277/0 · Node 71/0 · Certify 15/15 · MySQL live 15/15 · Combos YES · Dual-runtime YES · Final architecture regression PASS.

Synthetic dual-runtime proof: `runtime-node/tests/fixtures/modules/zed/`.

### Historical docs

Files marked **Historical / superseded** (e.g. older extraction audits) are records only — not implementation guides.
