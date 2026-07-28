# Jasefly CMS

Modular CMS: PHP API (`backend/`), React SPA (`frontend/`), Page Builder, bundled modules + ZIP packages, MCP deploy/content tools (`mcp-cms/`).

**Docs (engineers):** start at [`docs/README.md`](docs/README.md).  
**Agent path map:** [`CMS_MAP.md`](CMS_MAP.md).  
**Install:** [`INSTALL.md`](INSTALL.md).

## Repository layout

| Path | Role |
| --- | --- |
| `backend/` | REST API, installer, migrations, modules |
| `frontend/` | Public site + admin (Vite/React) |
| `mcp-cms/` | MCP server (build → test → deploy gate) |
| `scripts/` | `build-hosting.js`, `build-module.js` |
| `modules-src/` | ZIP package sources |
| `content/` | Content-pack templates |
| `docs/` | Implementation documentation |

No Composer — custom PHP autoload in `Bootstrap`.

## Quick start

**Windows:** `setup.bat` → `start.bat` → http://localhost:5173  

**Manual:** [`INSTALL.md`](INSTALL.md). Admin: `/admin` (change installer password immediately).

## Shared hosting (short)

1. `node scripts/build-hosting.js --mode=full --domain=https://YOUR_DOMAIN --demo=no --yes`
2. Upload `release/jasefly-cms-install-*.zip`, extract
3. Create MySQL DB → open `/install.php`
4. Updates: `--mode=update` or MCP `cms_release`

Secrets only in `api/config/.env` / `config.local.php` on the server.

## Documentation index

| Doc | Topic |
| --- | --- |
| [docs/README.md](docs/README.md) | Reading order |
| [INSTALL.md](INSTALL.md) | Install / run |
| [LOCAL_DEV.md](LOCAL_DEV.md) | Windows launcher |
| [CLEAN_INSTALL.md](CLEAN_INSTALL.md) | Clean host install |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers + ownership |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Contributor entry |
| [SECURITY.md](SECURITY.md) | Security pointer |
| [CMS_MAP.md](CMS_MAP.md) | Symptom → file |
| [mcp-cms/README.md](mcp-cms/README.md) | MCP ops |

## Not in the public tree

`.env`, `config.local.php`, tokens, `node_modules/`, `frontend/dist/`, `release/` build artifacts.
