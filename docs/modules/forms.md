# Forms

## Purpose

Own the system form engine: definitions, submissions, actions, builder widget `form`.

## How it works

**ZIP package** `forms` (`modules-src/forms/` · dual-runtime PHP + Node). Not a Core/`backend/src/Modules` owner.

Admin CRUD under `/admin/forms` and submissions; public `GET/POST /forms/{slug}` (+ submit). Actions may call mail, Telegram, webhooks, automation, newsletter — outbound HTTP via Platform HTTP / SSRF guard. Widget via package FE + `stableType` where applicable. SDK reference reimplementation (ZIP): `modules-src/forms-sdk-reference/` — see [sdk-certification.md](../sdk-certification.md).

## Execution flow

1. Admin creates form + fields/actions.
2. Builder places widget `form` with `form_slug`.
3. Public submit → validate → store submission → run actions → may dispatch `form.submitted`.

## Key components

- Package: `modules-src/forms/` (PHP `backend/FormsModule.php`, Node `backend/node/`)
- Tables: `forms`, `form_fields`, `form_versions`, `form_actions`, `form_submissions`, `form_submission_values`
- Host pages via `hostPageKey` / package FE loader
- Permissions: `forms.view`, `forms.manage`, `forms.submissions.*`, `forms.export`

## Related pages

- [../architecture/CURRENT.md](../architecture/CURRENT.md)
- [../package-lifecycle.md](../package-lifecycle.md)
- [../page-builder.md](../page-builder.md)

## Common mistakes

- Assuming Forms still lives under `backend/src/Modules/Forms/`.
- Using only legacy Mail `contact-form` widget when a system form is intended.
- Calling webhooks without SSRF-safe URLs.
