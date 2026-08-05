# Parity cases

JSON fixtures for `tests/parity/runner.mjs` — compare PHP (`PHP_BASE`) and Node (`NODE_BASE`) API envelopes.

## Coverage goals

| Case | Route | Parity | Notes |
| --- | --- | --- | --- |
| health | GET `/health` | yes | status, api_version |
| capabilities | GET `/capabilities` | no | runtime-specific baseline lists |
| site | GET `/site` | yes | enabled_plugins shape |
| login-invalid | POST `/auth/login` | yes | 401 invalid credentials |
| unknown-resource | GET `/admin/...` | yes | 401 without token |
| translate-batch | POST `/translate/batch` | yes* | cache-only miss → same source text; `provider` scrubbed |
| access-providers | GET `/access/providers` | no | PHP registers more providers than Node MVP |
| payments-config | GET `/payments/config` | no | acquirer/catalog fields differ by runtime |
| forms-unknown-slug | GET `/forms/:slug` | yes | 404 Not found |

\* Set `"parity": false` on a case to skip deep compare. Volatile fields are scrubbed in `scrub.mjs`.

## Adding cases

1. Add `NN-slug.json` with `id`, `method`, `path`, optional `body`/`headers`, `expect`, optional `parity: false`.
2. Run: `PHP_BASE=... NODE_BASE=... node tests/parity/runner.mjs`
3. Prove deep compare: `node tests/parity/prove-deep-compare.mjs`

Future: DB row compare via `tests/parity/db-harness.mjs` (`scrubRow`, `scrubRows`).
