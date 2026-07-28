# Authentication

## Purpose

Describe login, JWT access/refresh, 2FA, cookies, and the MCP bearer token.

## How it works

`SystemModule` wires `AuthController` under each API prefix. Access tokens are HS256 JWTs (`App\Jwt`) with `type=access`. Refresh tokens are stored hashed in `refresh_tokens` and rotated on refresh. Optional TOTP uses `TotpService`. Machine automation can pass `mcp_api_token` as Bearer and is treated as `super_admin` (`auth=mcp_token`).

`AuthMiddleware` accepts either the MCP token or a decoded access JWT; other token types (refresh, 2fa_challenge) are rejected for protected routes.

## Execution flow

### Login

1. `POST /auth/login` (rate-limited).
2. Optional registration gate: `RegistrationService::blockLoginUntilVerified` when registration module is on.
3. Credentials OK → if 2FA enabled → challenge token; else `issueSession` (access + refresh + `AuthCookie` + activity `login`).

### Refresh

1. `POST /auth/refresh` with refresh token.
2. Lookup hash → revoke presented → insert new refresh → return new access (+ rotated refresh).
3. Frontend silent refresh: see [frontend-architecture.md](frontend-architecture.md).

### 2FA

- `POST /auth/2fa/verify` — complete challenge.
- Authenticated: `setup` / `enable` / `disable` under `/auth/2fa/*`.

### Protected request

1. `Authorization: Bearer …`
2. `AuthMiddleware` → `$r->user`
3. Then [authorization.md](authorization.md) middleware / controller checks.

## Key components

| Component | Role |
| --- | --- |
| `AuthController` | login, refresh, logout, me, 2FA |
| `Jwt` | encode/decode HS256, `exp` |
| `AuthMiddleware` | MCP token or access JWT |
| `TotpService` | TOTP secret / verify |
| `AuthCookie` | cookie name `portfolio_at` |

## Files involved

- `backend/src/Controllers/AuthController.php`
- `backend/src/Modules/System/SystemModule.php`
- `backend/src/Jwt.php`
- `backend/src/Middleware/AuthMiddleware.php`
- `backend/src/Services/TotpService.php`
- `backend/src/Support/AuthCookie.php`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/lib/api.ts`

## Related pages

- [authorization.md](authorization.md)
- [frontend-architecture.md](frontend-architecture.md)
- [security.md](security.md)

## Common mistakes

- Sending refresh token as Bearer to admin routes (`type` must be `access`).
- Expecting AuthContext to refresh tokens — refresh is in `api.ts` on 401.
- Committing `mcp_api_token` / `jwt_secret` into the repo.

## Extension points

- Registration module can block login until email verified.
- Do not add alternate auth schemes in Core without a module-owned route.

## See also

- [authorization.md](authorization.md)
- [bootstrap-and-request.md](bootstrap-and-request.md)
- [security.md](security.md)
