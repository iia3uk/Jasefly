# Jasefly CMS

Modular AI-ready CMS: PHP API, React admin, page builder, plugins, MCP tooling, and shared-hosting install/update ZIPs.

Author: IIA3UK

## Requirements

- PHP 8.2+ (pdo_mysql or sqlite)
- Node.js 20+ (frontend build / MCP)
- MySQL 8+ / MariaDB (or SQLite for local)

## Repository layout

| Path | Role |
| --- | --- |
| `backend/` | REST API, installer, migrations, modules |
| `frontend/` | Public site + admin (Vite/React) |
| `mcp-cms/` | Cursor MCP server (build → test → deploy gate) |
| `scripts/` | `build-hosting.js` packager |
| `content/` | Content-pack schema / examples (no personal data) |

## Local development

```bat
setup.bat
start.bat
```

Or manually:

```bat
cd frontend && npm install && npm run dev
```

API: configure `backend/config/config.local.php` from `config.local.example.php`, or run the installer against SQLite/MySQL.

See [LOCAL_DEV.md](LOCAL_DEV.md) and [CLEAN_INSTALL.md](CLEAN_INSTALL.md).

## Install dependencies

```bat
cd frontend && npm install
cd ..\mcp-cms && npm install
```

No Composer package — backend is plain PHP with a custom autoloader.

## Build frontend

```bat
cd frontend
npm run build
```

Output: `frontend/dist/`

## Hosting packages

```bat
build-hosting.bat
```

Or:

```bat
node scripts/build-hosting.js --mode=full --domain=https://YOUR_DOMAIN --demo=no --yes
node scripts/build-hosting.js --mode=update --domain=https://YOUR_DOMAIN --yes
```

| Mode | ZIP name |
| --- | --- |
| `full` (install) | `release/jasefly-cms-install-YYYY-MM-DD-HH-MM-SS.zip` |
| `update` | `release/jasefly-cms-update-YYYY-MM-DD-HH-MM-SS.zip` |

Copy defaults from `build-hosting.config.example.json` → `build-hosting.config.json` (gitignored).

### Install ZIP

- Includes web installer
- No real DB dump, no `config.local.php`, no uploads
- Clean CMS after install

### Update ZIP

- Backend + compiled frontend + migrations
- Does **not** overwrite `config.local.php`, uploads, backups, logs

## Shared hosting

1. Upload **install** ZIP, extract to `public_html` (or your docroot).
2. Create an empty MySQL database.
3. Open `/install.php`, follow the wizard, create the first admin.
4. Delete installer files if not auto-removed.
5. Log in at `/admin` (or your custom admin path).

Updates: Admin → Updates → upload `jasefly-cms-update-*.zip`.

## Docs

- [CLEAN_INSTALL.md](CLEAN_INSTALL.md) — empty DB → installer → first admin
- [DEVELOPMENT.md](DEVELOPMENT.md) — modules, migrations, widgets, API, MCP
- [ARCHITECTURE.md](ARCHITECTURE.md) — system map
- [SECURITY.md](SECURITY.md) — checklist
- [mcp-cms/README.md](mcp-cms/README.md) — MCP setup

## License / authorship

Jasefly CMS by IIA3UK. This repository ships **without** personal portfolio content, secrets, or production hosting credentials.
