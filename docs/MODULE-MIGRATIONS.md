# Package migrations

Stored in `module_migrations` with UNIQUE `(module_slug, migration)`.

Applied via `ModuleMigrationService`. Checksum drift marks module `modified` and blocks re-apply.

Uninstall SQL under `migrations/uninstall/` runs only when admin chooses remove-data.

**Rollback of an update does not reverse applied migration SQL.** Snapshots restore files + `module_migrations` *rows*; `db_rollback_available` stays `false`. See `MODULE-RECOVERY.md`.
