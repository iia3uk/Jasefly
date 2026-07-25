# Migration Plan: Bundled Forms → SDK Package

**Status:** Plan only — **do not delete** bundled `Modules/Forms` until this plan is executed deliberately.

## Goal

Eventually offer Forms as an optional installable ZIP (like `forms-sdk-reference`) while keeping bundled Forms for existing sites until opt-in migration.

## Current state

| | Bundled Forms | forms-sdk-reference |
| --- | --- | --- |
| Location | `backend/src/Modules/Forms/` + `frontend/src/modules/forms/` | `modules-src/forms-sdk-reference/` |
| Distribution | Core release | ZIP module |
| Widget | `builder/widgets/forms.tsx` (plugin gate) | SDK builder widget in package FE |
| Data tables | Core migrations | `fsr_*` tables |

SDK v1 is **stable** and certified via `forms-sdk-reference`. Bundled Forms stays default for backward compatibility.

## Future migration steps (not implemented)

1. **Parity audit** — feature matrix: bundled vs SDK reference (conditional logic, CSV, webhooks, automation triggers)
2. **Data migration tool** — script to copy `forms_*` → `fsr_*` or unified schema with slug prefix
3. **Widget alias** — builder maps legacy `form` widget to SDK module when enabled
4. **Plugin gate** — `pluginGates.forms` redirects to package slug when installed
5. **Admin UX** — one-time banner: "Migrate to SDK Forms package"
6. **Deprecation window** — document bundled Forms as legacy; no removal before N releases
7. **Optional core slimming** — only after migration path tested on staging + production pilot

## What NOT to do now

- Do not remove `Modules/Forms` from core
- Do not change default widget behavior for existing sites
- Do not auto-install `forms-sdk-reference` on upgrade

## Reference implementation

Use `modules-src/forms-sdk-reference/` as the target architecture. Certify with:

```bash
php backend/bin/sdk.php certify modules-src/forms-sdk-reference
```

See: `FORMS-REFERENCE-MODULE.md`, `MODULE-FROM-PLUGINS.md`, `SDK-CERTIFICATION.md`.
