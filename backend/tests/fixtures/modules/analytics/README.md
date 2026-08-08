# Analytics (package module)

Installable extraction of the former bundled `backend/src/Modules/Analytics` plugin.

## Features

- Public beacon: `POST /api/v1/analytics/collect` (rate-limited, DNT-aware)
- Admin overview, manual aggregate, goals CRUD (host page via `hostPageKey: analytics.admin`)
- Scheduler via Platform API: local handlers `retention` / `aggregate` → namespaced `analytics.retention` / `analytics.aggregate` (no direct `JobHandlerRegistry`)
- FE host slots: `site.body.end` (beacon + consent category `analytics`), `admin.dashboard` (pulse card)

## Build / install

```bash
node scripts/build-module.js analytics --yes
php backend/bin/modules.php install release/modules/jasefly-module-analytics-1.0.0.zip
php backend/bin/modules.php enable analytics
```

## Upgrade from bundled

Tables/permissions from earlier installs are reused (`IF NOT EXISTS` / `INSERT IGNORE`). Same slug `analytics`. Authoring SoT: `modules-src/analytics/`.

## Uninstall

`preserve_data_on_uninstall: true` — uninstall SQL in `migrations/uninstall/` runs only when admin opts to drop data. Disable/uninstall releases package jobs via `PackageJobLifecycle`.
