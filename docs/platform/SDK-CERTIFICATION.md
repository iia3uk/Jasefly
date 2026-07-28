# SDK Certification

Official checklist for certifying installable ZIP modules against the Platform SDK.

## Command

```bash
php backend/bin/sdk.php certify modules-src/<slug>
# or after build:
php backend/bin/sdk.php certify release/modules/jasefly-module-<slug>-x.y.z.zip
```

MCP: `cms_module_certify` with `path_or_slug`.

## Criteria (certify steps)

| Step | What it checks |
| --- | --- |
| manifest | Valid `module.json`, slug, entrypoints, SDK version |
| compatibility | Capability requirements, SDK generation, score |
| static_analysis | No `App\Core\*`, forbidden service IDs, import policy |
| php_lint | `php -l` on all PHP files |
| migrations | SQL files parse; uninstall path when declared |
| frontend_imports | No `@/` or React imports in `frontend-dist/` |
| typecheck | Optional if `frontend/src/` + tsconfig present |
| frontend_build | Optional note — run `build-module.js` for release ZIP |

**Pass:** `ok: true`, no critical/high findings. Warnings (medium/low) may remain.

## Reference module: forms-sdk-reference

Canonical certification target at `modules-src/forms-sdk-reference/`:

- SDK v1 (stable generation)
- Forms engine reimplemented via `App\Platform\*` only
- Admin pages, public submit API, builder widget, migrations + uninstall SQL
- Offline tests in `backend/tests/PlatformPackageLifecycleTest.php`

```bash
php backend/bin/sdk.php certify modules-src/forms-sdk-reference
node scripts/build-module.js forms-sdk-reference --yes
```

## Lifecycle script

`backend/bin/certify-lifecycle.php` runs offline checks plus optional DB install lifecycle.

| Environment | Behavior |
| --- | --- |
| No MySQL | Exit 0, `{ok:true, skipped:true, reason:"no database"}` |
| MySQL, no flag | Offline checks only |
| `JASEFLY_LIFECYCLE_DB=1` | Build ZIP, upload, inspect, install, enable, health |

```bash
php backend/bin/certify-lifecycle.php
JASEFLY_LIFECYCLE_DB=1 php backend/bin/certify-lifecycle.php
```

## CI

Workflow: `.github/workflows/platform-sdk.yml`

- **sdk job:** `run.php`, `api-diff`, certify demo-kit + forms-sdk-reference, frontend build, build-module
- **lifecycle job:** MySQL service, applies `001_schema` + `migrate.php`, then `JASEFLY_LIFECYCLE_DB=1 php backend/bin/certify-lifecycle.php` (install→update→rollback→uninstall). Blocking (no `continue-on-error`).

## Limitations

- Certify does not replace manual QA on a live host
- Lifecycle install requires full CMS schema (core migrations)
- Bundled `Modules/Forms` remains in core — see `MIGRATION-BUNDLED-FORMS.md` for future migration plan
- SDK v1 is **stable** but v2 is **current** — upgrade when you need latest APIs (`jobs()`, etc.)

See also: `PUBLIC-API-GOVERNANCE.md`, `API-SNAPSHOT.md`, `FORMS-REFERENCE-MODULE.md`.
