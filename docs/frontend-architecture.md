# Frontend architecture

## Purpose

Explain how the React SPA boots, routes, authenticates, and loads modules.

## How it works

Entry: `frontend/src/main.tsx`. Side-effect imports of `frontend/src/modules/*` call `registerModule` into `moduleRegistry`. Then `loadPackageModules()` fetches runtime ZIP FE assets. React tree: Helmet → QueryClient → Auth → AdminLocale → Site → BrowserRouter → AppRouter.

Two FE module systems coexist: compile-time modules under `frontend/src/modules/` and runtime ESM under `/modules/{slug}/` (see [package-lifecycle.md](package-lifecycle.md)).

## Execution flow

### Boot

1. Import bundled FE modules (self-register).
2. `void loadPackageModules()`.
3. Mount providers + `AppRouter`.

### Route match order (`AppRouter`)

1. `/{adminBase}/login` — `RedirectIfAuthed` + `LoginPage`.
2. `/{adminBase}` — `RequireAuth` → builder `pages/:id/builder` **or** `AdminShell` + `AdminScreenResolver`.
3. If custom admin base: `/admin/*` → 404 via SiteLayout (no leak).
4. `/lab/:slug` — outside SiteLayout (`LabPublicPage`).
5. Public: `MaintenanceGate` → `SiteLayout` → home, gated plugin paths, `PreferCmsLayout` hybrids, package public routes, `/:slug` (`CmsSlugPage` + `SLUG_PLUGIN_GATES`), `*`.

Admin base path comes from site settings (`adminBasePath.ts`).

### API + silent refresh

1. `api.ts` `request()` sends `Authorization: Bearer` from `localStorage.access_token`.
2. On 401 for `/admin` paths (not auth endpoints, not already retried): single-flight `POST /auth/refresh`.
3. Retry once with `_retried`.
4. Failure → `AUTH_SESSION_EXPIRED_EVENT` → AuthContext clears → redirect login.

AuthContext stores login/2FA tokens; it does not refresh.

### Plugin UI gating

See [plugin-gates.md](plugin-gates.md). Site payload `enabled_plugins` drives `RequirePlugin` / `siteHasPlugin`.

## Key components

| Piece | Path |
| --- | --- |
| Entry | `frontend/src/main.tsx` |
| Router | `frontend/src/routes/AppRouter.tsx` |
| Site shell | `frontend/src/components/layout/SiteLayout.tsx` |
| Admin | `frontend/src/admin/AdminApp.tsx`, `adminRoutes.tsx` |
| Module registry | `frontend/src/core/moduleRegistry.ts` |
| Package FE loader | `frontend/src/core/packageModuleLoader.ts` |
| API | `frontend/src/lib/api.ts`, `hooks/useApi.ts` |
| Auth | `frontend/src/context/AuthContext.tsx` |
| Site | `frontend/src/context/SiteContext.tsx` |

## Files involved

Listed above; also `frontend/src/pages/PublicPages.tsx`, `frontend/src/platform/`.

## Related pages

- [page-builder.md](page-builder.md)
- [plugin-gates.md](plugin-gates.md)
- [authentication.md](authentication.md)
- [package-lifecycle.md](package-lifecycle.md)

## Common mistakes

- Adding a public path without `PATH_PLUGIN_GATES` / `RequirePlugin` when owned by a plugin.
- Expecting AuthContext to refresh tokens.
- Editing `shared/` for domain UI instead of `modules/{name}/`.

## Extension points

- `registerModule` from a bundled FE module.
- Package FE `register(ctx)` via Platform FE context.
- Admin screens via module manifests / `getAdminScreens()`.

## See also

- [page-builder.md](page-builder.md)
- [extension-points.md](extension-points.md)
- [module-system.md](module-system.md)
