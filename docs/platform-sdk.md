# Platform SDK

## Purpose

Define what installable ZIP modules may call on the host.

## How it works

Packages must depend on **`App\Platform\*`** (PHP) and **`frontend/src/platform`** (FE) only. Host builds a `PlatformContext` via `PlatformContextFactory`. Preferred package entry: `bootPlatform(PlatformContext $ctx)` on `App\Platform\Package\AbstractPackageModule` (also re-exported under Core Modules for adapters).

`PackageModuleAdapter` calls `bootPlatform` once lazily inside `registerRoutes`, registers provided capabilities, then delegates route registration.

### Backend services on `PlatformContext`

`database()`, `storage()`, `events()`, `scheduler()` / `jobs()`, `mail()`, `notifications()`, `settings()`, `permissions()`, `users()`, `media()`, `builder()`, `http()`, `cache()`, `logger()`, `config()`, `translations()`, `assets()`, `health()`, `content()`, `capabilities()`, plus `feature()` / `service()` for catalogued IDs.

Contracts live under `backend/src/Platform/Contracts/`. Adapters under `backend/src/Platform/Adapters/` wrap Core. `CompatibilityLayer` supplies SDK generation aliases. Public service IDs are governed by `ServiceRegistry::PUBLIC_CATALOG` and `Analysis/sdk-policy.json`.

### Frontend

Package ESM default export registers via host context (`admin`, `builder`, `public`). Hybrid loader still accepts legacy helpers (`registerAdminNavItem`, …) in `packageModuleLoader`.

## Execution flow

1. Package enabled and loaded by `InstalledModuleLoader`.
2. First `registerRoutes` → `bootPlatformOnce` → capabilities.
3. Package registers HTTP / uses `$ctx` services.
4. FE: `GET /modules/runtime-assets` → dynamic import `/modules/{slug}/…`.

## Key components

| Component | Role |
| --- | --- |
| `PlatformContext` | Public facade |
| `PlatformContextFactory` | Host-only wiring |
| `AbstractPackageModule` | Package base |
| `CapabilityRegistry` | Capability IDs |
| `SdkVersion` | CURRENT=2, SUPPORTED=[1,2] |
| FE `frontend/src/platform` | Registration APIs |

## Files involved

- `backend/src/Platform/`
- `backend/src/Platform/SdkVersion.php`
- `backend/bin/sdk.php`
- `frontend/src/platform/`
- `frontend/src/core/packageModuleLoader.ts`

## Related pages

- [package-lifecycle.md](package-lifecycle.md)
- [sdk-versioning.md](sdk-versioning.md)
- [sdk-certification.md](sdk-certification.md)
- [contracts-and-governance.md](contracts-and-governance.md)

## Common mistakes

- `use App\Core\…` inside a package — certify fails static analysis.
- Importing `@/` or React from shipped `frontend-dist/` sources that are not host-provided.
- Targeting unsupported `jasefly.sdk_version`.

## Extension points

- Implement package module + `module.json` capabilities requires/provides.
- Register FE via `register(ctx)` in the package frontend entry.

## See also

- [sdk-certification.md](sdk-certification.md)
- [contracts-and-governance.md](contracts-and-governance.md)
- [ownership-boundaries.md](ownership-boundaries.md)
