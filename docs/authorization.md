# Authorization

## Purpose

Explain RBAC and how route-level permission checks run after authentication.

## How it works

Permissions are rows in `permissions`, linked to `roles` via `role_permissions`. `PermissionService::can` grants everything to `super_admin` (including MCP token users). Other roles load slugs by role. If permission tables are missing (pre-migration), only `content.*` and `media.manage` are allowed as a fallback.

`PermissionMiddleware` runs after `AuthMiddleware` on protected admin routes and enforces path heuristics:

- System paths → `system.manage`
- Settings paths → `settings.manage`
- Trash force → `content.force_delete`; trash mutations → `content.restore`
- Most admin DELETE → `content.delete` (domain modules listed as exempt enforce their own)

Create/update permissions for content resources are enforced inside `AdminController` / module handlers, not as a blanket POST/PUT rule.

## Execution flow

1. Request authenticated → `$r->user` set.
2. `PermissionMiddleware`:
   - system route regex → require `system.manage`
   - settings route regex → require `settings.manage`
   - trash / DELETE rules as above
3. Handler may call `PermissionService::require($user, '…')` for resource-specific slugs.

### Path helpers (`PermissionService`)

- Settings: `/admin/(seo|site-settings|theme|email-settings|password|redirects|translate)`
- System: `/admin/(backup|updates|system|plugins|content-pack|mcp|roles|permissions|ddos)`

## Key components

| Component | Role |
| --- | --- |
| `PermissionService` | `can` / `require` / path helpers |
| `PermissionMiddleware` | Cross-cutting admin path checks |
| Controllers / modules | Resource-specific permission slugs |

## Files involved

- `backend/src/Services/PermissionService.php`
- `backend/src/Middleware/PermissionMiddleware.php`
- `backend/src/Controllers/AdminController.php`
- `backend/src/Controllers/UserController.php`
- `frontend/src/admin/lib/rolePermissions.ts` (FE mirror; governed by contract tests)
- `backend/src/Platform/Manifest/permissions-core.v1.json`

## Related pages

- [authentication.md](authentication.md)
- [contracts-and-governance.md](contracts-and-governance.md)
- [security.md](security.md)

## Common mistakes

- Assuming every admin POST needs `content.create` at middleware — it does not.
- Forgetting module DELETE exemptions when adding a new admin DELETE route.
- Removing a core permission slug without updating the permissions snapshot.

## Extension points

- Register package permissions from `module.json` during install (see [package-lifecycle.md](package-lifecycle.md)).
- Call `PermissionService::require` inside handlers for fine-grained checks.

## See also

- [authentication.md](authentication.md)
- [routing.md](routing.md)
- [contracts-and-governance.md](contracts-and-governance.md)
