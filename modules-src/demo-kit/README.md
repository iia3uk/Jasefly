# Demo Kit — reference Jasefly package module

Minimal installable package for **Module Package Manager** (`module-manager`).

## Layout

```
demo-kit/
  module.json
  checksums.json
  backend/DemoKitModule.php
  migrations/001_demo_kit.sql
  hooks/PostInstallHook.php
  frontend/src/               # TypeScript source (build optional)
  frontend-dist/manifest.json # SPA loader manifest
  frontend-dist/index.js      # Prebuilt stub for install without FE build
```

## Build ZIP

From repo root (requires `zip` CLI):

```bash
cd modules-src/demo-kit
php ../../backend/bin/modules-checksums.php .   # if helper exists, or regenerate checksums.json
zip -r demo-kit-1.0.0.zip . -x "*.git*"
```

Install:

```bash
php backend/bin/modules.php install modules-src/demo-kit/demo-kit-1.0.0.zip
php backend/bin/modules.php health demo-kit
curl -H "Authorization: Bearer …" https://host/api/v1/admin/demo-kit/ping
```

## Permissions

- `demo-kit.view` — admin screen + ping endpoint

## Notes

- Slug `demo-kit`, backend entry `backend/DemoKitModule.php`
- Frontend manifest at `frontend-dist/manifest.json`, export `JaseflyFrontendModule`
- `PostInstallHook` writes a marker under module storage on `after_install`
