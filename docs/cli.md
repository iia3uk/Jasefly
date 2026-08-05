# CLI

## Purpose

List operator CLIs: unified runtime CLI first, then PHP backend tools.

## How it works

### Unified CLI (preferred)

```bash
node scripts/jasefly/cli.mjs doctor [--runtime=dual] [--target=local]
node scripts/jasefly/cli.mjs dev    --runtime=node|php|dual
node scripts/jasefly/cli.mjs build  --runtime=node|php|dual [--target=...]
node scripts/jasefly/cli.mjs test   --runtime=node|php|dual
```

Bin alias: `jasefly` (root `package.json`). Env: `JASEFLY_RUNTIME`, `JASEFLY_TARGET`. Matrix: [runtime-target-matrix.md](runtime-target-matrix.md).

| Command | Default runtime | Typical use |
| --- | --- | --- |
| `doctor` | dual | Check Node/PHP/Docker deps for matrix cell |
| `dev` | dual | Local servers |
| `test` | dual | Behavioral parity **879/879** when dual |
| `build` | **required** | PHP ZIP and/or Node VPS artifact |

### PHP backend CLIs

Most require `backend/config/config.local.php` and call `Bootstrap::init()`. `sdk.php` can run offline (autoload only) when DB init fails.

| Script | Requires DB config | Behavior |
| --- | --- | --- |
| `backend/bin/modules.php` | Yes | Package list/inspect/install/enable/…/`reconcile-mirror` |
| `backend/bin/sdk.php` | Optional | certify, api-diff, list-capabilities, export-sdk, sdk-report, … |
| `backend/bin/certify-lifecycle.php` | Optional; full with `JASEFLY_LIFECYCLE_DB=1` | Lifecycle certify JSON |
| `backend/bin/scheduler.php` | Yes | `SchedulerTick::tick` |
| `backend/migrate.php` | Yes | `MigrationService::status(true)` |
| `backend/install.php` | Installer | First-time install (HTTP or CLI; requires explicit strong password) |
| `backend/import-content.php` | Yes | Content pack import (`--confirm` for wipe) |
| `backend/seed-demo.php` | Yes | Demo content |
| `backend/tests/run.php` | Mostly SQLite in-process | Test suite |
| `backend/router.php` | Dev | PHP built-in server front → `public/index.php` |

### `modules.php` commands

`list`, `inspect`, `install`, `update`, `enable`, `disable`, `uninstall`, `rollback`, `migrations`, `health`, `reconcile-mirror [--dry-run|--apply]`.

### `sdk.php` commands

`validate-sdk`, `verify-compatibility`, `verify-module`, `certify`, `export-sdk`, `api-snapshot`, `api-diff`, `list-capabilities`, `list-public-services`, `deprecations`, `compatibility-matrix`, `sdk-report`, `module-api-report`.

## Execution flow

Typical package ops:

1. Ensure `config.local.php`.
2. `php backend/bin/modules.php install path/to.zip`
3. `php backend/bin/modules.php health {slug}`

## Key components

- `Bootstrap::init` / `registerAutoload`
- `ModulePackageService` (modules CLI)
- `SdkCliService` (sdk CLI)

## Files involved

- `scripts/jasefly/{cli,config,matrix,doctor}.mjs` · `adapters/{php,node,dual}.mjs`
- `backend/bin/*.php`
- `backend/migrate.php`, `install.php`, `import-content.php`
- `backend/tests/run.php`

## Related pages

- [package-lifecycle.md](package-lifecycle.md)
- [sdk-certification.md](sdk-certification.md)
- [database-and-migrations.md](database-and-migrations.md)
- [testing.md](testing.md)

## Common mistakes

- Running `modules.php` without `config.local.php`.
- Assuming `sdk.php` always needs MySQL — certify of a source tree often does not.

## Extension points

Add a new `backend/bin/*.php` that bootstraps like existing tools; do not overload `public/index.php`.

## See also

- [deployment.md](deployment.md)
- [diagnostics.md](diagnostics.md)
