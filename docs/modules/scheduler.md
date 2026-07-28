# Scheduler

## Purpose

Own the shared-hosting job queue and cron schedules.

## How it works

`SchedulerModule` (`scheduler`). Tables: `scheduled_jobs`, `job_attempts`, `cron_schedules`, `scheduler_meta`. Tick via CLI `backend/bin/scheduler.php`, HTTP `POST …/system/scheduler/tick` with plugin tick token, or admin lazy tick. Handlers register in `JobHandlerRegistry`. Admin: `/admin/scheduler`.

## Execution flow

1. Producer enqueues a job (newsletter, automation delay, …).
2. Tick claims jobs up to limit.
3. Handler runs; attempts recorded; retries/cancel from admin.

## Key components

- `backend/src/Modules/Scheduler/`
- `backend/bin/scheduler.php`
- FE admin `frontend/src/admin/pages/SchedulerPage.tsx` (or module screen)
- Permissions: `scheduler.view`, `scheduler.manage`

## Files involved

- `backend/src/Modules/Scheduler/SchedulerModule.php`
- `backend/src/Modules/Scheduler/migrations/`

## Related pages

- [cli.md](../cli.md)
- [module-system.md](../module-system.md)
- [modules/automation.md](automation.md)

## Common mistakes

- Expecting a long-lived daemon — ticks are pull-based.
- Exposing tick endpoint without token.

## Extension points

- Register job handlers via the scheduler/jobs Platform or module registry APIs.

## See also

- [../security.md](../security.md)
- [README.md](README.md)
