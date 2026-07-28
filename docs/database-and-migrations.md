# Database and migrations

## Purpose

Explain how schema migrations run for core, bundled plugins, and ZIP packages.

## How it works

Migrations are authored as MySQL-canonical SQL. At apply time `SqlTranspiler` adapts statements to the configured driver (`mysql`, `sqlite`, `pgsql`). There is no class named `MigrationRunner`; the runner is `MigrationService`.

Meta tables: `_migrations`, `_migration_state` (locking / blocked / last error).

### Core incremental (`MigrationService`)

`backend/migrate.php` requires `config.local.php`, `Bootstrap::init()`, then `MigrationService::status(true)` which auto-applies pending.

Ordered `FILES` constant: `002`…`022` under `backend/migrations/`. **`001_schema.sql` is install-only** (not in incremental list).

After core files, discovers `Modules/*/migrations/*.sql` with IDs `plugin:{Module}:{filename}`.

Duplicate errors are ignored where safe; apply is locked.

### First install

`backend/install.php`: wipe → apply `001_schema.sql` via transpiler → apply early SQL (`002`…`007` inline in installer flow) → demo (`demo_content.php`) or clean (`clean_base_seed.php`). Later updates use `migrate.php` / admin migrations API for remaining files and `plugin:*`.

### ZIP package migrations

`ModuleMigrationService` during package install/update; tracked in `module_migrations`. Uninstall may run declared uninstall SQL. File rollback does **not** revert DB migrations (`db_rollback_available=false`). See [package-lifecycle.md](package-lifecycle.md).

## Execution flow

1. Ensure meta tables (transpiled).
2. Acquire lock.
3. Apply pending core `FILES` in order.
4. Apply pending `plugin:*` files from bundled module dirs.
5. Record applied; on hard failure may block until retry/clear.

CLI: `php backend/migrate.php`.

## Key components

| Component | Role |
| --- | --- |
| `MigrationService` | Core + bundled plugin SQL |
| `SqlTranspiler` | Dialect adaptation |
| `ModuleMigrationService` | ZIP package SQL |
| `install.php` | First-time schema + seed |
| Dialects / inspectors | `backend/src/Core/Db/*` |

## Files involved

- `backend/migrate.php`
- `backend/install.php`
- `backend/src/Services/MigrationService.php`
- `backend/src/Core/Db/SqlTranspiler.php`
- `backend/migrations/*.sql`
- `backend/migrations/clean_base_seed.php`, `demo_content.php`
- `backend/src/Modules/*/migrations/`
- `backend/src/Services/Modules/ModuleMigrationService.php`

## Related pages

- [package-lifecycle.md](package-lifecycle.md)
- [recovery.md](recovery.md)
- [cli.md](cli.md)
- [testing.md](testing.md)

## Common mistakes

- Re-running `001` on an existing site via incremental migrate (it is skipped by design).
- Writing SQLite-specific SQL in migration files — author MySQL; let the transpiler adapt.
- Assuming package rollback undoes SQL.

## Extension points

- Add next numbered `0xx_*.sql` to `MigrationService::FILES` and the migrations folder.
- Bundled module: drop SQL under `Modules/{Name}/migrations/`.
- Package: declare migrations path in `module.json`.

## See also

- [bootstrap-and-request.md](bootstrap-and-request.md)
- [package-lifecycle.md](package-lifecycle.md)
- [testing.md](testing.md)
