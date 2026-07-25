# Module packages

Jasefly can install feature modules from ZIP packages without rebuilding the whole CMS.

## Layout on hosting

```text
api/modules/{slug}/     backend, migrations, hooks, module.json
public_html/modules/{slug}/   prebuilt frontend-dist assets
api/storage/modules/{slug}/   module storage / preserved.json
api/storage/module-installer/ staging, uploads, backups
```

## Package format

- File: `jasefly-module-{slug}-{version}.zip` (plain `.zip` accepted)
- Required: `module.json`, `checksums.json`
- Optional: `signature.json`, `backend/`, `frontend-dist/`, `migrations/`, `hooks/`, …

See [MODULE-MANIFEST.md](MODULE-MANIFEST.md).

## Admin

`/admin/modules` — upload → inspect → install/update → enable/disable → uninstall/rollback.

## CLI

```bash
php backend/bin/modules.php list
php backend/bin/modules.php install path/to/package.zip
php backend/bin/modules.php health demo-kit
```

## Build

```bash
node scripts/create-module.js my-mod
node scripts/validate-module.js my-mod
node scripts/build-module.js my-mod --yes
```

Output: `release/modules/jasefly-module-my-mod-1.0.0.zip`
