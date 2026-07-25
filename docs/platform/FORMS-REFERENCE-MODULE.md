# Forms SDK Reference Module

Official certification reference: Forms engine as an installable ZIP using **only** Platform SDK.

**Path:** `modules-src/forms-sdk-reference/`  
**Slug:** `forms-sdk-reference`  
**SDK:** v1 (stable)

## Package map

```
modules-src/forms-sdk-reference/
  module.json
  backend/
    FormsSdkReferenceModule.php   # routes, boot, capabilities
    FormRepository.php
    FormSubmitService.php
    FormValidator.php
    CsvExport.php
  hooks/
    PostInstallHook.php
    PostUpdateHook.php
  migrations/
    001_fsr_forms.sql
    002_fsr_indexes.sql
    003_fsr_submission_meta.sql
    uninstall/001_drop.sql
  frontend-dist/
    index.js                      # admin UI + builder widget (no React bundler deps)
    manifest.json
  frontend/src/index.ts           # optional TS source for local dev
```

## Capabilities

**Requires:** `http.client`, `api.routes`, `admin.pages`, `permissions.check`, `storage.files`, `events.publish`, `settings.module`, `builder.widgets`

**Provides:** `forms-ref.engine`

## Permissions

| Permission | Use |
| --- | --- |
| `forms-ref.view` | Admin forms list |
| `forms-ref.manage` | Create/edit forms |
| `forms-ref.submissions.view` | Submissions list |
| `forms-ref.submissions.manage` | Delete submissions |
| `forms-ref.export` | CSV export |

## Routes (representative)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/forms-sdk-reference/ping` | Health |
| GET/POST | `/api/v1/forms-sdk-reference/forms` | CRUD |
| GET/POST | `/api/v1/forms-sdk-reference/forms/{slug}/submit` | Public submit |
| GET | `/admin/forms-sdk-reference/submissions` | Admin submissions |

Exact paths defined in `FormsSdkReferenceModule.php`.

## Events

Published on boot/submit (see module source): e.g. `forms-ref.booted`, submission hooks via `$ctx->events()->publish(...)`.

## How to run

### Certify (offline)

```bash
php backend/bin/sdk.php certify modules-src/forms-sdk-reference
php backend/tests/run.php   # includes PlatformPackageLifecycleTest
```

### Build ZIP

```bash
node scripts/build-module.js forms-sdk-reference --yes
# → release/modules/jasefly-module-forms-sdk-reference-1.0.0.zip
```

### Install on host

Admin → **Модули** → Upload ZIP → Install → Enable  
Or: `php backend/bin/modules.php install path/to.zip`

### Lifecycle (with DB)

```bash
JASEFLY_LIFECYCLE_DB=1 php backend/bin/certify-lifecycle.php
```

## Relation to bundled Forms

Bundled `backend/src/Modules/Forms/` remains the production Forms plugin. This module proves SDK parity; migration plan: `MIGRATION-BUNDLED-FORMS.md`.

See: `SDK-CERTIFICATION.md`, `docs/FORMS.md` (bundled plugin docs).
