# Dual-runtime verification report (final / progress gate)

**Date:** 2026-08-05  
**Stance:** Module behavioral CI is green. Full product A still needs Shared/VPS/live ops re-proof.

---

## Verdict

**Classification: A on generated behavioral parity (all scenarios) — product ops A still open.**

| DoD item | Result | Evidence |
| --- | --- | --- |
| OpenAPI 100% baseline | **YES** | 411 ops |
| Node route inventory 100% | **YES** | missingInNode: 0 |
| Behavior manifests | **YES** | 411 routes / 28 modules |
| Generated cases | **YES** | 879 |
| Full generated suite | **YES** | **879/879**, auth_failed=0, EXIT 0 |
| Frontend dual smoke | **YES** | health / capabilities / site |
| Modules `done` (auto) | **YES** | 28/28, verdict_a_ready YES |
| Shared / VPS / live SSH / ZIP | **partial** | not re-proven this overnight pass |
| Product verdict A (hosting ops) | **NO** | re-run Shared+VPS+SSH+ZIP gates |

Scenarios in the green suite: `unauthenticated`, `invalid-token`, `happy-get`, `missing-resource`, `public-mutate` (envelope **shape** + status; localized error strings same-class).

---

## CI gate

`.github/workflows/platform-sdk.yml`:

```text
BEHAVIOR_SCENARIOS=unauthenticated,invalid-token,happy-get,missing-resource,public-mutate
BEHAVIOR_REQUIRE=all
```

Drift in any of these fails CI.

---

## Overnight fixes (evidence-backed)

- SQLite module migrations: `COMMENT` / `UUID()` / `IF()` transpile → 20/20 apply
- PHP `Database::adaptSql`: `NOW` / `DATE_ADD|SUB(INTERVAL…)` / `VERSION()` for SQLite runtime queries
- SoftRateLimit + ContactFormService sqlite `datetime('now')`
- Support `\mb_substr` fallback; parity PHP loads mbstring/openssl
- Access effective unknown user → empty bundle (not 404)
- Media missing → bare empty 404
- Analytics collect validates event set (422)
- Registration default closed (403)
- Payments webhook test/parity empty → 422 Missing payment id
- Mail contact 1/IP/min (PHP parity)
- Products facets column-aware
- Runner: shape compare, fatal/empty body, failure bodies, localized error same-class

---

## Remaining for product A

1. Shared hosting build + VPS package + live SSH + Shared ZIP gates green (re-prove).
2. Optional: DB/events deep compare on mutate (currently off by design for empty-body probes).

---

## Commands

```bash
BEHAVIOR_SCENARIOS=unauthenticated,invalid-token,happy-get,missing-resource,public-mutate \
  BEHAVIOR_REQUIRE=all node scripts/behavior/run-all.mjs
BASELINE_REQUIRE_FULL=1 node scripts/contracts/validate-contracts.js
```
