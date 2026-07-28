# Analytics

## Purpose

Own event/goal analytics and the public beacon.

## How it works

`AnalyticsModule` (`analytics`). Public beacon from `AnalyticsBeacon` in SiteLayout; hashing of visitor/session by default (no raw IP unless configured). Admin analytics screens.

## Execution flow

1. FE beacon posts events.
2. Module stores/aggregates.
3. Admin reads reports / goals.

## Key components

- `backend/src/Modules/Analytics/`
- `frontend/src/modules/analytics/` (beacon helpers)
- SiteLayout beacon mount

## Files involved

- `backend/src/Modules/Analytics/AnalyticsModule.php`
- `backend/src/Modules/Analytics/migrations/`

## Related pages

- [frontend-architecture.md](../frontend-architecture.md)
- [security.md](../security.md)

## Common mistakes

- Storing raw PII in event payloads when hashing is the default contract.

## Extension points

- Emit events via module/beacon APIs; packages use Platform where exposed.

## See also

- [README.md](README.md)
- [module-system.md](../module-system.md)
