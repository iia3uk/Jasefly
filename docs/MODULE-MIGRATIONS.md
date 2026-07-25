# Package migrations

Stored in `module_migrations` with UNIQUE `(module_slug, migration)`.

Applied via `ModuleMigrationService`. Checksum drift marks module `modified` and blocks re-apply.

Uninstall SQL under `migrations/uninstall/` runs only when admin chooses remove-data.
