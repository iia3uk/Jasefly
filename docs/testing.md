# Testing

## Purpose

Describe how FE, BE, dual parity, CI, and MCP local tests are ordered.

## How it works

### Unified CLI

```bash
node scripts/jasefly/cli.mjs test --runtime=dual   # behavioral parity gate (879/879)
node scripts/jasefly/cli.mjs test --runtime=php    # PHP unit + FE
node scripts/jasefly/cli.mjs test --runtime=node   # runtime-node unit + VPS smoke
```

### Dual behavioral parity

`runtime=dual` → `scripts/behavior/run-all.mjs`: seed twin SQLite DBs, boot PHP + Node, compare HTTP cases from `contracts/behavior/`. Snapshot: [dual-runtime-parity-progress.md](dual-runtime-parity-progress.md) (HTTP contracts; not “Core owns N domains”). Package architecture: [architecture/CURRENT.md](architecture/CURRENT.md).

### Backend (PHP)

`php backend/tests/run.php` loads suites in a fixed order (no PHPUnit). Includes Forms/Scheduler/Automation unit pieces, package validator/paths, SqlTranspiler, Diagnostics, Platform SDK, package lifecycle (offline), migration smoke/SQLite compat, API route contract, permissions, clean install, package enable sync, SoftPluginGate (`ProjectsSoftApiTest`), operation integrity, Router, ContractGovernance, SecurityVerification, Maintainability.

Lifecycle with DB: `JASEFLY_LIFECYCLE_DB=1 php backend/bin/certify-lifecycle.php`.

### Frontend

`cd frontend && npm test` → Vitest (`vitest run`). Specs include `api.refresh`, `pluginGates`, builder registry/parseLayout/widget-types, `formatDateTime`, Lab experiment registry.

### Node runtime

`cd runtime-node && npm test`. VPS package smoke: `scripts/vps/package-and-smoke.mjs`.

### CI

Workflow: `.github/workflows/platform-sdk.yml`

- **sdk:** `run.php` → `sdk.php api-diff` → certify demo-kit + forms-sdk-reference → FE test/build → module ZIPs → **behavioral parity** (`run-all.mjs`, dual).
- **lifecycle:** MySQL 8 → `config.local.php` → migrate → lifecycle certify with DB. Blocking.

### MCP local test

`cms_local_test` / `localTest()` in `mcp-cms/src/local.js`: FE lint → `npm test` → ZIP marker checks → `php -l` backend → lint critical ZIP entries → `php backend/tests/run.php` → gate `markTest`.

## Execution flow

Preferred release proof: `cms_release` runs build → test → changelog → deploy → verify (see [deployment.md](deployment.md)). For API/module changes, also keep dual parity green.

## Key components

| Piece | Path |
| --- | --- |
| Unified test CLI | `scripts/jasefly/cli.mjs test` |
| Dual parity | `scripts/behavior/run-all.mjs` · `tests/parity/behavior-runner.mjs` |
| BE runner | `backend/tests/run.php` |
| Node tests | `runtime-node` `npm test` |
| FE vitest | `frontend/package.json` `test` |
| CI | `.github/workflows/platform-sdk.yml` |
| MCP test | `mcp-cms/src/local.js` |

## Files involved

As above; individual `backend/tests/*Test.php`, `frontend/src/**/*.test.ts`.

## Related pages

- [contracts-and-governance.md](contracts-and-governance.md)
- [sdk-certification.md](sdk-certification.md)
- [deployment.md](deployment.md)

## Common mistakes

- Expecting PHPUnit XML reports — the runner is custom.
- Skipping lifecycle CI locally when changing package install/update/rollback.

## Extension points

- Add a `*Test.php` and require it from `run.php` in order.
- Add a vitest file under `frontend/src`.

## See also

- [cli.md](cli.md)
- [deployment.md](deployment.md)
- [security.md](security.md)
