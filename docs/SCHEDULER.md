# Scheduler / Background Jobs

Shared-hosting job queue for Jasefly CMS.

## Purpose

Run delayed and background work without a long-lived daemon: newsletter batches, automation delays, notification retries, cleanup.

## Dependencies

- Requires: `system`
- Default: enabled

## Tables

- `scheduled_jobs`, `job_attempts`, `cron_schedules`, `scheduler_meta`

## Running ticks

```bash
php backend/bin/scheduler.php run --limit=20
```

HTTP (token from plugin settings):

```http
POST /api/v1/system/scheduler/tick
X-Scheduler-Token: <tick_token>
```

Admin dashboard also runs a **lazy tick** (few jobs) if the last tick is older than N minutes.

## Permissions

- `scheduler.view`
- `scheduler.manage`

## Admin

`/admin/scheduler` — jobs, queue stats, cron health, retry/cancel, manual tick.

## Events

`scheduler.job.created|started|completed|failed|cancelled`

## Extending

```php
\App\Modules\Scheduler\JobHandlerRegistry::register('my.job', function (array $payload) { ... });
(new \App\Modules\Scheduler\JobQueue($db))->push('my.job', ['x' => 1]);
```
