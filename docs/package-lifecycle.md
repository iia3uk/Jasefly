# Package lifecycle (ZIP modules)

## Purpose

Describe upload → inspect → install/update → enable/disable → rollback/uninstall for installable ZIP modules.

## How it works

Orchestrator: `ModulePackageService`. Admin UI: `/admin/modules` (`ModuleManagerModule`). CLI: `backend/bin/modules.php`.

On disk (`ModulePackagePaths`):

| Path | Content |
| --- | --- |
| `{apiRoot}/modules/{slug}/` | backend, migrations, hooks, `module.json` |
| `{webRoot}/modules/{slug}/` | prebuilt `frontend-dist` assets |
| `{apiRoot}/storage/modules/{slug}/` | module storage / preserved data |
| `{apiRoot}/storage/module-installer/` | uploads, staging, backups |

Canonical enable state: `installed_modules.status`. Runtime projection: `modules.is_enabled` via `ModulePluginMirror`. Plugins admin toggle for package-backed rows calls this service, not a direct DB flip.

## Execution flow

```
upload(ZIP) → inspect → install | update
enable / disable / uninstall / rollback (separate)
```

### `runPipeline` (install / update)

1. Extract staging; re-validate (`ModulePackageValidator`).
2. Update only: file snapshot (`ModuleSnapshotService`).
3. Hook `before_install` | `before_update`.
4. Copy meta, `backend/`, `migrations|hooks|content|translations|docs`, `frontend-dist/` → public modules root.
5. Register permissions from manifest.
6. Apply pending migrations (`ModuleMigrationService` → `module_migrations`).
7. Upsert `installed_modules` (`source=package`; install → `enabled`; update keeps prior, coerce `installed`→`enabled`).
8. `syncPluginState` → mirror.
9. Hook `after_install` | `after_update`.
10. Health check — fail → status `failed`, mirror off; update may leave files for diagnosis; **DB migration rollback is not available** (`db_rollback_available=false`).

### Enable / disable / uninstall / rollback

- **enable:** hooks → `status=enabled` → mirror on → clear safe-mode → health.
- **disable:** hooks → `disabled` → mirror off → revoke capabilities.
- **uninstall:** snapshot → hooks → optional uninstall migrations → preserve/remove storage → delete files + registry row → mirror off.
- **rollback:** restore last successful **update** file snapshot only (not first install).

### Build from source

```bash
node scripts/create-module.js my-mod   # scaffold under modules-src/
node scripts/build-module.js my-mod --yes
# → release/modules/jasefly-module-{slug}-{version}.zip
```

`build-module.js` stages copy (skips `.env`, `node_modules`, source `frontend/`), runs `php backend/bin/sdk.php certify`, prefers existing `frontend-dist/`, writes `checksums.json`, zips.

### Manifest

Schema: `backend/schemas/module.manifest.v1.json`. Required: `schema_version`, `type` (`jasefly-module`), `name`, `slug`, `version`, `jasefly`, `entrypoints.backend`. Example: `modules-src/demo-kit/module.json`.

### Entrypoints (one identity)

| Field | Runtime |
| --- | --- |
| `entrypoints.backend` | PHP (`AbstractPackageModule` / `bootPlatform`) |
| `entrypoints.node` | Node (`register(ctx)` via PackageLoader) |
| `entrypoints.frontend_manifest` | Packaged FE assets |

PHP and Node entrypoints are optional adapters on the **same** ZIP — not separate packages.

### Surfaces (optional)

`module.json` → `surfaces` (and/or `ctx.surfaces().register()` at boot):

`trash` · `dashboard` · `sitemap` · `media` · `content_acl` · `schema`

Host SoftDelete / Dashboard / Sitemap / MediaUsage / content ACL read the process-local `PackageSurfaceRegistry` (cleared on disable/unload).

### Settings / permissions

- Settings SoT: `modules.settings` JSON (`modules.name` = slug)
- Declare `permissions[]` in manifest (catalog registration; role grants stay explicit)
- Gate routes with host permission middleware / `ctx.http().permission('…')` (fail-closed)

### Catalog

Derived index (not SoT): `node scripts/build-package-catalog.mjs` → `release/catalog/`.

Identity snapshots live in `release/catalog/manifests/{slug}.json`. Product package **source** is https://github.com/iia3uk/Jasefly-Modules (`sourceOwnership: external`). Optional local nested `Jasefly-Modules/` is **gitignored** by Core. Install at runtime from ZIP / Module Hub — Core does not require package sources.

## Key components

| Component | Role |
| --- | --- |
| `ModulePackageService` | Lifecycle API |
| `ModulePackageValidator` | Structure / policy validation |
| `ModuleMigrationService` | Package SQL |
| `ModuleSnapshotService` | File snapshots for update/rollback |
| `ModuleHookRunner` | Install-time hooks |
| `ModulePluginMirror` | Sync enable projection |
| `ModuleSafeMode` | Skip broken packages on boot |
| `InstalledModuleLoader` | Load enabled packages into registry |
| `PackageModuleAdapter` | Adapt package → `ModuleInterface` |

## Files involved

- `backend/src/Services/Modules/ModulePackageService.php`
- `backend/src/Modules/ModuleManager/ModuleManagerModule.php`
- `backend/bin/modules.php`
- `backend/migrations/020_installed_modules.sql`
- `scripts/build-module.js`, `scripts/create-module.js`
- `modules-src/demo-kit/`, `modules-src/forms-sdk-reference/`

## Related pages

- [glossary.md](glossary.md)
- [module-system.md](module-system.md)
- [platform-sdk.md](platform-sdk.md)
- [recovery.md](recovery.md)
- [database-and-migrations.md](database-and-migrations.md)

## Common mistakes

- Editing `modules.is_enabled` by hand for a package without reconcile — SoT is `installed_modules.status`.
- Expecting rollback of SQL after a failed update.
- Shipping source `frontend/` inside the ZIP instead of `frontend-dist/`.

## Extension points

- Implement `InstallableModuleInterface` / `bootPlatform(PlatformContext)`.
- Declare `hooks.*` in `module.json`.
- See [platform-sdk.md](platform-sdk.md) and [extension-points.md](extension-points.md).

## See also

- [platform-sdk.md](platform-sdk.md)
- [sdk-certification.md](sdk-certification.md)
- [recovery.md](recovery.md)
- [cli.md](cli.md)
