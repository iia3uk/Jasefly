# Forms

System form engine (not only contact).

## Purpose

Build forms in admin, place widget `form` in Page Builder, collect submissions, run actions (email, Telegram, webhook, automation, newsletter subscribe).

## Dependencies

- Requires: `content`
- Suggests: `media`, `mail`, `webhooks`
- Default: enabled

## Tables

`forms`, `form_fields`, `form_versions`, `form_actions`, `form_submissions`, `form_submission_values`

## Public API

- `GET /api/v1/forms/{slug}`
- `POST /api/v1/forms/{slug}/submit`

## Admin API

- CRUD `/admin/forms`
- Submissions `/admin/form-submissions`
- CSV export `/admin/forms/{id}/export` (formula-safe)

## Permissions

`forms.view`, `forms.manage`, `forms.submissions.view`, `forms.submissions.manage`, `forms.export`

## Builder

Widget type `form` — settings: `form_slug`, layout, success message overrides.

Legacy `contact-form` (Mail) remains. System form slug `contact` mirrors submissions into `contact_messages` when present.

## Events

`form.created|updated|deleted`, `form.submitted`, `form.submission.status_changed|deleted`

## Security

Honeypot, timing check, IP/UA HMAC hashes, rate limit, backend validation + conditional visibility, webhook SSRF host checks.
