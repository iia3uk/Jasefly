# Architecture — Jasefly CMS

This repository is a **reusable modular CMS**. Sites are content + configuration on top of the framework.

## Layers

```
┌─────────────────────────────────────────────┐
│  Frontend modules (React)                   │
│  shared/ui · shared/admin · modules/*       │
├─────────────────────────────────────────────┤
│  REST API /api/v1 (versioned)               │
├─────────────────────────────────────────────┤
│  Module packages (PHP)                      │
│  System · Content · Projects · Blog · Media │
├─────────────────────────────────────────────┤
│  Core                                       │
│  Router · DB · JWT · ModuleRegistry · CRUD  │
├─────────────────────────────────────────────┤
│  MySQL (normalized, FK, soft-delete ready)  │
└─────────────────────────────────────────────┘
```

## Backend modules

Location: `backend/src/Modules/{Name}/{Name}Module.php`

Auto-discovered by `ModuleRegistry`. Each package owns:

- Route registration
- Admin navigation contributions
- Resource metadata (table, soft-delete, sluggable)

Core never imports feature code. Features never patch the bootstrap.

### Add Games / Courses / Marketplace later

1. `backend/src/Modules/Games/GamesModule.php`
2. SQL migration for `games` (+ `deleted_at`, `slug`)
3. Controllers/Services under that folder
4. Frontend `frontend/src/modules/games/`
5. Done — no refactor of Projects/Blog/Core

See `backend/docs/MODULES.md`.

## Frontend modules

```
frontend/src/
  core/moduleRegistry.ts
  shared/ui/          ← Buttons, Cards, Grids, Modals, Timelines…
  shared/admin/       ← Tables, Forms, SaveBar, Dialogs…
  modules/projects/   ← Feature package
  modules/blog/
  pages/              ← Route composition (assembles modules)
```

Generic UI never contains page fetch logic. Modules own domain components.

## API versioning

`config/app.php`:

```php
'api' => ['versions' => ['/api/v1', '/api']],
```

Add `/api/v2` beside v1 without removing v1. Clients opt in.

## Configuration

| Source | Examples |
| --- | --- |
| Env / `config.local.php` | DB, JWT, CORS, disabled modules |
| `config/app.php` | pagination defaults, rate limits, API versions |
| Database | theme, SEO, content, permissions |

No magic numbers in controllers.

## Service layer

- Controllers: validate → call services → respond
- `Core\Services\ResourceCrudService` — shared CRUD
- Domain services: Media, Slug, SoftDelete, Search, Permissions…

## Long-term content types

Soft-delete + slug patterns already exist. New modules plug into trash, search, activity log, and RBAC by declaring resources / permissions.
