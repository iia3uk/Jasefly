# Demo Sandbox

Isolated public Admin / Builder experience. **UI is not a security boundary.**

## Threat model

| Threat | Mitigation |
| --- | --- |
| Visitor reaches production admin | Separate `POST /auth/demo/start`; JWT `type=demo_access`; no shared password |
| UI-only deny | `DemoGuardMiddleware` fail-closed; unknown admin routes → `403 demo_restricted` |
| IDOR production IDs | Demo never calls production CRUD; overlays only |
| Fake super_admin | Demo is never `is_super`; caps from `DemoCapabilityPolicy` |
| Secret leakage | No production settings access + `DemoResponseSanitizer` / `SecretRedactor` |
| ZIP / SiteUpdater / MCP | Explicit deny in `DemoRoutePolicy` |
| Scope spoof (`site_id`) | Effective scope from `DemoContext` only |

## Architecture

- **Storage:** session overlay tables `demo_sessions` / `demo_overlays` (not multi-site DB).
- **Seed:** `backend/src/Modules/Demo/seed/*.json` copied into overlays on start/reset.
- **TTL:** sessions expire; cleanup removes overlays + `storage/demo/{sid}/`.
- **Entry:** short-lived demo JWT + HttpOnly `jasefly_demo` cookie. No production refresh token.

## Flow

1. Visitor → `POST /api/v1/auth/demo/start` (rate-limited).
2. Server creates session, seeds overlays, returns `access_token` (`type=demo_access`).
3. FE stores token, opens admin demo shell with **DEMO SANDBOX** banner.
4. Every API call: `AuthMiddleware` accepts `demo_access` → `DemoGuardMiddleware` sets `DemoContext` → route policy → sandbox gateway or 403.
5. `POST /auth/demo/reset` restores seed for current session only.
6. `POST /auth/demo/end` invalidates session.

## Capability policy

- High / critical risk capabilities denied by default on the **API**.
- FE demo shell opens the **full admin UI** (`can()` always true; `hydrateDemoPlugins`).
- Most admin GET → synthetic/empty **preview** via `DemoSandboxGateway` (never production tables).
- Overlay interactive: pages / builder / blog / media. Writes elsewhere → `403 demo_restricted`.
- Hard deny: migrations, content-pack, MCP.
- Never hardcode `role === demo_explorer` in domain services; check `DemoContextHolder`.

## Feature flag

Public “Open Admin Demo” links stay `coming_soon` until `site_settings.demo_sandbox_enabled` (or equivalent) is on **and** security tests pass.
