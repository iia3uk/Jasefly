# MCP multi-site (one agent → many hosts)

## Purpose

One Cursor MCP process (`mcp-cms`) can operate **several Jasefly installations** — content, modules, diagnostics, and deploys — without running a separate agent per domain.

This is **multi-site orchestration**, not multi-tenant DB inside one install.

## How it works

| Mode | Config | Remote tools |
| --- | --- | --- |
| Legacy single site | `CMS_URL` + `CMS_MCP_TOKEN` | `site` optional |
| Multi-site | `CMS_SITES` + `CMS_SITE_{ID}_*` | `site` **required** when ≥2 hosts |

**Source of truth for hosts = `mcp-cms/.env` only.**  
Adding / renaming / removing a site = edit env + restart MCP.  
**Never** edit `mcp-cms/src/sites.js` (or any MCP source) to register a domain — that file is a runtime **parser** of `CMS_SITES` / `CMS_SITE_{ID}_*`, not a site catalog.

Secrets live only in [`mcp-cms/.env`](../mcp-cms/.env.example) (never in `mcp.json`, never in chat).

```env
CMS_SITES=jasefly,iia3uk

CMS_SITE_JASEFLY_URL=https://jasefly.com
CMS_SITE_JASEFLY_TOKEN=…
CMS_SITE_JASEFLY_ALIASES=jasefly.com,www.jasefly.com,official
CMS_SITE_JASEFLY_RUNTIME=php-shared
CMS_SITE_JASEFLY_DEPLOYMENT=shared

CMS_SITE_IIA3UK_URL=https://iia3uk.ru
CMS_SITE_IIA3UK_TOKEN=…
CMS_SITE_IIA3UK_ALIASES=iia3uk.ru,www.iia3uk.ru
```

Optional Node VPS site (same MCP process):

```env
CMS_SITE_VPSDEMO_URL=https://vps.example.com
CMS_SITE_VPSDEMO_TOKEN=…
CMS_SITE_VPSDEMO_RUNTIME=node-vps
CMS_SITE_VPSDEMO_DEPLOYMENT=vps
CMS_SITE_VPSDEMO_SSH_HOST=vps.example.com
CMS_SITE_VPSDEMO_SSH_USER=deploy
CMS_SITE_VPSDEMO_SSH_KEY_PATH=C:/Users/you/.ssh/id_ed25519
CMS_SITE_VPSDEMO_DEPLOY_PATH=/var/www/jasefly
CMS_SITE_VPSDEMO_RESTART_COMMAND=sudo systemctl restart jasefly-node
```

After editing `.env`, restart the MCP server in Cursor.

## Agent rules

1. Call **`cms_sites`** first — list ids/aliases/domains/runtimes **without tokens**.
2. If **2+** sites and the user did not name a host → **ask**; do not guess.
3. Pass **`site`** on every remote tool: id (`jasefly`), alias (`official`), or domain (`iia3uk.ru`).
4. There is **no fan-out** “deploy to all” — one call → one host.
5. Local tools (`cms_local_build`, `cms_local_test`) do not need `site`.
6. Dangerous mutations require **`confirm: true`**. Prefer backup before production deploys.

Example:

```text
cms_sites
  → cms_release({ summary: "…", changes: ["…"], site: "iia3uk" })
```

## What one agent can do across sites

| Area | Tools (examples) |
| --- | --- |
| Inspect | `cms_site_map`, `cms_pages_digest`, `cms_db_schema`, `cms_site_diagnostics` |
| Content | `cms_list` / `cms_get` / `cms_update` / `cms_bulk` / singletons |
| Modules | `cms_module_*`, `cms_module_release` (+ optional `install`) |
| Plugins | `cms_plugins_list`, `cms_plugin_toggle` |
| Release | `cms_release` / `cms_deploy_update` → verify |
| Ops | `cms_verify_alive`, `cms_hosting_guard` |

Hosting rate limits and GET cache apply **per site** (`cms_hosting_guard`).

## Runtime mix

The same MCP can mix:

- PHP shared sites (`RUNTIME=php-shared`)
- Node VPS sites (`RUNTIME=node-vps` + SSH fields)

Build target must match the site: shared ZIP vs VPS artifact. Matrix: [runtime-target-matrix.md](runtime-target-matrix.md).

## Files involved

| Piece | Path | Who edits |
| --- | --- | --- |
| **Host list + secrets** | `mcp-cms/.env` (from `.env.example`) | **Operator / agent** |
| Env template | `mcp-cms/.env.example` | Docs only |
| Env parser (not a catalog) | `mcp-cms/src/sites.js` | **Platform maintainers only** — never for “add client site” |
| MCP server | `mcp-cms/src/index.js` | Platform maintainers |
| Operator README | [`mcp-cms/README.md`](../mcp-cms/README.md) | — |

## Related pages

- [deployment.md](deployment.md)
- [dual-runtime.md](dual-runtime.md)
- [../mcp-cms/README.md](../mcp-cms/README.md)
- [../CMS_MAP.md](../CMS_MAP.md) (MCP tool table)

## Common mistakes

- Opening `sites.js` to “add a third site” — wrong; add `CMS_SITE_{ID}_*` to `.env` and append the id to `CMS_SITES`.
- Configuring two sites but omitting `site` on `cms_release`.
- Putting tokens in Cursor `mcp.json`.
- Assuming one deploy updates every host in `CMS_SITES`.
- Using a shared-hosting ZIP against a `node-vps` site (or the reverse).
