# Newsletter

## Purpose

Own mailing lists, campaigns, and subscribe/unsubscribe flows.

## How it works

`NewsletterModule` (`newsletter`). HMAC tokens for confirm/unsubscribe; double opt-in. Builder widget `newsletter-signup`. Batches may use scheduler. Admin under newsletter screens.

## Execution flow

1. Subscribe (widget or API) → confirm token flow.
2. Campaign send enqueues jobs.
3. Scheduler ticks process batches; unsubscribe via HMAC link.

## Key components

- `backend/src/Modules/Newsletter/`
- `frontend/src/modules/newsletter/`
- `frontend/src/builder/widgets/newsletter.tsx`

## Files involved

- `backend/src/Modules/Newsletter/NewsletterModule.php`
- `backend/src/Modules/Newsletter/migrations/`

## Related pages

- [modules/scheduler.md](scheduler.md)
- [page-builder.md](../page-builder.md)
- [security.md](../security.md)

## Common mistakes

- Skipping confirm tokens / treating unsubscribe links as guessable IDs.

## Extension points

- Forms action may subscribe contacts into lists.

## See also

- [modules/forms.md](forms.md)
- [README.md](README.md)
