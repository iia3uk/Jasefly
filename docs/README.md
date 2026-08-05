# Jasefly documentation

## Purpose

Give a new engineer a reading order that matches how the platform actually boots and extends.

Jasefly is an **AI-first modular dual-runtime platform**:

| Runtime | Production role |
| --- | --- |
| **PHP** (`backend/`) | Shared hosting |
| **Node** (`runtime-node/`) | VPS / cloud |
| **Dual** | Local + CI behavioral parity (not a third production server) |

Contracts under [`../contracts/`](../contracts/README.md) are the source of truth. The React SPA (public site, admin, builder) talks to whichever runtime you deploy. CMS surfaces live inside the admin — they are not the product name.

Product overview: [`../README.md`](../README.md). Core freeze: [core-freeze-1.0.md](core-freeze-1.0.md).

## How it works

Implementation is authoritative. Agent path lookup: root [`CMS_MAP.md`](../CMS_MAP.md). Release history: [`CHANGELOG.md`](../CHANGELOG.md). This tree explains **what happens**.

## Execution flow (reading order)

0. **[runtime-target-matrix.md](runtime-target-matrix.md)** · [dual-runtime.md](dual-runtime.md) · **[core-freeze-1.0.md](core-freeze-1.0.md)** — where code runs, what is frozen
1. [glossary.md](glossary.md) — Module / Plugin / Package / SoftPluginGate
2. [ownership-boundaries.md](ownership-boundaries.md) — who owns which layer
3. [bootstrap-and-request.md](bootstrap-and-request.md) — HTTP → handler (PHP path)
4. [routing.md](routing.md) — route registration and match
5. [authentication.md](authentication.md) · [authorization.md](authorization.md)
6. [module-system.md](module-system.md) — bundled discovery / boot / enable
7. [plugin-gates.md](plugin-gates.md) — disabled behavior (BE + FE)
8. [package-lifecycle.md](package-lifecycle.md) — ZIP install lifecycle
9. [events.md](events.md) · [platform-sdk.md](platform-sdk.md) · [contracts-and-governance.md](contracts-and-governance.md)
10. [frontend-architecture.md](frontend-architecture.md) · [page-builder.md](page-builder.md)
11. [database-and-migrations.md](database-and-migrations.md)
12. [diagnostics.md](diagnostics.md) · [cli.md](cli.md) · [testing.md](testing.md)
13. [deployment.md](deployment.md) · [recovery.md](recovery.md) · [security.md](security.md)
14. [extension-points.md](extension-points.md) · [content-import.md](content-import.md)
15. Feature ownership: [modules/](modules/)

SDK details: [sdk-versioning.md](sdk-versioning.md), [sdk-certification.md](sdk-certification.md). Platform folder stubs: [platform/README.md](platform/README.md). Architecture plans (historical): [dual-runtime-architecture-plan.md](dual-runtime-architecture-plan.md).

## Key components

| Area | Entry |
| --- | --- |
| Unified CLI | `scripts/jasefly/cli.mjs` (`jasefly doctor\|dev\|build\|test`) |
| PHP API | `backend/public/index.php` · `backend/src/Bootstrap.php` |
| Node API | `runtime-node/src/index.ts` |
| Contracts SoT | `contracts/` |
| Module registry (PHP) | `backend/src/Core/ModuleRegistry.php` |
| SPA | `frontend/src/main.tsx` |
| Deploy / MCP | `mcp-cms/` → `cms_release` |

## Files involved

- This directory (`docs/`)
- Root overview: `README.md`, `ARCHITECTURE.md`, `INSTALL.md`, `DEVELOPMENT.md`
- Agent map: `CMS_MAP.md`

## Related pages

- [glossary.md](glossary.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../INSTALL.md](../INSTALL.md)

## Common mistakes

- Reading only `ARCHITECTURE.md` or old `MODULE-*.md` stubs without the pages above.
- Treating `backend/routes/api_v1.php` as the live HTTP registrar — live routes come from `ModuleRegistry`.

## Extension points

Document new cross-cutting behavior once; link from feature pages with “See …”.

## See also

- [glossary.md](glossary.md)
- [extension-points.md](extension-points.md)
- [../CMS_MAP.md](../CMS_MAP.md)
