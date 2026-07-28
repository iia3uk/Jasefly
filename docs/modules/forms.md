# Forms

## Purpose

Own the system form engine: definitions, submissions, actions, builder widget `form`.

## How it works

Bundled module `FormsModule` (`name`: `forms`). Admin CRUD under `/admin/forms` and submissions; public `GET/POST /forms/{slug}` (+ submit). Actions may call mail, Telegram, webhooks, automation, newsletter — outbound HTTP via `OutboundHttp` / `SsrfGuard`. Widget: `builder/widgets/forms.tsx`. SDK reference reimplementation (ZIP): `modules-src/forms-sdk-reference/` — see [sdk-certification.md](../sdk-certification.md).

## Execution flow

1. Admin creates form + fields/actions.
2. Builder places widget `form` with `form_slug`.
3. Public submit → validate → store submission → run actions → may dispatch `form.submitted`.

## Key components

- `backend/src/Modules/Forms/`
- Tables: `forms`, `form_fields`, `form_versions`, `form_actions`, `form_submissions`, `form_submission_values`
- FE: `frontend/src/modules/forms/`
- Permissions: `forms.view`, `forms.manage`, `forms.submissions.*`, `forms.export`

## Files involved

- `backend/src/Modules/Forms/FormsModule.php`
- `backend/src/Modules/Forms/migrations/`
- `frontend/src/builder/widgets/forms.tsx`

## Related pages

- [module-system.md](../module-system.md)
- [page-builder.md](../page-builder.md)
- [security.md](../security.md)

## Common mistakes

- Using only legacy Mail `contact-form` widget when a system form is intended.
- Calling webhooks without SSRF-safe URLs.

## Extension points

- Form actions registry inside the module; do not patch Core.
- ZIP Forms reference for SDK-only packaging.

## See also

- [../events.md](../events.md)
- [../sdk-certification.md](../sdk-certification.md)
- [README.md](README.md)
