# Deployment

## Purpose

Explain how code is packaged and shipped for each production runtime.

## How it works

| Target | Runtime | Artifact |
| --- | --- | --- |
| Shared hosting | **PHP** | `jasefly-cms-install-*.zip` / `jasefly-cms-update-*.zip` — Node not required on host |
| VPS / cloud | **Node** | `jasefly-cms-vps-*.tgz` (`.zip` on Windows) — PHP API tree not in the package |
| Dual build | both | emits **both** artifact families |

CLI:

```bash
node scripts/jasefly/cli.mjs build --runtime=php --target=shared
node scripts/jasefly/cli.mjs build --runtime=node --target=vps
node scripts/jasefly/cli.mjs build --runtime=dual --target=shared
```

Matrix: [runtime-target-matrix.md](runtime-target-matrix.md) · dual ops: [dual-runtime.md](dual-runtime.md).

### PHP shared package

`scripts/build-hosting.js` builds the frontend, copies backend into `release/hosting-package`, writes root `index.php` / `.htaccess`, and zips install (`--mode=full`) or update (`--mode=update`). Package must **not** contain `runtime-node/`.

### Node VPS package

Built via `jasefly build --runtime=node` / MCP `cms_local_build({ target: 'vps' })`. Stage must contain **no** PHP API tree. Deploy over SSH (atomic) when site runtime is `node-vps`.

### MCP operator path

MCP server `mcp-cms` tool **`cms_release(summary, changes, site?)`** — one call for the full gate (typically PHP shared today). With multiple hosts in `CMS_SITES`, pass **`site`** (id/alias/domain); list via **`cms_sites`**. Full multi-site / multi-runtime guide: [mcp-multi-site.md](mcp-multi-site.md).

Secrets stay in `mcp-cms/.env` and `backend/config` (never in `mcp.json` or git).

## Execution flow

### `cms_release`

1. **build** `localBuild()` — `npm run build` in frontend → `node scripts/build-hosting.js --mode=update --yes` → find `release/jasefly-cms-update-*.zip` → `markBuild`.
2. **test** `localTest()` — lint + vitest + ZIP markers + PHP lint + `backend/tests/run.php` → `markTest`.
3. **changelog** write `CHANGELOG.md` entry + POST `/admin/mcp/changelog` → `markChangelog`.
4. **deploy** `assertDeployAllowed` → upload ZIP via CMS update API → `markDeployed` (or `pending_telegram` if host has Telegram Approve).
5. **verify** `postDeployVerify` — site + API + DB + diagnostics → `ready`.

Gate state: `mcp-cms/.gate-state.json` (`gate.js`). Deploy without changelog/test is blocked unless force.

### Telegram deploy approve (opt-in)

Secrets only on the **host** (not mcp-cms, not Mail DB):

- PHP shared: `api/config/.env`
- Node VPS: `runtime-node/.env` (or process env on the VPS)

```env
TELEGRAM_DEPLOY_APPROVE=1
TELEGRAM_DEPLOY_BOT_TOKEN=…
TELEGRAM_DEPLOY_CHAT_ID=…
TELEGRAM_DEPLOY_WEBHOOK_SECRET=…   # random; Telegram setWebhook secret_token
TELEGRAM_DEPLOY_TTL_SECONDS=3600
```

**PHP shared:** `POST /admin/updates` stages the ZIP → Telegram Approve/Reject → apply on host. MCP returns `pending_approval` → after Approve call `cms_verify_alive`.

**Node VPS:** SSH still runs from mcp-cms. Flow: `POST /admin/deploy/telegram/request` → Telegram Approve → `POST …/redeem` → `deployVpsAtomic`. MCP `cms_deploy_update` / `cms_release` call request/redeem automatically; while pending they return `pending_approval: true` / `ready: false` — Approve in Telegram, then `cms_deploy_update(confirm=true)` again. Admin escape hatch: `/admin/updates/pending/{id}/approve|reject`.

### Manual packaging

```bash
node scripts/build-hosting.js --mode=full --domain=https://YOUR_DOMAIN --demo=no --yes
node scripts/build-hosting.js --mode=update --yes
```

Install ZIP extracted on host → `/install.php`. Updates via admin Updates UI or MCP upload.

## Key components

| Piece | Path |
| --- | --- |
| MCP tools | `mcp-cms/src/index.js` |
| Build/test | `mcp-cms/src/local.js` |
| Gate | `mcp-cms/src/gate.js` |
| Verify | `mcp-cms/src/verify.js` |
| Packager | `scripts/build-hosting.js` |

## Files involved

As above; output under `release/`. Hosting layout docs emitted beside ZIP when built.

## Related pages

- [testing.md](testing.md)
- [recovery.md](recovery.md)
- [security.md](security.md)
- [../INSTALL.md](../INSTALL.md)

## Common mistakes

- Uploading an ad-hoc zip instead of `cms_release` / `build-hosting` update package.
- Committing `.env` / `config.local.php`.
- Skipping Ctrl+F5 after deploy (hashed SPA assets).

## Server header (nginx)

The `Server` response header is **not** an application fingerprint. Jasefly never sets it and must not fake one.

| Environment | Who emits `Server` | What Jasefly can do |
| --- | --- | --- |
| PHP shared hosting (Beget and similar) | Front nginx (`nginx-reuseport/…`) in front of Apache/PHP-FPM | **Nothing safe.** No nginx config access. Do not send a dummy `Server` from PHP — it will not replace the proxy header and only adds noise. |
| Node VPS (operator-managed reverse proxy) | Your nginx/Caddy in front of Hono | Hide version with the proxy config below. |

Recommended nginx (Node VPS / any host you control):

```nginx
server_tokens off;
# optional, needs headers-more-nginx-module:
# more_clear_headers Server;
```

If PHP-FPM is ever behind the same proxy, also:

```nginx
fastcgi_hide_header X-Powered-By;
proxy_hide_header X-Powered-By;
```

Jasefly already strips `X-Powered-By` in PHP (`RuntimeHardening` + `.user.ini` + Apache unset) and does not emit it from Node. Public identity remains `X-Jasefly: 1`.

## Extension points

- Extend verify checks in `verify.js`.
- Do not invent alternate SCP pipelines in agent rules — use MCP.

## See also

- [cli.md](cli.md)
- [diagnostics.md](diagnostics.md)
- [../mcp-cms/README.md](../mcp-cms/README.md)
