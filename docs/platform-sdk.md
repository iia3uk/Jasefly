# Platform SDK

## Purpose

Define what installable ZIP modules may call on the host.

## How it works

Packages must depend on **`App\Platform\*`** (PHP) and **`frontend/src/platform`** (FE) only. Host builds a `PlatformContext` via `PlatformContextFactory`. Preferred package entry: `bootPlatform(PlatformContext $ctx)` on `App\Platform\Package\AbstractPackageModule` (also re-exported under Core Modules for adapters).

`PackageModuleAdapter` calls `bootPlatform` once lazily inside `registerRoutes`, registers provided capabilities, then delegates route registration.

### Backend services on `PlatformContext`

`database()`, `storage()`, `events()`, `scheduler()` / `jobs()`, `mail()`, `notifications()`, `settings()`, `permissions()`, `users()`, `media()`, `builder()`, `http()`, `cache()`, `logger()`, `config()`, `translations()`, `assets()`, `health()`, `content()`, `capabilities()`, `access()`, plus `feature()` / `service()` for catalogued IDs.

Contracts live under `backend/src/Platform/Contracts/`. Adapters under `backend/src/Platform/Adapters/` wrap Core. `CompatibilityLayer` supplies SDK generation aliases. Public service IDs are governed by `ServiceRegistry::PUBLIC_CATALOG` and `Analysis/sdk-policy.json`.

### Access Providers

Universal access control is a **Platform service** (`access` / capability `access.service`), not a billing plugin. Builder and public render never call Orders/Payments/Subscriptions directly — only:

```php
$decision = $ctx->access()->can($userId, $rule);
// AccessDecision { allowed, reason?, provider?, meta? }
```

ZIP modules register providers in `bootPlatform`:

```php
$ctx->access()->registerProvider(new GroupAccessProvider($ctx->database()));
```

Rule DSL (store in widget `settings.rule` / `settings.access`):

```json
{
  "version": 1,
  "op": "any",
  "rules": [
    { "provider": "auth", "assert": "authenticated" },
    { "provider": "role", "assert": "in", "params": { "roles": ["member"] } },
    { "provider": "purchase", "assert": "owns", "params": { "product_id": 12 } }
  ]
}
```

Operators: `all` | `any` | `not`. Unknown or unavailable provider → **deny** (fail-closed). Public `layout_json` is filtered server-side (`filterLayout`) so locked Access Container children never leak to guests.

Built-ins: `auth`, `role` (core); `purchase` (Orders/Payments boot); `capability` (Admin ACL). Scaffolds: `modules-src/user-groups` → `group`, `subscriptions` → `subscription`, `wallet` → `wallet`. HTTP: `GET /access/providers`, `POST /access/can`, `GET /admin/access/bootstrap`. Builder widget: `access-container` + `AccessRuleEditor`.

### Admin ACL (capability-based)

Admin UI and `/admin/*` APIs use the same AccessService via provider `capability` and `canCapability(AccessContext)`.

```php
$ctx->access()->registerCapability([
  'slug' => 'demo-kit.view',
  'label' => 'Demo Kit',
  'group' => 'modules',
  'risk' => 'low',
  'scope_default' => 'site',
  'default_roles' => ['admin', 'editor'],
]);
$ctx->access()->registerAdminNavItem([
  'group' => 'Разработка',
  'path' => '/admin/demo-kit',
  'label' => 'Demo Kit',
  'capability' => 'demo-kit.view',
  'icon' => 'package',
]);
$decision = $ctx->access()->canCapability(new \App\Platform\Access\Acl\AccessContext($userId, 'demo-kit.view'));
```

Effective rights: union of all user roles + allow/deny overrides (**deny wins**). `PermissionService::can/require` adapts legacy permission slugs. FE loads `capabilities` from `GET /auth/me` — do not check `role === 'admin'`.

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
