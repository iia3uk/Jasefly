# Glossary

## Purpose

Define the terms this CMS uses in code and admin UI so Module, Plugin, and Package are not confused.

## How it works

Product language and class names overlap. The runtime has **one** `ModuleRegistry` of `ModuleInterface` instances. How those instances get onto disk and how enablement is stored differs.

| Term | Meaning in this codebase |
| --- | --- |
| **Bundled module** | PHP feature under `backend/src/Modules/{Name}/{Name}Module.php`, discovered by `ModuleRegistry::discover()`. |
| **Plugin** | Admin UI / table `modules` name for the same registry objects. Enable flag: `modules.is_enabled`. |
| **ZIP package / package module** | Installable ZIP under `api/modules/{slug}/`, namespace `App\PackageModules\*`, row in `installed_modules`. Adapted into the same registry via `PackageModuleAdapter`. |
| **SoftPluginGate** | HTTP soft-disable helper (`App\Support\SoftPluginGate`). Not a table. Used when routes stay registered while the plugin is off. |
| **Platform SDK** | Public API for ZIP packages: `App\Platform\*` (PHP) and `frontend/src/platform` (FE). Packages must not import `App\Core\*`. |
| **Capability** | Declared ability ID tracked by `CapabilityRegistry` / package `provides` / `requires`. |
| **Blueprint** | Declarative content-type metadata from `ModuleInterface::blueprints()` for CRUD / admin generation. |
| **Builder layout** | JSON tree (sections → columns → widgets) stored on pages; edited by Page Builder, rendered by `LayoutRenderer`. |
| **MCP** | Local Node MCP server (`mcp-cms/`) that builds, tests, deploys, and edits content via the API token. |

## Enable stores

| Store | Role |
| --- | --- |
| `modules.is_enabled` | Runtime projection read by `PluginStateService` / `ModuleRegistry` for **all** plugins. |
| `installed_modules.status` | **Canonical** lifecycle state for ZIP packages (`enabled`, `disabled`, `failed`, …). |
| `ModulePluginMirror` | Writes B from A for package-backed rows. Bundled plugins have no `installed_modules` row. |

## Execution flow

Not applicable — terminology reference.

## Key components

- `App\Core\Contract\ModuleInterface`
- `App\Core\ModuleRegistry`
- `App\Services\PluginStateService`
- `App\Services\Modules\ModulePluginMirror`
- `App\Support\SoftPluginGate`

## Files involved

- `backend/src/Core/Contract/ModuleInterface.php`
- `backend/src/Core/ModuleRegistry.php`
- `backend/src/Services/PluginStateService.php`
- `backend/src/Services/Modules/ModulePluginMirror.php`
- `backend/src/Support/SoftPluginGate.php`
- `backend/migrations/007_plugins.sql`, `020_installed_modules.sql`

## Related pages

- [module-system.md](module-system.md)
- [plugin-gates.md](plugin-gates.md)
- [package-lifecycle.md](package-lifecycle.md)

## Common mistakes

- Calling SoftPluginGate “the plugins table” — the table is `modules`.
- Treating `modules.is_enabled` as SoT for ZIP packages — SoT is `installed_modules.status`.
- Assuming `PluginInterface` exists — the contract is `ModuleInterface`.

## Extension points

None — use the terms above when adding docs or admin copy.

## See also

- [README.md](README.md)
- [ownership-boundaries.md](ownership-boundaries.md)
- [module-system.md](module-system.md)
