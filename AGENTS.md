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

### Critical: package sources live in Jasefly-Modules

**Extracted domain packages intentionally DO NOT live in the Core repository source tree.**

- First-party package source repository: local nested **`Jasefly-Modules/`** (independent git; ignored by Core). Future remote name expected: `Jasefly-Modules` (no URL until created).
- Optional env: `JASEFLY_MODULES_ROOT` for tooling discovery.
- Absence of package sources in Core is **intentional** — not missing Core code.
- Do **not** regenerate `backend/src/Modules/{Domain}` or `runtime-node/src/modules/{domain}.ts`.
- Implementations ship via Module Hub / release ZIPs; Core has contracts · loaders · catalog · tooling · host modules · approved fixtures.

### Critical ownership rules

- **Core no longer owns extracted domain modules.**
- Do **not** invent domain-specific `PlatformContext` methods without an architectural need.
- Do **not** treat PHP package and Node package as two products — **one ZIP, one identity, optional entrypoints**.
- New functional domains are **packages by default** (in Jasefly-Modules) unless they require host/core ownership.
- If a task needs a host change for a specific package slug: **stop** and check for a missing generic seam first.

### Verified baseline

PHP suite · Node suite · Certify 15/15 · MySQL live 15/15 · Combos YES · Dual-runtime YES · Final architecture regression PASS.

Synthetic dual-runtime proof: `runtime-node/tests/fixtures/modules/zed/`.

### Historical docs

Files marked **Historical / superseded** are records only — not implementation guides.
