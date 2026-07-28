# SDK certification

## Purpose

Explain how a package is certified against the Platform SDK before shipping.

## How it works

CLI: `php backend/bin/sdk.php certify <path-or-slug>` (source under `modules-src/` or a built ZIP). `scripts/build-module.js` runs certify before producing the release ZIP. MCP exposes the same flow as `cms_module_certify` when that tool is enabled in the MCP manifest.

### Certify steps (implementation)

| Step | Checks |
| --- | --- |
| manifest | Valid `module.json`, slug, entrypoints, SDK version |
| compatibility | Capability requirements, SDK generation, score |
| static_analysis | No `App\Core\*`, forbidden service IDs, import policy |
| php_lint | `php -l` on package PHP |
| migrations | SQL parse; uninstall path when declared |
| frontend_imports | No host-only `@/` / React imports in shipped `frontend-dist/` |
| typecheck / frontend_build | Optional notes when source FE present |

Pass: report `ok: true` without critical/high findings.

### Reference packages

- `modules-src/demo-kit/` — general SDK + package manager sample.
- `modules-src/forms-sdk-reference/` — Forms engine via Platform only (SDK generation 1 stable).

### Lifecycle certify

`backend/bin/certify-lifecycle.php` — offline `PlatformPackageLifecycleTest`; with `JASEFLY_LIFECYCLE_DB=1` runs install → update → rollback → uninstall against MySQL. CI job `lifecycle` in `.github/workflows/platform-sdk.yml` is blocking.

## Execution flow

1. Develop under `modules-src/{slug}/`.
2. `php backend/bin/sdk.php certify modules-src/{slug}`.
3. `node scripts/build-module.js {slug} --yes`.
4. Install via Module Manager or `modules.php`.
5. Optional: `JASEFLY_LIFECYCLE_DB=1 php backend/bin/certify-lifecycle.php`.

## Key components

| Component | Role |
| --- | --- |
| `SdkCliService` | CLI commands |
| `PackageStaticAnalyzer` | Static policy |
| `CompatibilityChecker` | Capability / SDK score |
| `certify-lifecycle.php` | Full lifecycle |

## Files involved

- `backend/bin/sdk.php`
- `backend/bin/certify-lifecycle.php`
- `backend/src/Platform/Analysis/`
- `backend/tests/PlatformPackageLifecycleTest.php`
- `.github/workflows/platform-sdk.yml`
- `scripts/build-module.js`

## Related pages

- [platform-sdk.md](platform-sdk.md)
- [package-lifecycle.md](package-lifecycle.md)
- [testing.md](testing.md)
- [sdk-versioning.md](sdk-versioning.md)

## Common mistakes

- Treating certify as a substitute for host QA.
- Running lifecycle DB certify without core migrations applied.
- Shipping without `frontend-dist` when the package declares a FE entry.

## Extension points

None beyond fixing package code until certify is green.

## See also

- [contracts-and-governance.md](contracts-and-governance.md)
- [cli.md](cli.md)
- [testing.md](testing.md)
