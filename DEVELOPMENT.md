# Development

## Purpose

Contributor entry: where code lives and which docs to read before changing it.

## How it works

| Path | Purpose |
| --- | --- |
| `backend/public/index.php` | API front controller |
| `backend/src/` | Core + services + middleware |
| `backend/src/Modules/` | Bundled feature modules |
| `backend/migrations/` | Schema + clean/demo seed PHP |
| `backend/install.php` / `migrate.php` | First install / incremental migrations |
| `backend/bin/` | CLI (`modules`, `sdk`, `scheduler`, …) |
| `backend/tests/run.php` | PHP test runner |
| `frontend/src/modules/` | Compile-time FE modules |
| `frontend/src/builder/` | Page builder |
| `frontend/src/platform/` | FE SDK for ZIP packages |
| `modules-src/` | ZIP package sources |
| `mcp-cms/` | Deploy/content MCP |

Autoload is custom (no Composer). Modules are auto-discovered under `src/Modules/*/`.

## Execution flow

1. Read [`docs/README.md`](docs/README.md) for the topic you touch.
2. Change the owning module/package — not Core — unless you are changing Core itself.
3. Run tests: see [`docs/testing.md`](docs/testing.md).
4. ZIP packages: certify — [`docs/sdk-certification.md`](docs/sdk-certification.md).

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

- [ARCHITECTURE.md](ARCHITECTURE.md)
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
