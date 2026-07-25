# Capability System

Modules declare needs/offers instead of hard-coding peer module slugs.

```json
"capabilities": {
  "requires": ["mail.send", "scheduler.jobs"],
  "provides": ["my-mod.widget"]
}
```

Runtime: `PlatformContext::capabilities()->has('mail.send')` / `require(...)`.

Providers live in `platform_capabilities` (migration `021_platform_sdk.sql`). Highest `priority` wins; override via `platform_capability_overrides`.
