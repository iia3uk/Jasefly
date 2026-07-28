# Testing

## Purpose

Describe how FE, BE, CI, and MCP local tests are ordered.

## How it works

### Backend

`php backend/tests/run.php` loads suites in a fixed order (no PHPUnit). Includes Forms/Scheduler/Automation unit pieces, package validator/paths, SqlTranspiler, Diagnostics, Platform SDK, package lifecycle (offline), migration smoke/SQLite compat, API route contract, permissions, clean install, package enable sync, SoftPluginGate (`ProjectsSoftApiTest`), operation integrity, Router, ContractGovernance, SecurityVerification, Maintainability.

Lifecycle with DB: `JASEFLY_LIFECYCLE_DB=1 php backend/bin/certify-lifecycle.php`.

### Frontend

`cd frontend && npm test` → Vitest (`vitest run`). Specs include `api.refresh`, `pluginGates`, builder registry/parseLayout/widget-types, `formatDateTime`, Lab experiment registry.

### CI

Only workflow: `.github/workflows/platform-sdk.yml`

- **sdk:** `run.php` → `sdk.php api-diff` → certify demo-kit + forms-sdk-reference → `npm ci` + test + build → `build-module.js` for both packages.
- **lifecycle:** MySQL 8 → write `config.local.php` → `001_schema` via transpiler → `migrate.php` → lifecycle certify with DB. Blocking.

### MCP local test

`cms_local_test` / `localTest()` in `mcp-cms/src/local.js`: FE lint → `npm test` → ZIP marker checks → `php -l` backend → lint critical ZIP entries → `php backend/tests/run.php` → gate `markTest`.

## Execution flow

Preferred release proof: `cms_release` runs build → test → changelog → deploy → verify (see [deployment.md](deployment.md)).

## Key components

| Piece | Path |
| --- | --- |
| BE runner | `backend/tests/run.php` |
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
