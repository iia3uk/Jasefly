# Plugin gates (disabled behavior)

## Purpose

Describe what happens when a plugin is disabled on the API and in the SPA.

## How it works

There are two complementary mechanisms:

1. **Hard off (default):** `ModuleRegistry` does not call `registerRoutes` / does not treat the module as `all()` when `modules.is_enabled` is false (unless soft-route exception below). `boot()` is skipped.
2. **Soft HTTP gate (Design B):** Module returns `registersRoutesWhenDisabled() === true` and handlers call `SoftPluginGate::enforce`. Routes stay registered; responses degrade:
   - GET collection → `200` `{ data: [] }`
   - GET item → `404`
   - Mutations → `409` `code=plugin_disabled`

Proven soft use: `ProjectsModule`. Most modules use hard off.

Frontend does **not** import `SoftPluginGate`. It uses `pluginGates.ts` + `RequirePlugin` against `/site` → `enabled_plugins` from the public site payload.

## Execution flow

### Backend soft gate

1. Route still registered while plugin off.
2. Handler calls `SoftPluginGate::enforce($registry, $pluginName, $method, $isItem)`.
3. `decide` → `pass` | `empty_list` | `not_found` | `plugin_disabled` → JSON exit or continue.

### Frontend

1. `SiteProvider` loads site (includes `enabled_plugins`).
2. `RequirePlugin` / `siteHasPlugin` hide routes and widgets.
3. Maps: `ADMIN_RESOURCE_PLUGINS`, `PATH_PLUGIN_GATES`, `SLUG_PLUGIN_GATES` (aliases e.g. portfolio ↔ projects).
4. Builder widgets may declare `widgetRequiredPlugin`; public render skips when plugin off.

## Key components

| Component | Role |
| --- | --- |
| `SoftPluginGate` | Soft HTTP contract |
| `registersRoutesWhenDisabled` | Keep routes when off |
| `pluginGates.ts` | FE resource/path/slug maps |
| `RequirePlugin` | Route-level UI gate |
| `useApi` admin/public gates | Avoid calling disabled admin APIs |

## Files involved

- `backend/src/Support/SoftPluginGate.php`
- `backend/src/Modules/Projects/ProjectsModule.php`
- `backend/tests/ProjectsSoftApiTest.php`
- `frontend/src/core/pluginGates.ts`
- `frontend/src/components/RequirePlugin.tsx`
- `frontend/src/hooks/useApi.ts`

## Related pages

- [module-system.md](module-system.md)
- [routing.md](routing.md)
- [frontend-architecture.md](frontend-architecture.md)
- [page-builder.md](page-builder.md)

## Common mistakes

- Expecting SoftPluginGate to flip `modules.is_enabled` — it only shapes HTTP responses.
- Calling `/admin/projects` from FE when projects is off without gating (noisy 409/404).
- Treating `portfolio` and `projects` as unrelated — FE aliases them.

## Extension points

- Opt into Design B with `registersRoutesWhenDisabled` + SoftPluginGate in handlers.
- Add FE maps in `pluginGates.ts` when introducing a public path owned by a plugin.

## See also

- [glossary.md](glossary.md)
- [module-system.md](module-system.md)
- [frontend-architecture.md](frontend-architecture.md)
