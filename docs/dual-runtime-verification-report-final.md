# Dual-runtime verification report (deep parity progress)

**Date:** 2026-08-05  
**Stance:** Shape-green ≠ deep parity. This pass measures **scrubbed deep JSON** + exact error strings.

---

## Verdict

| Gate | Result | Evidence |
| --- | --- | --- |
| Auth probes (unauthenticated / invalid-token) | **YES** | auth_failed=0 on full suite |
| Envelope platform (`errors:[]`, lists as arrays, meta.api_version) | **YES** | Node `envelope.ts` + PHP `Response.php` |
| Access providers (+ purchase) / bootstrap caps expand | **mostly** | providers green; bootstrap catalog still 1 drift |
| Deep scrubbed suite (879 cases) | **NO** | **816/879** (63 fail) |
| FE dual smoke | **YES** | health / capabilities / site |
| Kernel unit tests | **YES** | 18/18 |
| Shared / VPS / live MySQL ops | **not re-run this pass** | — |

**Classification:** behavioral infra A−; **deep module payload parity still B+** (63 real drifts).

---

## What was fixed (root cause, not test carve-outs)

1. **Tightened harness** — `deep_json: true` for happy-get / missing-resource / public-mutate; removed “any 4xx = same error” carve-out.
2. **Node envelope = PHP** — `errors: []` (not null); list endpoints return `T[]` not `{items}`.
3. **PHP `Response::json`** — always merges `meta.api_version` even when caller supplies meta.
4. **Access** — sorted providers; **PurchaseAccessProvider** parity; bootstrap expands `*` → full permission catalog + version hash; catalog from `permissions` table; bootstrap no longer invents `providers`.
5. **Analytics overview** — PHP shape (`range/summary/daily/events/pages/goals`).
6. **MCP gate copy** — Russian PHP string.
7. **Error string alignment** (Node → PHP): User not found, Invalid target / comment target, Product not found, Form not found, Invalid email/token, Invalid refresh token, Invalid or expired 2FA challenge, contact form RU messages, demo Unauthorized, support FAQ «Некорректный запрос».
8. **SQL / SQLite** (prior) — COMMENT/UUID/IF transpile; runtime DATE_ADD/NOW/VERSION adapt.

Measured path: **143 → 63** deep fails on the same 879 cases.

---

## What remains (63) and why

| Cluster | Approx | Why not finished without new architecture work |
| --- | --- | --- |
| **system** happy-get | ~18 | `blocks` / `blueprints` / `events` / `dashboard` / `migrations` / `sdk` / `module-catalog` — Node stubs ≠ PHP `ModuleRegistry` aggregation |
| **translate / seo / ddos / overload / scheduler** | ~8 | Status payloads / provider lists incomplete on Node |
| **content / products / users / forms** | ~14 | Admin list field sets / export CSV bodies / page payloads |
| **payments / orders / support / mail / newsletter** | ~16 | Checkout offer copy, cart edge cases, ticket contact strings, export streams |
| **access bootstrap** | 1 | Catalog entry `source`/`label` nuance vs PHP runtime+DB merge |
| **error_msg** | ~5 | Remaining localized copies |

These need **handler implementation depth** (or shared contract objects), not more tests.

---

## Risks still open

1. Node FE admin may depend on `{items}` wrappers on a few endpoints still returning pagination objects (media/support intentionally keep `{items,total}` where PHP does).
2. Super-admin bootstrap now expands caps (no bare `*`) — matches PHP; any client assuming `*` must use `is_super` / catalog.
3. Deep suite is stricter than CI was overnight (shape). CI workflow still lists scenarios — confirm CI runs **deep** manifests after regenerate.
4. Shared Hosting ZIP / VPS package / live MySQL / SSH not re-proven this session.
5. Race conditions / CSRF / webhook HMAC deep paths not fully exercised by empty-body mutate cases.

---

## Path to maximum quality

1. Implement **Node ModuleRegistry mirrors** for blocks/blueprints/events/dashboard (same data as PHP registry) — closes most `system` fails.
2. Finish **per-module status/export** payloads (translate, ddos, newsletter export, orders export).
3. Align remaining **error strings** from the 5 error_msg fails (dump + match PHP).
4. Close **access bootstrap** catalog merge (runtime defaults + DB like PHP `AclCapabilityCatalog::list`).
5. Re-enable CI on deep manifests; add MySQL dual-seed job.
6. Re-run Shared build + VPS package + live PHP/Node smoke.
7. Security pass with evidence: upload jail, webhook HMAC, SSRF OutboundHttp, mass-assignment allowlists (verify tests exist / extend).

---

## Commands

```bash
BEHAVIOR_REQUIRE=all node scripts/behavior/run-all.mjs
# last measured: passed=816 failed=63 total=879 auth_failed=0
```
