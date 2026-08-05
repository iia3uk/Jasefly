# Jasefly Node runtime (VPS)

Production TypeScript backend — **no PHP**. Implements the same baseline contracts as `backend/` (PHP shared).

## Contracts

Source of truth: repo `contracts/`. This runtime must not diverge from OpenAPI / permissions / errors / capabilities / migrations.

## Quick start

```bash
cd runtime-node
cp .env.example .env
npm install
npm run migrate -- --install
npm run dev
```

Health: `http://localhost:3080/api/v1/health`

## Tests

```bash
npm test
```

Parity vs PHP (both servers running):

```bash
PHP_BASE=http://127.0.0.1:8080/api/v1 NODE_BASE=http://127.0.0.1:3080/api/v1 node ../tests/parity/runner.mjs
```

## Deploy

MCP: set `CMS_SITE_{ID}_RUNTIME=node-vps` + SSH env vars, then `cms_local_build({target:'vps'})` → `cms_deploy_update({site, confirm:true})`.

Systemd unit sample: `deploy/jasefly-node.service`.
