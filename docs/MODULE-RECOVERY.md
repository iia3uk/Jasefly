# Module recovery

- Fatal package boot → `InstalledModuleLoader` marks `failed` + mirrors `modules.is_enabled=0` + safe-mode skip
- CLI: `php backend/bin/modules.php disable {slug}`
- Clear safe-mode entry after fix; re-enable from Admin
- Core update preserves `api/modules/`, `storage/modules/`, `public_html/modules/`

## Rollback limits

- **File rollback** (after a successful **update**): restores module files under `api/modules/{slug}` and public assets, plus `installed_modules` / `module_migrations` / `module_files` metadata from the snapshot ZIP.
- **DB schema/data rollback is not implemented.** `db_rollback_available` is always `false`. Applied package SQL migrations are not undone on rollback.
- Reconcile plugins mirror: `php backend/bin/modules.php reconcile-mirror` (add `--apply` to write).
