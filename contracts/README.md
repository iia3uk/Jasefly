# Jasefly Contracts (Source of Truth)

Language-neutral contracts shared by **PHP shared** and **Node VPS** runtimes.

Behavioral parity (covered baseline): **28/28** modules · **879/879** cases — see [`docs/dual-runtime-parity-progress.md`](../docs/dual-runtime-parity-progress.md). Freeze rules: [`docs/core-freeze-1.0.md`](../docs/core-freeze-1.0.md).

| Path | Contents |
| --- | --- |
| `openapi/jasefly.v1.yaml` | HTTP API |
| `schema/` | JSON Schema DTOs |
| `behavior/` | Dual HTTP case manifests (auth + deep) |
| `permissions/` | Core permission slugs |
| `events/` | Core event names |
| `capabilities/` | Baseline + extended runtime capabilities |
| `errors/` | Envelope + error vocabulary |
| `resources/` | Admin CRUD resource → table map |
| `blueprints/` | Declarative content types |
| `migrations/` | Canonical MySQL SQL (+ `index.v1.json`) |
| `modules/*.manifest.json` | Module runtime requirements |
| `mcp/` | MCP tool freeze |
| `builder/` | Widget type freeze |
| `platform/` | Platform SDK API snapshot |
| `baseline/` | Route inventories (PHP / Node) |
| `platform-fingerprint.v1.json` | Public CMS-detector signals (`X-Jasefly`, generator meta, `/.well-known/jasefly`) |

## Rules

1. Edit here first; sync copies into PHP/FE paths via `node scripts/contracts/sync-from-contracts.js`.
2. Validate: `node scripts/contracts/validate-contracts.js`.
3. Baseline features require PHP **and** Node parity tests green (`jasefly test --runtime=dual`).
4. Modules requiring `extended` capabilities must declare them; shared compiler hard-fails otherwise.
5. Do not weaken scrub rules to hide a real divergence — fix the runtime to match the contract.

See [`docs/dual-runtime.md`](../docs/dual-runtime.md) · [`docs/runtime-target-matrix.md`](../docs/runtime-target-matrix.md).
