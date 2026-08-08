# SDK Scheduler Probe

Synthetic package proving Platform Scheduler API is generic:

- namespaced handlers (`{slug}.tick`, `{slug}.delayed`)
- cron upsert via `scheduleCron`
- delayed enqueue
- disable/uninstall hygiene via `PackageJobLifecycle`

No product features. Must not appear in Core slug maps.
