# Recovery

## Purpose

Describe how to recover from failed package ops, enable drift, and blocked migrations.

## How it works

### Package file rollback

`ModulePackageService::rollback` restores the last successful **update** snapshot from `ModuleSnapshotService`. First install has no file rollback. DB migrations are **not** reverted (`db_rollback_available=false`).

Update pipeline creates a snapshot before file copy. Some health-check failures leave copied files for diagnosis instead of wiping.

### Safe-mode

On package load failure, status → `failed`, mirror off, `ModuleSafeMode::markFailed`. Boot skips safe-mode packages until cleared after a successful enable/health path.

### Enable projection drift

Canonical: `installed_modules.status`. Projection: `modules.is_enabled`. If they diverge, registry follows the projection until:

```bash
php backend/bin/modules.php reconcile-mirror --dry-run
php backend/bin/modules.php reconcile-mirror --apply
```

(Also admin API `POST /admin/modules/reconcile-mirror`.)

### Migrations blocked

`MigrationService` can mark blocked + last error. Clear via service `retry()` / admin migrations UI, then re-run `migrate.php`.

### Content pack wipe

Importer fails fast on DELETE errors; CLI wipe requires `--confirm`. See [content-import.md](content-import.md).

## Execution flow

Typical broken package:

1. Check `/admin/system` → load failures + safe-mode.
2. `modules.php health {slug}` / fix package.
3. Re-install or enable; clear safe-mode on success.
4. If Plugins toggle disagrees with Modules UI → `reconcile-mirror --apply`.

## Key components

| Component | Role |
| --- | --- |
| `ModuleSnapshotService` | File snapshots |
| `ModuleSafeMode` | Skip broken packages |
| `ModulePluginMirror::reconcile` | Align enable stores |
| `MigrationService::retry` | Unblock migrations |

## Files involved

- `backend/src/Services/Modules/ModulePackageService.php`
- `backend/src/Services/Modules/ModuleSnapshotService.php`
- `backend/src/Services/Modules/ModuleSafeMode.php`
- `backend/src/Services/Modules/ModulePluginMirror.php`
- `backend/bin/modules.php`
- `backend/tests/OperationIntegrityTest.php`, `PackageEnableSyncTest.php`

## Related pages

- [package-lifecycle.md](package-lifecycle.md)
- [diagnostics.md](diagnostics.md)
- [database-and-migrations.md](database-and-migrations.md)

## Common mistakes

- Expecting SQL undo from package rollback.
- Manually editing only `modules.is_enabled` for a ZIP package.

## Extension points

None beyond using the package service APIs; do not hand-edit registry rows without reconcile.

## See also

- [package-lifecycle.md](package-lifecycle.md)
- [diagnostics.md](diagnostics.md)
- [cli.md](cli.md)
