# Events and hooks

## Purpose

Explain the in-process `EventDispatcher` versus ZIP install lifecycle hooks.

## How it works

### Runtime events (`EventDispatcher`)

Created inside `ModuleRegistry`. During `boot()`, each enabled module’s `hooks()` entries are subscribed. Modules may also `$events->subscribe(...)` imperatively in `boot()`. Dispatch is synchronous, priority-ordered; a throwing subscriber is logged and skipped. Filter-style: last non-null return replaces the payload.

Core events (docblock + `events-core.v1.json`): include `module.boot`, `pages.seeded`, `plugin.enabled` / `plugin.disabled`, `migration.after`, `resource.beforeSave|afterSave|beforeDelete|afterDelete`, `page.afterPublish`, `form.submitted`, and related. Generic CRUD in `AdminController` publishes resource before/after save/delete.

ZIP packages publish/subscribe via `PlatformEventsInterface` (`EventsAdapter`) — **same** dispatcher, not a second bus.

### Install hooks (`ModuleHookRunner`)

Separate from EventDispatcher. Declared in `module.json` (`hooks.before_install`, `after_enable`, …) and implemented as package hook classes. Run only during package lifecycle transitions. See [package-lifecycle.md](package-lifecycle.md).

## Execution flow

1. Registry constructs `EventDispatcher`.
2. Enabled module `boot` → `wireHooks` from `hooks()`.
3. Publishers (`AdminController`, modules, System toggle) call `dispatch($name, $payload)`.
4. Subscribers run in priority order; payload may be mutated for filters.

## Key components

| Component | Role |
| --- | --- |
| `EventDispatcher` | subscribe / dispatch |
| `ModuleInterface::hooks()` | Declarative subscriptions |
| `ModuleHookRunner` | ZIP install-time hooks |
| `PlatformEventsInterface` | SDK wrapper for packages |

## Files involved

- `backend/src/Core/EventDispatcher.php`
- `backend/src/Core/ModuleRegistry.php` (`wireHooks`)
- `backend/src/Controllers/AdminController.php`
- `backend/src/Platform/Manifest/events-core.v1.json`
- `backend/src/Platform/Adapters/EventsAdapter.php`
- Package hook interface under `backend/src/Platform/Package/`

## Related pages

- [module-system.md](module-system.md)
- [package-lifecycle.md](package-lifecycle.md)
- [contracts-and-governance.md](contracts-and-governance.md)

## Common mistakes

- Expecting install hooks to fire on every HTTP request.
- Assuming a failed subscriber aborts the publisher — it does not.
- Removing a core event name without updating `events-core.v1.json`.

## Extension points

- Return `[event, handler, priority?]` from `hooks()` or subscribe in `boot()`.
- For packages: `$ctx->events()->subscribe/publish` and/or `module.json` lifecycle hooks.

## See also

- [module-system.md](module-system.md)
- [package-lifecycle.md](package-lifecycle.md)
- [contracts-and-governance.md](contracts-and-governance.md)
