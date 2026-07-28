# Public API Governance

Rules for evolving the Platform SDK (`App\Platform\*`, `frontend/src/platform`).

## Public vs internal

| Surface | Who may use | Location |
| --- | --- | --- |
| **Public** | ZIP package modules | `App\Platform\*`, `frontend/src/platform` |
| **Internal** | CMS core only | `App\Core\*`, `App\Services\*`, `App\Modules\*`, `App\Controllers\*` |

Package static analysis **blocks** imports from internal namespaces. Core may call Platform; packages must not call Core.

## Semver and SDK generations

- **Module semver** (`module.json` `version`): package release version (1.0.0, 1.1.0, …)
- **SDK generation** (`jasefly.sdk_version`): platform API generation (1, 2, …)

Platform constants: `App\Platform\SdkVersion`

| Generation | Stability | Meaning |
| --- | --- | --- |
| 1 | stable | Certified baseline (Forms reference); supported indefinitely via Compatibility Layer |
| 2 | current | Latest APIs; preferred for new modules |

Module `sdk_version` > platform max → install blocked.  
Module on stable but non-current generation → informational warning, not "deprecated".

## Deprecation process

1. Mark method/class with `@deprecated` or `DeprecatedApi` attribute
2. Add entry to `sdk-policy.json` / deprecations report
3. Keep Compatibility Layer alias for at least one SDK generation
4. Document in `SDK-CHANGELOG.md`
5. Run `php backend/bin/sdk.php api-diff` before release

CLI: `php backend/bin/sdk.php deprecations` · MCP: `cms_sdk_deprecations`

## Adding public methods

1. Add to appropriate contract in `App\Platform\Contracts\*`
2. Implement in adapter on `PlatformContext`
3. Register in `PublicApiRegistry` if exported
4. Regenerate manifest: `php backend/bin/sdk.php export-sdk`
5. Update `api-snapshot.v1.json`: `php backend/bin/sdk.php api-snapshot`
6. Extend capability if gated: `CapabilityRegistry` + migration if DB-backed

## Breaking changes

Breaking = remove/rename public contract method, change signature, or drop SDK generation support.

**Required:**

- Bump SDK generation or semver policy entry
- Migration guide in `SDK-CHANGELOG.md`
- Compatibility Layer shim when feasible
- CI `api-diff` must pass or document intentional break

Non-breaking: new optional methods, new capabilities, new service catalog entries.

## Related freezes (Priority 5)

Beyond contract methods, CI/`run.php` also guards:

- Core **capabilities**, **permissions**, **events**
- **ServiceRegistry** ↔ `sdk-policy.json` `allowed_service_ids`
- **MCP** tool names (`mcp-cms/manifest/mcp-tools.v1.json`)
- Builder **widget** type ids (`frontend/src/builder/manifest/widget-types.v1.json`)

Removing a frozen id fails tests; adding requires regenerating the snapshot.

## Review checklist

- [ ] Static analyzer clean (`certify`)
- [ ] `api-diff` clean (`ContractGovernanceTest` + CI)
- [ ] Capability providers registered when adding `requires`
- [ ] FE contract documented if `frontend/src/platform` changed
- [ ] Update related freezes if MCP tools / widget types / core perms changed
- [ ] `CMS_MAP.md` updated for new CLI/MCP tools

See: `API-SNAPSHOT.md`, `SDK-VERSIONING.md`, `PUBLIC-API-POLICY.md`.
