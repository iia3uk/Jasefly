# Jasefly Contracts (Source of Truth)

Language-neutral contracts shared by **PHP shared** and **Node VPS** runtimes.

| Path | Contents |
| --- | --- |
| `openapi/jasefly.v1.yaml` | HTTP API |
| `schema/` | JSON Schema DTOs |
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

## Rules

1. Edit here first; sync copies into PHP/FE paths via `node scripts/contracts/sync-from-contracts.js`.
2. Validate: `node scripts/contracts/validate-contracts.js`.
3. Baseline features require PHP **and** Node parity tests green.
4. Modules requiring `extended` capabilities must declare them; shared compiler hard-fails otherwise.

See `docs/dual-runtime-architecture-plan.md`.
