# Comments (package module)

Installable extraction of the former bundled `backend/src/Modules/Comments` plugin.

## Frozen builder widget IDs

Registers with Platform `stableType: true` (no slug prefix):

- `comments`
- `reviews`
- `rating-summary`
- `review-form`

These IDs remain in `frontend/src/builder/manifest/widget-types.v1.json`.

## Build / install

```bash
node scripts/build-module.js comments --yes
php backend/bin/modules.php install release/modules/jasefly-module-comments-1.0.0.zip
php backend/bin/modules.php enable comments
```

## Upgrade from bundled

Tables/permissions from `plugin:Comments:001_comments.sql` are reused (`IF NOT EXISTS` / `INSERT IGNORE`). Install ZIP, enable, then disable any leftover plugins-row confusion via Module Manager.
