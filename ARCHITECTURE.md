# Architecture — Jasefly CMS

This repository is a **reusable modular CMS**. Sites are content + configuration on top of the framework.

## Layers

```
┌─────────────────────────────────────────────┐
│  Frontend modules (React)                   │
│  shared/ui · shared/admin · modules/*       │
│  platform/*  ← public FE SDK for ZIP packs  │
├─────────────────────────────────────────────┤
│  REST API /api/v1 (versioned)               │
├─────────────────────────────────────────────┤
│  Platform SDK (App\Platform\*)              │
│  PlatformContext · Capabilities · Compat    │
├─────────────────────────────────────────────┤
│  Module packages (PHP)                      │
│  Bundled: System · Forms · Scheduler · …    │
│  ZIP: App\PackageModules\* via Platform SDK │
├─────────────────────────────────────────────┤
│  Core (internal — not for ZIP modules)      │
│  Router · DB · JWT · ModuleRegistry · CRUD  │
│  EventDispatcher · JobHandlerRegistry       │
├─────────────────────────────────────────────┤
│  MySQL (normalized, FK, soft-delete ready)  │
└─────────────────────────────────────────────┘
```

Platform SDK docs: `docs/platform/PLATFORM-SDK.md`, `SDK-VERSIONING.md`, `SDK-CERTIFICATION.md`, `CAPABILITY-SYSTEM.md`, `COMPATIBILITY-LAYER.md`.

**SDK v1 is stable** (Forms reference certified). **SDK v2 is current.** Reference package: `modules-src/forms-sdk-reference/`.

Platform modules docs: `docs/FORMS.md`, `SCHEDULER.md`, `AUTOMATION.md`, `NOTIFICATIONS.md`, `NEWSLETTER.md`, `ORDERS.md`, `COMMENTS.md`, `ANALYTICS.md`.

## Backend modules

Location: `backend/src/Modules/{Name}/{Name}Module.php`

Auto-discovered by `ModuleRegistry`. Each package owns:

- Route registration
- Admin navigation contributions
- Resource metadata (table, soft-delete, sluggable)

Core never imports feature code. Features never patch the bootstrap.

**ZIP modules** live under `App\PackageModules\{Studly}\` and must use **only** `App\Platform\*` (see `docs/platform/MODULE-DEVELOPMENT.md`).

### Add Games / Courses / Marketplace later

Prefer a ZIP package (`modules-src/`) via Platform SDK. Bundled modules remain for platform core features.

See `backend/docs/MODULES.md`.

## Frontend modules

```
frontend/src/
  core/moduleRegistry.ts
  platform/           ← public SDK for package FE
  shared/ui/
  shared/admin/
  modules/projects/
  modules/blog/
  pages/
```

## API versioning

`config/app.php` → `api.versions`. Platform SDK generations: `App\Platform\SdkVersion` (CURRENT=2, SUPPORTED=[1,2], v1=stable).

## Configuration

| Source | Examples |
| --- | --- |
| Env / `config.local.php` | DB, JWT, CORS, disabled modules |
| `config/app.php` | pagination defaults, rate limits, API versions |
| Database | theme, SEO, content, permissions, platform_capabilities |

## Service layer

- Controllers: validate → call services → respond
- Package modules: `PlatformContext` facades only (never `new Mailer` / Core imports)
- `Core\Services\ResourceCrudService` — shared CRUD (internal)

## Long-term content types

Soft-delete + slug patterns already exist. New modules plug into trash, search, activity log, and RBAC by declaring resources / permissions.
