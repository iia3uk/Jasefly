# Dual-runtime operations

Jasefly has **one architecture** and **two production runtimes**. **Dual** is the local/CI harness that runs both — not a third production server.

| Target | Runtime | Artifact |
| --- | --- | --- |
| Shared hosting | PHP (`backend/`) | `jasefly build --runtime=php` → hosting ZIP |
| VPS / cloud | Node (`runtime-node/`) | `jasefly build --runtime=node` / `cms_local_build({target:'vps'})` |
| Local + CI | Dual | Boots both; HTTP contract parity gate (see [dual-runtime-parity-progress.md](dual-runtime-parity-progress.md)) |

Domain product features are **packages** (`modules-src/` → one ZIP), not ~30 Core modules. See [architecture/CURRENT.md](architecture/CURRENT.md).

**Source of Truth:** [`contracts/`](../contracts/README.md). Freeze: [core-freeze-1.0.md](core-freeze-1.0.md). Matrix: [runtime-target-matrix.md](runtime-target-matrix.md).

## Agent / MCP

1. `cms_sites` — shows `runtime`, `deployment`, `ssh_configured` (no secrets).
2. Build: `cms_local_build({ target: 'shared' | 'vps' })` or aliases `cms_shared_build` / `cms_vps_build`.
3. Deploy: `cms_deploy_update({ site, confirm })` — SiteUpdater for PHP; SSH atomic for Node.
4. Rollback: `cms_rollback({ site, confirm: true })` — VPS only.
5. Never guess `site` or runtime when 2+ sites exist.

## Parity

```bash
# Preferred: jasefly CLI (runtime=dual → behavioral gate)
node scripts/jasefly/cli.mjs test --runtime=dual

# Node unit
cd runtime-node && npm test

# Contracts
node scripts/contracts/validate-contracts.js
```

Progress (AUTO): [dual-runtime-parity-progress.md](dual-runtime-parity-progress.md).

## Capability gate

Modules declaring VPS-only capabilities (`queue`, `websocket`, …) fail the shared compiler unless `JASEFLY_ALLOW_SKIP_INCOMPATIBLE_MODULES=1` is set **explicitly**.

Historical plan/journal: [dual-runtime-architecture-plan.md](dual-runtime-architecture-plan.md) · [dual-runtime-progress.md](dual-runtime-progress.md).
