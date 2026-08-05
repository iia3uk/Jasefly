# Dual-runtime operations

Jasefly has **one architecture** and **two runtimes**:

| Target | Runtime | Artifact |
| --- | --- | --- |
| Shared hosting | PHP (`backend/`) | `scripts/build-hosting.js` ZIP |
| VPS | Node (`runtime-node/`) | `cms_vps_build` / `cms_local_build({target:'vps'})` |

**Source of Truth:** [`contracts/`](../contracts/README.md).

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

# HTTP parity (both servers up)
PHP_BASE=http://127.0.0.1:8080/api/v1 NODE_BASE=http://127.0.0.1:3080/api/v1 node tests/parity/runner.mjs

# Contracts
node scripts/contracts/validate-contracts.js
```

Runtime × target matrix: [runtime-target-matrix.md](runtime-target-matrix.md).

## Capability gate

Modules declaring VPS-only capabilities (`queue`, `websocket`, …) fail the shared compiler unless `JASEFLY_ALLOW_SKIP_INCOMPATIBLE_MODULES=1` is set **explicitly**.

See plan: [dual-runtime-architecture-plan.md](dual-runtime-architecture-plan.md) · journal: [dual-runtime-progress.md](dual-runtime-progress.md).
