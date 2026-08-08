# Newsletter (package module)

Installable extraction of the former bundled `backend/src/Modules/Newsletter` plugin.

## Features

- Public subscribe / confirm / unsubscribe
- Admin subscribers + campaigns CRUD, CSV import/export
- Frozen builder widget `newsletter-signup` (`stableType`)
- Campaign send via Platform Scheduler local job `campaign.send` → `newsletter.campaign.send`
- Mail via Platform `$ctx->mail()` (`isAvailable` + `sendHtml`) — no concrete `Mailer` import

## Build / install

```bash
node scripts/build-module.js newsletter --yes
php backend/bin/modules.php install release/modules/jasefly-module-newsletter-1.0.0.zip
php backend/bin/modules.php enable newsletter
```

## Upgrade from bundled

Tables/permissions from earlier installs are reused (`IF NOT EXISTS` / `INSERT IGNORE`). Same slug `newsletter`. Authoring SoT: `modules-src/newsletter/`.

## Uninstall

`preserve_data_on_uninstall: true`. Disable/uninstall releases package jobs via `PackageJobLifecycle`.
