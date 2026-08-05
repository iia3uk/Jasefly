# Jasefly Node runtime (VPS / cloud)

Production TypeScript backend — **no PHP on the server**. Implements the same baseline contracts as `backend/` (PHP shared hosting).

Product matrix: shared hosting = PHP · VPS/cloud = Node · dual = local/CI harness. See [`../docs/runtime-target-matrix.md`](../docs/runtime-target-matrix.md).

## Contracts

Source of truth: repo [`../contracts/`](../contracts/README.md). Do not diverge from OpenAPI / permissions / errors / capabilities / migrations / behavior manifests.

Parity gate: `node ../scripts/jasefly/cli.mjs test --runtime=dual` (**879/879** covered cases).

## Quick start

From repo root (preferred):

```bash
node scripts/jasefly/cli.mjs doctor --runtime=node --target=local
node scripts/jasefly/cli.mjs dev --runtime=node --target=local
```

Or inside this package:

```bash
cd runtime-node
cp .env.example .env
npm install
npm run migrate -- --install
npm run dev
```

Health: `http://localhost:3080/api/v1/health` (port may vary).

## Build / test

```bash
node ../scripts/jasefly/cli.mjs build --runtime=node --target=vps
node ../scripts/jasefly/cli.mjs test --runtime=node
```

Artifact under `release/jasefly-cms-vps-*.tgz` (`.zip` on Windows) — must not contain the PHP API tree.

## Deploy

MCP: set site `runtime` to Node VPS + SSH env, then `cms_local_build({ target: 'vps' })` → `cms_deploy_update({ site, confirm: true })`.

Systemd sample: `deploy/jasefly-node.service`.

## See also

- [`../docs/dual-runtime.md`](../docs/dual-runtime.md)
- [`../docs/deployment.md`](../docs/deployment.md)
- [`../README.md`](../README.md)
