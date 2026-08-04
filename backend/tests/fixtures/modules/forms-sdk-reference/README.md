# Forms SDK Reference

Official **Platform SDK certification** package — a Forms Engine reimplementation that uses **only** `App\Platform\*` APIs (no `App\Core`, `App\Services`, `App\Modules`, `App\Middleware`, `App\Database`, `App\Router`, `App\Request`, `App\Response`).

## Purpose

- Prove that a non-trivial domain module (forms CRUD, submissions, validation, CSV export, builder widget) can ship as a ZIP package via Platform SDK.
- Table prefix: **`fsr_`** (forms-sdk-reference).
- Provides capability: `forms-ref.engine`.

## Layout

```
forms-sdk-reference/
  module.json
  backend/FormsSdkReferenceModule.php
  backend/{FormRepository,FormValidator,FormSubmitService,CsvExport}.php
  hooks/{PostInstallHook,PostUpdateHook}.php
  migrations/001_fsr_forms.sql … 003_fsr_submission_meta.sql
  migrations/uninstall/001_drop.sql
  frontend-dist/index.js          # hand-written ESM (certify without Vite)
  frontend-dist/manifest.json
  frontend/src/index.ts           # contract mirror / docs
```

## Commands

From repo root:

```bash
# Static SDK compliance
node scripts/validate-module.js forms-sdk-reference

# Full certification (manifest, static analysis, PHP lint, migrations, FE imports)
php backend/bin/sdk.php certify modules-src/forms-sdk-reference

# Release ZIP (after certify passes)
node scripts/build-module.js forms-sdk-reference
```

## SDK-only constraint

| Allowed | Forbidden |
| --- | --- |
| `App\Platform\*` | `App\Core\*`, `App\Services\*`, `App\Modules\*` |
| `App\PackageModules\FormsSdkReference\*` | Direct `new Database`, `new Router`, etc. |

Handlers use `PlatformRequestInterface` (`$r->user()`, `$r->body()`, `$r->input()`). Permissions via `$ctx->permissions()->require($r->user() ?? [], 'forms-ref.xxx')`.

## Optional capabilities

`module.json` schema supports only `capabilities.requires` + `provides`. Optional deps are **soft-checked at runtime**:

- `mail.send` — `$ctx->capabilities()->has('mail.send')` before `$ctx->mail()->sendHtml()`
- `notifications.send` — before `$ctx->notifications()->notifyAdmins()`

Missing optional caps add `$ctx->health()->warn(...)` at boot.

Notify email setting: `$ctx->settings()->get('notify_email')` (module-scoped KV).

## Permissions (mapping to bundled Forms)

| SDK Reference | Bundled Forms |
| --- | --- |
| `forms-ref.view` | `forms.view` |
| `forms-ref.manage` | `forms.manage` |
| `forms-ref.submissions.view` | `forms.submissions.view` |
| `forms-ref.submissions.manage` | `forms.submissions.manage` |
| `forms-ref.export` | `forms.export` |

## Demo data

Migration seeds active form **`sdk-demo`** with fields `name`, `email`, `message`.

## Version lifecycle

- Default package version: **1.0.0**
- **1.1.0 update test**: bump `module.json` version and run install/update; migration `003_fsr_submission_meta.sql` adds `meta_json` to `fsr_form_submissions`. Optional future migration `003_fsr_notes.sql` could add `internal_priority INT NULL` for extended update tests.

## API routes (prefix `/api/v1`)

**Public:** `GET /forms-ref/{slug}`, `POST /forms-ref/{slug}/submit`

**Admin:** `GET|POST /admin/forms-ref`, `GET|PUT|DELETE /admin/forms-ref/{id}`, submissions + export under `/admin/forms-ref*`, health at `/admin/forms-sdk-reference/ping` and `/admin/forms-sdk-reference/health-report`.

## Events

`forms-ref.created`, `forms-ref.updated`, `forms-ref.deleted`, `forms-ref.submitted`, `forms-ref.submission.updated`
