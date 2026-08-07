# Security

## Purpose

List security controls that exist in this codebase (not a marketing checklist).

## How it works

### Application controls (implemented)

| Control | Where |
| --- | --- |
| Prepared SQL | `Database` helpers |
| Password hashing | `App\Utils\Password` (Argon2id / `PASSWORD_DEFAULT`, rehash on login) |
| JWT + refresh rotation | `Jwt`, `AuthController::refresh` |
| 2FA TOTP | `TotpService`, `/auth/2fa/*`; staff without TOTP → `totp_recommended` on `/auth/me` |
| Auth + RBAC | `AuthMiddleware`, `PermissionMiddleware`, `PermissionService` |
| Activity ACL | `GET /admin/activity` requires `activity.view`; MCP feed needs `mcp.manage` / `system.manage` |
| MCP dual-secret (Bearer + HMAC) | `McpRequestAuth` + `AuthMiddleware`; `MCP_API_TOKEN` + `MCP_SIGNING_SECRET`; modes `legacy`/`prefer`/`require`; anti-replay `mcp_nonces` / file fallback; optional `MCP_ALLOWED_IPS` |
| Telegram deploy approve (opt-in) | `TELEGRAM_DEPLOY_APPROVE=1` + bot/chat/webhook secret **only in** `api/config/.env`; pending ZIP → Telegram inline Approve; webhook `secret_token` + chat allowlist; admin escape hatch `/admin/updates/pending/{id}/approve` |
| MCP status | `SystemHealthService::mcpStatus` → `configured` / `signing_configured` / `auth_mode` / `ip_allowlist_enabled` (no secret fragments) |
| Rate limits | Login/demo: 5 / 15m fail-closed (`RateLimitMiddleware`); others fail-open if table missing; `SoftRateLimitMiddleware` |
| CSRF Origin | Global `OriginCheckMiddleware` in `public/index.php` (all modules); MCP Bearer exempt via `mcp_api_token` |
| CORS / security headers | `CorsMiddleware`, `SecurityHeadersMiddleware` (strips `X-Powered-By`) |
| Upload MIME allowlist | `MediaService` — **SVG uploads banned** (422); legacy SVG stream = attachment + CSP; uploads `.htaccess` no PHP |
| Package FE assets | `/modules/*` → `module-asset.php`; admin-only packs need staff cookie |
| Encrypted backups | `BackupService` (`.sql.enc`) |
| SSRF guard | `SsrfGuard` + `OutboundHttp` (Forms, Automation, Webhooks, …) |
| Secret redaction | `SecretRedactor` (scheduler/automation payloads) |
| Package install jail | Zip validation, path jail under `api/modules/`, checksums, optional signature |
| DDoS plugin | `DdosModule` global middleware when enabled |

Regression suite: `SecurityVerificationTest` + `PentestHardeningTest` inside `backend/tests/run.php`.

### Pentest hardening (2026-08) — closed / residual

| Finding | Status | Residual |
| --- | --- | --- |
| Activity ACL gap (editor sees global/MCP audit) | Closed | Grant `activity.view` only to roles that should see the log |
| SVG upload XSS | Closed (hard ban → 422 Unsupported; legacy stream attachment+CSP) | Existing SVG files on disk remain until deleted |
| Login rate limit missing 429 | Closed (5/900s, fail-closed + file fallback) | Distributed multi-IP brute force still needs WAF/captcha |
| MCP `token_hint` leak | Closed | — |
| MCP single Bearer = super_admin | Mitigated (dual-secret HMAC + anti-replay; `require` mode) | Leak of **both** secrets still critical; rotate pair + optional IP allowlist; capability scopes = phase 2 |
| CSRF Origin not checked | Closed (global Origin allowlist on mutating `/admin/*`) | No Origin + non-MCP Bearer/CLI intentionally allowed; SameSite=Lax remains browser control |
| Public admin module JS | Closed for known admin packs (`ai-content-optimizer`, `indexnow`) via gate | Other packs default public for public widgets; set `"public": false` in frontend-dist manifest |
| Editor without TOTP | Recommend (`totp_recommended` + admin banner) | Hard enforce / lockout not default (avoids locking prod editors) |
| `X-Powered-By` | Softened in API SecurityHeaders | nginx/PHP-FPM may still emit; host config out of app scope |

### Secrets locations

- `backend/config/.env`, `config.local.php`
- `mcp-cms/.env`
- Never commit; hosting package closes `api/config`, `api/src`, `api/storage` with `.htaccess`.

### Hosting (operator, outside app)

DB not public, app not root, HTTPS, remove `install.php` after install, WAF in front of origin, offsite backup of `storage/backups/*.sql.enc`.

## Execution flow

Not a single flow — controls apply at login, middleware, outbound HTTP, media upload, and package install. See [authentication.md](authentication.md), [authorization.md](authorization.md), [package-lifecycle.md](package-lifecycle.md).

## Key components

- `backend/src/Support/SsrfGuard.php`
- `backend/src/Support/OutboundHttp.php`
- `backend/src/Support/SecretRedactor.php`
- `backend/src/Support/McpRequestAuth.php`
- `backend/src/Middleware/*`
- `backend/tests/SecurityVerificationTest.php`
- `backend/tests/McpRequestAuthTest.php`

## Files involved

As above; root pointer [`../SECURITY.md`](../SECURITY.md).

## Related pages

- [authentication.md](authentication.md)
- [authorization.md](authorization.md)
- [package-lifecycle.md](package-lifecycle.md)
- [deployment.md](deployment.md)

## Common mistakes

- Logging tokens/passwords in automation/debug.
- Allowing private URLs in webhook/form actions without `SsrfGuard`.
- Leaving `install.php` and debug flags on production.

## Extension points

- Use `OutboundHttp` / `SsrfGuard` for any new outbound URL feature.
- Register package permissions explicitly; do not auto-grant dangerous slugs.

## See also

- [testing.md](testing.md)
- [recovery.md](recovery.md)
- [../SECURITY.md](../SECURITY.md)
