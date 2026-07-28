# Page builder

## Purpose

Describe how page layouts are edited and rendered.

## How it works

Layouts are JSON trees: sections → columns → widgets. The editor is `PageBuilderPage`. Tree mutations go through `reduceLayout` in `tree.ts`. Render path (edit and public) is `LayoutRenderer`. Widget types register in `builder/registry.ts` via `initBuilderWidgets()` (not the no-op `ensureWidgetsRegistered` stub).

Public pages: `CmsPages.tsx` / `parseLayout.ts` — if a non-seed layout exists, render with `LayoutRenderer`; otherwise fall back to legacy React pages via `PreferCmsLayout`.

Widgets may declare a required plugin; public render checks `siteHasPlugin` / enable state (see [plugin-gates.md](plugin-gates.md)).

## Execution flow

### Editor

1. Load page + layout from admin API.
2. `initBuilderWidgets()` once: basic → structure → blocks → panels → landing → portfolio → commerce → auth → forms → newsletter → comments → bridge `getBlocks()` from module registry.
3. User selects nodes; inspector patches settings; save persists layout JSON (+ SEO / schedule fields in page settings).

### Public

1. Route resolves slug or hybrid PreferCmsLayout.
2. `parseLayout` → if usable layout → `LayoutRenderer` (no edit chrome).
3. Draft-on-live URL: backend `PublicController::page` can return draft for staff; FE may show a banner.

## Key components

| Piece | Path |
| --- | --- |
| Editor | `frontend/src/builder/editor/PageBuilderPage.tsx` |
| Tree ops | `frontend/src/builder/tree.ts`, `types.ts` |
| Render | `frontend/src/builder/render/LayoutRenderer.tsx` |
| Inline edit | `frontend/src/builder/edit/Editable.tsx` |
| Registry | `frontend/src/builder/registry.ts` |
| Widgets | `frontend/src/builder/widgets/*.tsx` |
| Public | `frontend/src/builder/public/CmsPages.tsx`, `parseLayout.ts` |
| Bind | `frontend/src/builder/bind/resolveBound.ts` |
| Widget freeze | `frontend/src/builder/manifest/widget-types.v1.json` |

## Files involved

As above; seed layouts: `frontend/src/builder/migrateHome.ts`. Backend page/layout storage via Content / page tables and revisions migrations (`005_page_layouts`, `006_page_revisions`).

## Related pages

- [frontend-architecture.md](frontend-architecture.md)
- [plugin-gates.md](plugin-gates.md)
- [contracts-and-governance.md](contracts-and-governance.md)

## Common mistakes

- Registering a widget only in one widgets file without calling its register from `initBuilderWidgets`.
- Removing a widget type from the freeze manifest without an intentional vitest update.
- Assuming `ensureWidgetsRegistered()` initializes widgets — use `initBuilderWidgets()`.

## Extension points

- Add a widget register function and call it from `initBuilderWidgets`.
- Package FE: `ctx.builder.registerWidget(...)`.
- Module `blocks()` metadata bridged into the registry.

## See also

- [frontend-architecture.md](frontend-architecture.md)
- [extension-points.md](extension-points.md)
- [../CMS_MAP.md](../CMS_MAP.md) (builder symptom → file table)
