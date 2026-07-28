# Installing a module package

1. Upload ZIP in Admin → Модули (or CLI `modules.php install`).
2. Review inspect plan (deps, checksums, signature, migrations).
3. Confirm install. Pipeline: stage → copy → migrations → permissions → hooks → health → enable.
4. Frontend loads `/api/v1/modules/runtime-assets` then dynamic ESM from `/modules/{slug}/…` (no Node on server).

Uninstall: keep data (default) or remove data (+ uninstall SQL if present).

## Rollback

After **update**, Admin/CLI can restore the pre-update file snapshot. This does **not** reverse package SQL migrations (`db_rollback_available` is always false). See `MODULE-RECOVERY.md`.
