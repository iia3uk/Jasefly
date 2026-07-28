# Routing

## Purpose

Explain how API routes are registered, matched, and how 404 vs 405 are distinguished.

## How it works

Modules call `$router->get/post/…` during `ModuleRegistry::registerRoutes`. The same module routes are registered once per API prefix from config (`/api/v1` and `/api` by default). `Router::match` builds a regex from `{param}` segments, collects allowed methods for path matches, and returns 200 / 404 / 405. `dispatch` runs the middleware onion (global + route, first-registered first) then the handler.

`backend/routes/api_v1.php` is a monolithic registrar used by contract tests; it is **not** required by `public/index.php`. `backend/routes/api.php` is a legacy shim comment pointing at the registry.

## Execution flow

1. Module is on **or** `registersRoutesWhenDisabled() === true`.
2. `registerRoutes($router, $db, $app, $apiPrefix)` adds routes under that prefix.
3. Request path/method → `Router::match`:
   - no path match → 404
   - path match, wrong method → 405 + `Allow` header
   - match → params via `rawurldecode`
4. Middleware list = `array_merge(global, route)`; chain built with `array_reverse` so first-registered runs first.
5. Handler receives `Request` and path params; typically exits via `Response::json` / `Response::error`.

## Key components

| Component | Role |
| --- | --- |
| `App\Router` | Route table, match, dispatch |
| `ModuleRegistry::registerRoutes` | Aggregates module routes |
| Route middleware | Often `[AuthMiddleware, PermissionMiddleware]` + optional rate limit |

## Files involved

- `backend/src/Router.php`
- `backend/src/Request.php`, `backend/src/Response.php`
- `backend/src/Core/ModuleRegistry.php`
- `backend/public/index.php`
- `backend/routes/api_v1.php` (tests / legacy)
- `backend/tests/ApiRouteContractTest.php`

## Related pages

- [bootstrap-and-request.md](bootstrap-and-request.md)
- [authentication.md](authentication.md)
- [authorization.md](authorization.md)
- [plugin-gates.md](plugin-gates.md)

## Common mistakes

- Editing `api_v1.php` expecting production behavior to change.
- Registering a route only under one prefix while clients call the other.
- Relying on middleware order without checking `array_reverse` in `dispatch`.

## Extension points

- Add routes in a module’s `registerRoutes`.
- Keep soft-disabled APIs registered with `registersRoutesWhenDisabled()` + SoftPluginGate (see [plugin-gates.md](plugin-gates.md)).

## See also

- [module-system.md](module-system.md)
- [plugin-gates.md](plugin-gates.md)
- [testing.md](testing.md)
