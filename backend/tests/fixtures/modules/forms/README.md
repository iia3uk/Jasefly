# Forms (package module)

Installable extraction of the former bundled `backend/src/Modules/Forms` plugin.

## Frozen builder widget ID

Registers with Platform `stableType: true` (no slug prefix):

- `form`

## Build / install

```bash
node scripts/build-module.js forms --yes
php backend/bin/modules.php install release/modules/jasefly-module-forms-1.0.0.zip
php backend/bin/modules.php enable forms
```

## Upgrade from bundled

Tables/permissions from `001_forms.sql` are reused (`IF NOT EXISTS` / `INSERT IGNORE`). Install ZIP, enable, then disable bundled module row via Module Manager if needed.
