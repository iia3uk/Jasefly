# Contracts and governance

## Purpose

Describe frozen snapshots that prevent silent breakage of the public Platform / MCP / builder surface.

## How it works

Committed JSON manifests under `backend/src/Platform/Manifest/` (and related paths) are compared to live code in `ContractGovernanceTest` and CI (`sdk.php api-diff`). Removing an identifier fails tests; adding one requires an intentional snapshot update (`node backend/tests/gen-contract-snapshots.js` where applicable).

### Snapshots

| Snapshot | Guards |
| --- | --- |
| `api-snapshot.v1.json` | Public Platform contract method signatures (`ApiSnapshot::diff`) |
| `capabilities.v1.json` | Core capability IDs still in `CapabilityRegistry` |
| `permissions-core.v1.json` | Core permission slugs still in migrations + FE `rolePermissions` |
| `events-core.v1.json` | Core event names still dispatched |
| `platform.manifest.json` | Platform meta export |
| `Analysis/sdk-policy.json` ↔ `ServiceRegistry::PUBLIC_CATALOG` | Exact public service id sync |
| `mcp-cms/manifest/mcp-tools.v1.json` | MCP tools not removed |
| `frontend/.../builder/manifest/widget-types.v1.json` | Builder widget types not removed (vitest) |

Capabilities: packages declare `capabilities.requires` / `provides` in `module.json`; host tracks via `CapabilityRegistry`. Compatibility scoring lives in Platform Analysis (`CompatibilityChecker`).

Compatibility layer: `CompatibilityLayer` maps older SDK generation aliases to current services — facts only; do not invent new aliases in docs.

## Execution flow

1. Developer changes Platform contracts or removes a permission/event/tool/widget.
2. `php backend/tests/run.php` → `ContractGovernanceTest` fails if snapshot diverges incorrectly.
3. CI `sdk` job runs `php backend/bin/sdk.php api-diff`.
4. Intentional change → regenerate snapshot → commit both code and snapshot.

## Key components

| Component | Role |
| --- | --- |
| `ContractGovernanceTest` | PHP suite |
| `ApiSnapshot` | Diff live vs frozen API |
| `CapabilityRegistry` | Capability catalog |
| `ServiceRegistry` | Public service IDs |
| vitest `widget-types.test.ts` | Widget freeze |

## Files involved

- `backend/src/Platform/Manifest/*.json`
- `backend/src/Platform/Analysis/sdk-policy.json`
- `backend/tests/ContractGovernanceTest.php`
- `backend/tests/gen-contract-snapshots.js`
- `mcp-cms/manifest/mcp-tools.v1.json`
- `frontend/src/builder/manifest/widget-types.v1.json`

## Related pages

- [platform-sdk.md](platform-sdk.md)
- [sdk-certification.md](sdk-certification.md)
- [testing.md](testing.md)
- [authorization.md](authorization.md)
- [events.md](events.md)

## Common mistakes

- Editing live Platform methods without updating `api-snapshot.v1.json`.
- Deleting an MCP tool name without updating `mcp-tools.v1.json`.
- Documenting “planned” capabilities that are not in the registry.

## Extension points

- Add a capability to the registry **and** snapshot together.
- Prefer additive API changes; mark removals via deprecations tooling (`sdk.php deprecations`).

## See also

- [sdk-versioning.md](sdk-versioning.md)
- [testing.md](testing.md)
- [platform-sdk.md](platform-sdk.md)
