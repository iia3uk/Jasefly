# Automation

## Purpose

Own rule-based automations (triggers → conditions → actions).

## How it works

`AutomationModule` (`automation`). No `eval`; recursion/max-steps guards; webhook actions use `SsrfGuard`. Integrates with events and scheduler for delayed work. Admin under automation screens; secrets redacted in UI.

## Execution flow

1. Trigger fires (event or schedule).
2. Condition engine evaluates.
3. Actions run (bounded steps); failures logged.

## Key components

- `backend/src/Modules/Automation/`
- `frontend/src/modules/automation/`
- Condition engine tests in `backend/tests/run.php` when present

## Files involved

- `backend/src/Modules/Automation/AutomationModule.php`
- `backend/src/Modules/Automation/migrations/`

## Related pages

- [events.md](../events.md)
- [modules/scheduler.md](scheduler.md)
- [security.md](../security.md)

## Common mistakes

- Outbound URLs to private IPs.
- Unbounded action chains — engine enforces max steps.

## Extension points

- Add actions inside the Automation module registries, not Core.

## See also

- [module-system.md](../module-system.md)
- [README.md](README.md)
