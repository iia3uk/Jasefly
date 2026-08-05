# Dual-runtime parity progress (AUTO)

**Generated:** 2026-08-04T23:03:58.309Z  
**Do not edit status by hand.** Source: behavior-runner → `module-status.mjs`.  
**done modules:** 28/28 (auth-green-only: 0)  
**behavior cases (last run):** pass=879 fail=0 total=879  
**verdict A ready (modules):** YES

| Module | Manifests | Auth pass/fail | Deep pass/fail | Status |
| --- | ---: | --- | --- | --- |
| access | 8 | 12/0 | 5/0 | **done** |
| analytics | 6 | 10/0 | 3/0 | **done** |
| automation | 8 | 16/0 | 3/0 | **done** |
| blog | 8 | 12/0 | 4/0 | **done** |
| comments | 5 | 6/0 | 3/0 | **done** |
| content | 82 | 134/0 | 41/0 | **done** |
| ddos | 5 | 10/0 | 2/0 | **done** |
| demo | 5 | 4/0 | 4/0 | **done** |
| forms | 14 | 24/0 | 8/0 | **done** |
| lab | 14 | 26/0 | 5/0 | **done** |
| mail | 5 | 4/0 | 3/0 | **done** |
| media | 14 | 26/0 | 5/0 | **done** |
| module-manager | 23 | 44/0 | 12/0 | **done** |
| newsletter | 20 | 34/0 | 7/0 | **done** |
| notifications | 9 | 18/0 | 3/0 | **done** |
| orders | 8 | 8/0 | 5/0 | **done** |
| overload | 3 | 6/0 | 1/0 | **done** |
| payments | 16 | 20/0 | 10/0 | **done** |
| products | 11 | 14/0 | 7/0 | **done** |
| projects | 12 | 24/0 | 4/0 | **done** |
| registration | 6 | 0/0 | 6/0 | **done** |
| scheduler | 6 | 10/0 | 3/0 | **done** |
| seo | 8 | 16/0 | 3/0 | **done** |
| support | 22 | 22/0 | 14/0 | **done** |
| system | 74 | 134/0 | 42/0 | **done** |
| translate | 5 | 6/0 | 3/0 | **done** |
| users | 9 | 18/0 | 5/0 | **done** |
| webhooks | 5 | 8/0 | 2/0 | **done** |
| portfolio | 0 | 0/0 | 0/0 | **n/a** |
| template | 0 | 0/0 | 0/0 | **n/a** |

## Rules

- `done` only when manifests>0, fail=0, and **deep** scenarios (happy-get / missing-resource / …) passed
- Auth-only CI gate leaves modules `partial` even if auth_fail=0
- `n/a` = no HTTP baseline surface (portfolio/template)
