# Deployment

## Purpose

Explain how code is packaged and shipped to shared hosting.

## How it works

Production runtime is PHP + MySQL; Node is not required on the host. Packaging: `scripts/build-hosting.js` builds the frontend, copies backend into `release/hosting-package`, writes root `index.php` / `.htaccess`, and zips install (`--mode=full`) or update (`--mode=update`).

Operator path for this repo: MCP server `mcp-cms` tool **`cms_release(summary, changes, site?)`** — one call for the full gate. With multiple hosts in `CMS_SITES`, pass **`site`** (id/alias/domain); list via **`cms_sites`**.

Secrets stay in `mcp-cms/.env` and `backend/config` (never in `mcp.json` or git).

## Execution flow

### `cms_release`

1. **build** `localBuild()` — `npm run build` in frontend → `node scripts/build-hosting.js --mode=update --yes` → find `release/jasefly-cms-update-*.zip` → `markBuild`.
2. **test** `localTest()` — lint + vitest + ZIP markers + PHP lint + `backend/tests/run.php` → `markTest`.
3. **changelog** write `CHANGELOG.md` entry + POST `/admin/mcp/changelog` → `markChangelog`.
4. **deploy** `assertDeployAllowed` → upload ZIP via CMS update API → `markDeployed`.
5. **verify** `postDeployVerify` — site + API + DB + diagnostics → `ready`.

Gate state: `mcp-cms/.gate-state.json` (`gate.js`). Deploy without changelog/test is blocked unless force.

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

## Extension points

- Extend verify checks in `verify.js`.
- Do not invent alternate SCP pipelines in agent rules — use MCP.

## See also

- [cli.md](cli.md)
- [diagnostics.md](diagnostics.md)
- [../mcp-cms/README.md](../mcp-cms/README.md)
