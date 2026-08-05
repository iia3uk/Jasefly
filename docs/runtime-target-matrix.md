# Runtime × deployment target matrix

**CLI:** `node scripts/jasefly/cli.mjs` · bin `jasefly` (root `package.json`)  
**Env:** `JASEFLY_RUNTIME` · `JASEFLY_TARGET`  
**SoT:** [`scripts/jasefly/matrix.mjs`](../scripts/jasefly/matrix.mjs)

## Supported combinations

| runtime \ target | local | shared | vps | docker | cloud |
| --- | --- | --- | --- | --- | --- |
| **node** | ok | **error** | ok | ok | ok |
| **php** | ok | ok | **error** | ok | **error** |
| **dual** | ok | ok | ok | ok | ok |

Product canon: **shared hosting = PHP**, **VPS/cloud = Node**. PHP-on-VPS remains rejected.

## Defaults

| Command | Runtime | Target |
| --- | --- | --- |
| `jasefly dev` | `dual` (if unset) | `local` |
| `jasefly test` | `dual` (if unset) | `local` |
| `jasefly doctor` | `dual` (if unset) | `local` |
| `jasefly build` | **required** (`--runtime` or `JASEFLY_RUNTIME`) | php→`shared`, node→`vps`, dual→`shared` |

Priority: **CLI flag > env > default**.

## What each runtime does

### `runtime=node`
- Dev: Vite + `runtime-node`
- Build: Node VPS artifact only (`buildVpsArtifact`); no PHP hosting ZIP; stage must contain **no** `.php`
- Test: `runtime-node npm test` + `scripts/vps/package-and-smoke.mjs`
- Does **not** require PHP or dual parity suite

### `runtime=php`
- Dev: existing `dev.js` (PHP + Vite)
- Build: `scripts/build-hosting.js` ZIP only; Node used only as FE build tool
- Test: `backend/tests/run.php` + `frontend npm test`
- Does **not** boot Node API / behavior parity harness

### `runtime=dual`
- Dev: PHP (`dev.js`) + `runtime-node`
- Build: **both** PHP ZIP and Node VPS artifact
- Test: `scripts/behavior/run-all.mjs` — behavioral parity gate (**879/879**), unchanged

## Artifacts

| Runtime | Primary artifacts under `release/` |
| --- | --- |
| php | `jasefly-cms-install-*.zip` / `jasefly-cms-update-*.zip` |
| node | `jasefly-cms-vps-*.tgz` (or `.zip` on Windows) + `vps-stage-*` |
| dual | both of the above |

### Sample sizes (local verify, 2026-08-05)

| Artifact | Size | Notes |
| --- | --- | --- |
| `jasefly-cms-update-*.zip` (php) | ~17.5 MB | `contains_runtime_node: false` |
| `jasefly-cms-vps-*.tgz` (node) | ~22.4 MB | `php_in_stage: false` |

Docker templates: [`deploy/docker/`](../deploy/docker/) (`Dockerfile.php`, `Dockerfile.node`, `compose.dual.yml`).  
`jasefly build --target=docker` requires Docker CLI (`jasefly doctor` reports missing deps).

## Commands

```bash
node scripts/jasefly/cli.mjs doctor --runtime=dual --target=local
node scripts/jasefly/cli.mjs build --runtime=php --target=shared
node scripts/jasefly/cli.mjs build --runtime=node --target=vps
node scripts/jasefly/cli.mjs build --runtime=dual --target=shared
node scripts/jasefly/cli.mjs test --runtime=dual
node scripts/jasefly/cli.mjs test --runtime=node
node scripts/jasefly/cli.mjs test --runtime=php
```

Negative (must fail):

```bash
node scripts/jasefly/cli.mjs build --runtime=node --target=shared
node scripts/jasefly/cli.mjs build --runtime=php --target=vps
```

## MCP

If `JASEFLY_RUNTIME` is set, `cms_local_build({ target: 'shared'|'vps' })` validates the same matrix before building ([`mcp-cms/src/local.js`](../mcp-cms/src/local.js)).

## Related

- [dual-runtime.md](dual-runtime.md)
- [deployment.md](deployment.md)
- Parity progress: [dual-runtime-parity-progress.md](dual-runtime-parity-progress.md)
