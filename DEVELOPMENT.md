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
| `config/app.php` | Defaults; secrets via `config.local.php` / `.env` |

Autoload is custom (no Composer). Modules auto-discovered under `src/Modules/*/`.

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
