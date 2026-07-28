# Development — Jasefly CMS

## Backend (`backend/`)

| Path | Purpose |
| --- | --- |
| `public/index.php` | API front controller |
| `src/` | Core: router, auth, modules, services |
| `src/Modules/` | Feature modules (Payments, Products, Mail, Translate, …) |
| `migrations/` | Schema + clean/demo seed PHP |
| `install.php` | First-time installer |
| `migrate.php` | Incremental migrations for updates (includes plugin `modulesDir`) |
| `bin/scheduler.php` | CLI job tick for shared-hosting cron |
| `tests/run.php` | Lightweight PHP tests (no PHPUnit) |
| `bin/certify-lifecycle.php` | Offline + optional DB lifecycle (install→update→rollback→uninstall) |
| `config/app.php` | Defaults; secrets via `config.local.php` / `.env` |

Autoload is custom (no Composer). Modules auto-discovered under `src/Modules/*/`.

### Tests

| Command | What it proves |
| --- | --- |
| `php backend/tests/run.php` | Forms/SDK/validator/paths/transpiler/diagnostics/contract-governance/security/maintainability + SQLite API/permissions/migrations/clean-install (when `pdo_sqlite`) |
| `JASEFLY_LIFECYCLE_DB=1 php backend/bin/certify-lifecycle.php` | Package install → update → rollback → uninstall (needs MySQL + migrations) |
| `cd frontend && npm test` | Vitest: `pluginGates`, `widgetRequiredPlugin`, `parseLayout`, widget-types freeze |
| CI `.github/workflows/platform-sdk.yml` | `sdk` job (PHP+FE) + blocking `lifecycle` job |
| MCP `cms_local_test` | lint + FE unit + PHP unit + ZIP PHP lint |

Admin diagnostics: `/admin/system` shows `module_load_failures` and `module_safe_mode` from `SystemHealthService`.

### Operation integrity (Priority 3)

- Module **update** failures after file copy restore the pre-update snapshot (files + `module_migrations` + file inventory), except health-check failures which leave files for diagnosis.
- `db_rollback_available` is always `false` until true DB revert exists; `file_rollback_available` tracks snapshots.
- Content pack wipe fails fast on table DELETE errors; CLI requires `--confirm`.
- `PageScheduleService::promoteDue()` returns `{promoted, error}` and logs failures; admin page **show** also promotes due drafts.

### Core hardening (Priority 4)

- `Router::match()` distinguishes **404** vs **405** (`Allow` header); path/params `rawurldecode`.
- OPTIONS preflight handled before dispatch (CORS).
- `RateLimitMiddleware` fail-open if `rate_limits` missing.
- Package load failures recorded in `ModuleRegistry::loadFailures()`; `/health` reports `degraded` + failure count (still HTTP 200).
- `Database::transaction()` helper for atomic multi-statement writes.

### Contract governance (Priority 5)

Frozen identifiers (remove = fail tests; add = update snapshot intentionally):

| Snapshot | Guards |
| --- | --- |
| `api-snapshot.v1.json` | `ApiSnapshot::diff()` in `ContractGovernanceTest` + CI `sdk.php api-diff` |
| `capabilities.v1.json` | Core caps still in `CapabilityRegistry` |
| `sdk-policy.json` ↔ `ServiceRegistry::PUBLIC_CATALOG` | Exact service id sync |
| `permissions-core.v1.json` | Still in migrations + FE `rolePermissions.ts` |
| `events-core.v1.json` | Still `dispatch('…')` in backend |
| `mcp-cms/manifest/mcp-tools.v1.json` | No MCP tool removals |
| `builder/manifest/widget-types.v1.json` | No builder widget type removals (vitest) |
| `content/content-pack.schema.json` | Schema smoke (version const, no extra props) |

Regen helper: `node backend/tests/gen-contract-snapshots.js` (then `php backend/bin/sdk.php api-snapshot` for API surface).

### Security verification (Priority 6)

- Shared `App\Support\SsrfGuard` blocks localhost / private / reserved IPs (Forms webhooks, Automation, Webhooks plugin).
- Outbound webhooks: SSRF check + `X-Jasefly-Signature: sha256=…` HMAC when secret set.
- `AuthController::refresh` rotates refresh tokens (delete presented hash, issue new refresh + access).
- `BackupService` requires `ext-sodium` or `ext-openssl`; openssl calls are fully-qualified (`\openssl_*`).
- Regression suite: `backend/tests/SecurityVerificationTest.php` (TOTP, Password/Argon2id, JWT types, media MIME/SVG sanitize, path jail, log redaction).

### Maintainability (Priority 7)

- Shared helpers (no parallel copies): `SsrfGuard`, `OutboundHttp::postJson`, `SecretRedactor` (Automation + Scheduler).
- API errors: prefer `Response::error($msg, $status, $errors = [], $extra = [])` — System plugin routes use this envelope (`success/error/errors/data`).
- Tooling rename: `gen-contract-snapshots.js` (was `_gen_p5_snapshots.js`).
- Do **not** split large modules opportunistically; extract only repeated mechanisms with a clear owner.

### Migrations

- `001_schema.sql` — base schema (install only)
- `002_enterprise.sql` … `019_*.sql` — incremental (MigrationService)
- Plugin SQL: `src/Modules/*/migrations/*.sql` as `plugin:Name:file.sql`
- `clean_base_seed.php` — neutral site after install without demo
- `demo_content.php` — optional `[DEMO]` content

Do **not** put personal portfolio data in migrations.

### Creating a module

1. Add `backend/src/Modules/YourModule/YourModule.php` extending `AbstractModule`
2. Implement `name()`, `registerRoutes()`, optional `settingsSchema()`, `adminNav()`, migrations folder
3. Enable via plugins admin / registry
4. Optional FE: `frontend/src/modules/yourmodule/index.tsx` + `registerModule()`

## Frontend (`frontend/`)

| Path | Purpose |
| --- | --- |
| `src/admin/` | Admin app, i18n, pages |
| `src/modules/` | Feature UI registered into the shell |
| `src/builder/` | Page builder widgets |
| `src/components/` | Public layout / shared UI |
| `src/lib/api.ts` | API client |
| `*.test.ts` + `vitest.config.ts` | Unit tests (`npm test`) |

### Page builder widget

1. Register a widget in the builder registry (see existing widgets under `src/builder` / module packs)
2. Keep widget data JSON-serializable in page layouts
3. Render on public pages via the layout renderer

### API

- Prefix: `/api/v1`
- Auth: Bearer JWT (admin) or `MCP_API_TOKEN`
- Public site payload: `GET /site` (and related public routes)

## MCP (`mcp-cms/`)

1. Copy `mcp-cms/.env.example` → `mcp-cms/.env`
2. Set `CMS_URL`, `CMS_MCP_TOKEN=YOUR_MCP_TOKEN`, `CMS_REPO_ROOT=C:/JASEFLY_CMS`
3. Wire Cursor via `cursor-mcp.example.json` (server id `jasefly-cms`)

Gate flow: local build/test → changelog → deploy → verify. ZIP discovery looks for `jasefly-cms-update-*.zip` under `release/`.

## Content packs

- Schema: `content/content-pack.schema.json`
- Example: `content/content-pack.example.json`
- Demo: `content/content-pack.demo.json` (`[DEMO]` only)

Import via CMS tools / `import-content.php` — never ship real personal packs in this repo.

## Packaging

See root [README.md](README.md). Packager: `scripts/build-hosting.js`.
