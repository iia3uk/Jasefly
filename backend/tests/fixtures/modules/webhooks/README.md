# Webhooks (package module)

Installable extraction of the former bundled `backend/src/Modules/Webhooks` plugin.

## Build

```bash
node scripts/build-module.js webhooks --yes
```

## Install

Admin → Modules → upload ZIP, or:

```bash
php backend/bin/modules.php install path/to/jasefly-module-webhooks-1.0.0.zip
php backend/bin/modules.php enable webhooks
```

## Dependencies

- `system` (required)

## Notes

- Table `webhooks` may already exist from the legacy bundled migration (`plugin:Webhooks:001_create_webhooks.sql`); package migration is `IF NOT EXISTS`.
- Permission slug stays `integrations.manage` for role compatibility.
- Outbound HTTP goes through Platform SDK (`isSafeOutboundUrl` / `postJsonOutbound`).
