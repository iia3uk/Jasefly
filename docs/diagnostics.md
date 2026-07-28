# Diagnostics

## Purpose

Explain how operators see health, module load failures, safe-mode, and last errors.

## How it works

`SystemHealthService::status()` builds a payload with PHP/DB/storage/trash/opcache hints, MCP token presence hint, `module_load_failures` from `ModuleRegistry::loadFailures()`, and `module_safe_mode` from `ModuleSafeMode::read()`. Exposed at `GET /admin/system/status` via `SystemController` (permission `system.manage`). Admin UI: `/admin/system`.

Public `GET /health` is registered by `SystemModule` (inline JSON). Early fatals go through `portfolio_json_error` → `storage/logs/error.log` + `ErrorReportService::store`. Last error endpoints: `GET|POST /admin/system/last-error*`.

Package safe-mode file: `storage/module-safe-mode.json` (via `ModulePackagePaths`). Failed package loads mark `installed_modules` failed, mirror off, and skip on next boot until cleared.

## Execution flow

1. Bootstrap records failures during discover/boot/package load.
2. Admin opens System → status includes failures + safe-mode.
3. Debug: `?debug=1` on health, or `storage/.show_errors`, or authenticated error detail policy in `ErrorReportService`.

## Key components

| Component | Role |
| --- | --- |
| `SystemHealthService` | Aggregated status |
| `ModuleRegistry::loadFailures` | Per-module stage errors |
| `ModuleSafeMode` | Skip list for packages |
| `ErrorReportService` | Structured last error |
| Admin System page | `EnterprisePages.tsx` / system UI |

## Files involved

- `backend/src/Services/SystemHealthService.php`
- `backend/src/Services/ErrorReportService.php`
- `backend/src/Services/Modules/ModuleSafeMode.php`
- `backend/src/Controllers/SystemController.php`
- `backend/public/index.php`
- `backend/tests/DiagnosticsTest.php`

## Related pages

- [bootstrap-and-request.md](bootstrap-and-request.md)
- [recovery.md](recovery.md)
- [module-system.md](module-system.md)

## Common mistakes

- Ignoring `/health` `degraded` while HTTP is still 200.
- Deleting safe-mode JSON without fixing the package — it will fail again on load.

## Extension points

- Record failures via `ModuleRegistry::recordLoadFailure`.
- Contribute nothing to Core health without SystemModule ownership.

## See also

- [recovery.md](recovery.md)
- [cli.md](cli.md)
- [testing.md](testing.md)
