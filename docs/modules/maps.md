# Maps

## Purpose

Optional ZIP package for interactive maps on any Jasefly site: builder widget, public React-like API via Platform SDK `ctx.ui`, provider adapters (OSM first), external directions, SSR-safe fallback.

## How it works

Package slug `maps` (`modules-src/maps/`). Backend: settings + public config. Frontend ESM loads Leaflet lazily from `/modules/maps/assets/`. Builder type: `maps.map`. Demo route: `/maps-demo`. Admin: `/admin/maps`.

## Execution flow

1. Install/enable ZIP → migrations create `maps_settings`.
2. FE `register(ctx)` → widget + admin + public demo route.
3. Page places `maps.map` (or code calls `createMapsApi(ui).Map`).
4. On mount: load adapter → Leaflet assets → create map → markers/events.
5. On error/SSR: `MapFallback` with address + «Построить маршрут».
6. Unmount: adapter `destroy` removes Leaflet map and listeners.

## Key components

- `backend/MapsModule.php`, `MapsService.php`
- `frontend-dist/index.js` + `maps-core.js`
- Adapter: `osm` (Leaflet + OSM tiles)
- Permissions: `maps.view`, `maps.manage`

## Files involved

- `modules-src/maps/`
- Public assets under `/modules/maps/` after install

## Related pages

- [package-lifecycle.md](../package-lifecycle.md)
- [platform-sdk.md](../platform-sdk.md)
- [page-builder.md](../page-builder.md)

## Common mistakes

- Expecting Leaflet in core `frontend/package.json` — it is vendored in the package.
- Using package widget type `map` without namespace — host registers as `maps.map`.
- Putting secrets in public `/maps/config` — API key stays admin-only.

## Extension points

- Register another `MapProviderAdapter` (Google / Yandex / Mapbox) without changing `Map` props.
- Future: geocoding, in-map routing, clusters — not in v1.

## See also

- Package README: `modules-src/maps/README.md`
- Examples: `modules-src/maps/docs/examples.md`
