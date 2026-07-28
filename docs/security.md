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
| 2FA TOTP | `TotpService`, `/auth/2fa/*` |
| Auth + RBAC | `AuthMiddleware`, `PermissionMiddleware`, `PermissionService` |
| MCP bearer as super_admin | `AuthMiddleware` + `mcp_api_token` |
| Rate limits | `RateLimitMiddleware` (fail-open if table missing), `SoftRateLimitMiddleware` |
| CORS / security headers | `CorsMiddleware`, `SecurityHeadersMiddleware` |
| Upload MIME allowlist | `MediaService` (+ uploads `.htaccess` no PHP) |
| Encrypted backups | `BackupService` (`.sql.enc`) |
| SSRF guard | `SsrfGuard` + `OutboundHttp` (Forms, Automation, Webhooks, …) |
| Secret redaction | `SecretRedactor` (scheduler/automation payloads) |
| Package install jail | Zip validation, path jail under `api/modules/`, checksums, optional signature |
| DDoS plugin | `DdosModule` global middleware when enabled |

Regression suite: `SecurityVerificationTest` inside `backend/tests/run.php`.

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
- `backend/src/Middleware/*`
- `backend/tests/SecurityVerificationTest.php`

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
