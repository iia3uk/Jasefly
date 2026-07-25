# Platform SDK Changelog

## 1.0.0 — stable (frozen)

- SDK generation 1 marked **stable** after `forms-sdk-reference` certification
- Compatibility Layer: v1 modules get upgrade recommendation, not "deprecated SDK v1"
- Lifecycle tests: `PlatformPackageLifecycleTest`, `certify-lifecycle.php`, CI `platform-sdk.yml`
- Docs: SDK-CERTIFICATION, PUBLIC-API-GOVERNANCE, API-SNAPSHOT, FORMS-REFERENCE-MODULE, MIGRATION-BUNDLED-FORMS
- MCP: `cms_module_certify`, `cms_sdk_api_diff`, `cms_public_services`, `cms_sdk_deprecations`

## 2.0.0 (platform CURRENT)

- Introduced Platform SDK (`App\Platform\*`) and Frontend Platform SDK (`frontend/src/platform`)
- Dual-gen support: SDK v1 + v2
- Capabilities registry, CompatibilityChecker, static import analysis
- CLI `backend/bin/sdk.php`, MCP sdk/capability/compatibility tools

## 1.0.0 (initial generation)

- Initial generation (Compatibility Layer aliases such as `db()`)
