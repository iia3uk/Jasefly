# Notifications

## Purpose

Own in-app / outbound notification delivery and retries.

## How it works

`NotificationsModule` (`notifications`). Works with scheduler for retries. Admin notifications UI; Platform exposes `notifications()` to packages.

## Execution flow

1. Producer creates a notification job/message.
2. Delivery attempt; failures may re-queue via scheduler.
3. Admin inspects / retries.

## Key components

- `backend/src/Modules/Notifications/`
- `frontend/src/modules/notifications/`

## Files involved

- `backend/src/Modules/Notifications/NotificationsModule.php`
- `backend/src/Modules/Notifications/migrations/`

## Related pages

- [modules/scheduler.md](scheduler.md)
- [platform-sdk.md](../platform-sdk.md)

## Common mistakes

- Bypassing the module to send mail ad hoc when notification retry semantics are required.

## Extension points

- Use Platform `notifications()` from ZIP packages.

## See also

- [module-system.md](../module-system.md)
- [README.md](README.md)
