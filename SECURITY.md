# Security

## Purpose

Point to the implementation security doc and secret locations.

## How it works

Canonical detail: [`docs/security.md`](docs/security.md).

Secrets:

| Where | File |
| --- | --- |
| API | `backend/config/.env`, `config.local.php` |
| MCP | `mcp-cms/.env` |
| Hosting | `api/config/.env` |

Do not commit secrets. Do not put tokens in `mcp.json` or chat.

## Execution flow

See [`docs/authentication.md`](docs/authentication.md) and [`docs/authorization.md`](docs/authorization.md).

## Key components

See [`docs/security.md`](docs/security.md).

## Files involved

- `docs/security.md`
- `backend/tests/SecurityVerificationTest.php`
- `backend/tests/PentestHardeningTest.php`

## Pentest hardening note

Confirmed guest/editor/MCP findings closed in code: activity ACL, SVG sanitize/reject, login throttle, MCP `token_hint` removed, Origin CSRF check, admin-only module asset gate, staff 2FA recommend. MCP dual-secret HMAC (`McpRequestAuth`, modes legacy/prefer/require) raises the bar above a single Bearer. Details and residual risk: [`docs/security.md`](docs/security.md) § «Pentest hardening».

## Related pages

- [docs/security.md](docs/security.md)
- [docs/package-lifecycle.md](docs/package-lifecycle.md)
- [docs/deployment.md](docs/deployment.md)

## Common mistakes

- Treating this root file as the full checklist without reading `docs/security.md`.

## Extension points

Use `SsrfGuard` / `OutboundHttp` for new outbound HTTP.

## See also

- [docs/testing.md](docs/testing.md)
- [mcp-cms/README.md](mcp-cms/README.md)
