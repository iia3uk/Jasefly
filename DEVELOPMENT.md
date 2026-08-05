# Development

## Purpose

Contributor entry: where code lives and which docs to read before changing it.

## How it works

| Path | Purpose |
| --- | --- |
| `scripts/jasefly/` | Unified CLI: `doctor` / `dev` / `build` / `test` |
| `contracts/` | Dual-runtime source of truth |
| `backend/public/index.php` | PHP API front controller |
| `backend/src/` | PHP Core + services + middleware |
| `backend/src/Modules/` | Bundled feature modules |
| `backend/migrations/` | Schema + clean/demo seed PHP |
| `backend/install.php` / `migrate.php` | First install / incremental migrations |
| `backend/bin/` | PHP CLI (`modules`, `sdk`, `scheduler`, …) |
| `backend/tests/run.php` | PHP test runner |
| `runtime-node/` | Node VPS runtime (TypeScript) |
| `frontend/src/modules/` | Compile-time FE modules |
| `frontend/src/builder/` | Page builder |
| `frontend/src/platform/` | FE SDK for ZIP packages |
| `modules-src/` | ZIP package sources |
| `mcp-cms/` | Deploy/content MCP |
| `tests/parity/` | Behavioral parity runner |

PHP autoload is custom (no Composer). Modules are auto-discovered under `backend/src/Modules/*/`.

Preferred local loop:

```bash
node scripts/jasefly/cli.mjs doctor --runtime=dual --target=local
node scripts/jasefly/cli.mjs dev --runtime=dual --target=local
node scripts/jasefly/cli.mjs test --runtime=dual
```

## Execution flow

1. Read [`docs/README.md`](docs/README.md) and [`docs/core-freeze-1.0.md`](docs/core-freeze-1.0.md) for the surface you touch.
2. Change the owning module/package — not Core — unless you are changing Core itself.
3. Keep PHP ↔ Node aligned for contract-covered APIs (`contracts/`, dual parity).
4. Run tests: see [`docs/testing.md`](docs/testing.md).
5. ZIP packages: certify — [`docs/sdk-certification.md`](docs/sdk-certification.md).

## Key components

Documented once:

- Module lifecycle → [`docs/module-system.md`](docs/module-system.md)
- Package lifecycle → [`docs/package-lifecycle.md`](docs/package-lifecycle.md)
- Permissions → [`docs/authorization.md`](docs/authorization.md)
- Builder → [`docs/page-builder.md`](docs/page-builder.md)
- Extension map → [`docs/extension-points.md`](docs/extension-points.md)

## Files involved

- This pointer page
- `docs/*`
- `CMS_MAP.md` for symptom → file

## Related pages

- [README.md](README.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/runtime-target-matrix.md](docs/runtime-target-matrix.md)
- [docs/testing.md](docs/testing.md)
- [INSTALL.md](INSTALL.md)

## Common mistakes

- Re-documenting lifecycle inside a feature PR README.
- Adding production routes only in `routes/api_v1.php`.

## Extension points

See [`docs/extension-points.md`](docs/extension-points.md).

## See also

- [docs/cli.md](docs/cli.md)
- [docs/deployment.md](docs/deployment.md)
- [SECURITY.md](SECURITY.md)
