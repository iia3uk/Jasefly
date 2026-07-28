# Bootstrap and request lifecycle

## Purpose

Describe what happens from an HTTP hit on the API to a route handler.

## How it works

The front controller is `backend/public/index.php` (on hosting: `public_html/api/public/index.php`). It registers fatal/JSON error handlers, calls `Bootstrap::init()`, builds a `Router`, registers middleware and module routes, then dispatches the request. OPTIONS is handled before dispatch for CORS.

## Execution flow

1. `set_exception_handler` / `set_error_handler` / `register_shutdown_function` → `portfolio_json_error()` (log + `ErrorReportService::store`).
2. `require Bootstrap.php` → `Bootstrap::init()`:
   1. `registerAutoload()` — `App\*` → `src/`, modules, `PackageModules` → `api/modules/{slug}/backend/`
   2. `EnvFile::load(config/.env)` (does not override OS env)
   3. Load `config/app.php`, `config/database.php`
   4. `date_default_timezone_set`, hide display_errors
   5. `Database::get` + MySQL `SET time_zone` from app timezone
   6. `Container` ← `app`, `db`
   7. `new ModuleRegistry` → put `EventDispatcher` on container
   8. `discover()` → `InstalledModuleLoader::loadEnabled()` → `boot()`
   9. Return `[$app, $db, $registry]`
3. Guard: empty `jwt_secret` → 503.
4. `Router` + global middleware: `CorsMiddleware`, `SecurityHeadersMiddleware`, then each callable from `$registry->globalMiddleware()`.
5. For each prefix in `app.api.versions` (default `/api/v1`, `/api`): `$registry->registerRoutes($router, $prefix)`.
6. `Request::fromGlobals()`.
7. If OPTIONS → `CorsMiddleware` alone → 204.
8. Else `$router->dispatch($req)` — see [routing.md](routing.md).

## Key components

| Component | Role |
| --- | --- |
| `Bootstrap` | Autoload, config, DB, registry lifecycle |
| `ModuleRegistry` | Discover / boot / routes |
| `InstalledModuleLoader` | Load enabled ZIP packages into the registry |
| `Container` | Service locator (`app`, `db`, events, registry) |
| `Router` | Match + middleware onion |

## Files involved

- `backend/public/index.php`
- `backend/router.php` (PHP built-in server → index)
- `backend/src/Bootstrap.php`
- `backend/src/Support/EnvFile.php`
- `backend/config/app.php`, `backend/config/database.php`
- `backend/src/Database.php`
- `backend/src/Core/Container.php`
- `backend/src/Core/ModuleRegistry.php`
- `backend/src/Services/Modules/InstalledModuleLoader.php`

## Related pages

- [routing.md](routing.md)
- [module-system.md](module-system.md)
- [diagnostics.md](diagnostics.md)

## Common mistakes

- Expecting Composer autoload — custom SPL only.
- Assuming `routes/api_v1.php` runs on every request — live path uses the registry only.
- Omitting `jwt_secret` / `config.local.php` and wondering why API returns 503.

## Extension points

- Contribute global middleware via `ModuleInterface::globalMiddleware()`.
- Register routes in `ModuleInterface::registerRoutes()`.

## See also

- [routing.md](routing.md)
- [ownership-boundaries.md](ownership-boundaries.md)
- [cli.md](cli.md)
