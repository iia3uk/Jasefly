# Module System

This CMS is a **modular framework**. The portfolio site is the first product built on it.

## Mental model

```
Core/          → Router, DB, JWT, ModuleRegistry, shared services
Modules/X/     → Self-contained feature packages
```

Adding games, courses, marketplace, docs, or downloads later = **add a module folder**, not rewrite core.

## Creating a module

1. Copy `src/Modules/_Template/`
2. Rename the folder and `*Module.php` class (must be `{FolderName}Module`)
3. Implement `registerRoutes()`, `adminNav()`, `resources()`
4. Add SQL migrations under `database/migrations/` or `modules/{name}/migrations/`
5. Enable — auto-discovery loads every `Modules/*/FooModule.php`

Disable without deleting:

```php
// config.local.php
'modules_disabled' => 'blog,testimonials',
```

or env `MODULES_DISABLED=blog,testimonials`

## Contract

Every module implements `App\Core\Contract\ModuleInterface`:

| Method | Purpose |
| --- | --- |
| `name()` | Machine id |
| `boot()` | Optional kernel setup |
| `registerRoutes()` | Public + admin REST |
| `adminNav()` | Sidebar items |
| `resources()` | Declarative resource metadata |

## API versions

`config/app.php` → `api.versions` registers modules on **both** `/api/v1` and `/api`.  
Ship `/api/v2` later by appending a prefix — v1 clients keep working.

## Installable packages (Module Package Manager)

Third-party / separately shipped modules use ZIP packages (`docs/MODULE-PACKAGES.md`):

- Runtime path: `api/modules/{slug}/` + `public_html/modules/{slug}/`
- Registry tables: `installed_modules`, `module_operations`, `module_migrations`
- Admin: `/admin/modules` · CLI: `php backend/bin/modules.php`
- Build: `node scripts/build-module.js {slug}`
- Demo source: `modules-src/demo-kit/`

Bundled modules under `src/Modules/` remain in-repo **platform** plugins (enable/disable via `/admin/plugins`).

**Policy:** new optional features are installable packages under `modules-src/`, not new folders in `src/Modules/`.  
Guide: `docs/MODULE-FROM-PLUGINS.md`. Platform API: `docs/platform/PLATFORM-SDK.md` (`App\Platform\*` only).

## Frontend modules

Mirror structure under `frontend/src/modules/{name}/`:

```
modules/projects/
  api.ts
  types.ts
  components/
  pages/
  admin/
```

Shared UI lives in `shared/ui` and `shared/admin`.

## Platform system modules

| Module | Role | Docs |
| --- | --- | --- |
| `Scheduler` | Job queue + HTTP/CLI tick (shared hosting) | `docs/SCHEDULER.md` |
| `Forms` | Form engine, submissions, builder `form` | `docs/FORMS.md` |
| `Automation` | Event → conditions → actions | `docs/AUTOMATION.md` |
| `Notifications` | In-app / email / telegram deliveries | `docs/NOTIFICATIONS.md` |
| `Newsletter` | Subscribers, campaigns, double opt-in | `docs/NEWSLETTER.md` |
| `Orders` | Carts / order lifecycle (bridges Payments) | `docs/ORDERS.md` |
| `Comments` | Comments, reviews, moderation | `docs/COMMENTS.md` |
| `Analytics` | First-party events + admin overview | `docs/ANALYTICS.md` |

Plugin SQL migrations live in `Modules/{Name}/migrations/`. CLI: `php migrate.php` (passes `modulesDir`).

## Future content types

Use soft-delete + slug columns on new tables. Follow `ProjectsModule` / `BlogModule` as templates. No schema redesign required for unrelated modules.
