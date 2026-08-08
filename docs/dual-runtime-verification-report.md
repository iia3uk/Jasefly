> **Historical verification record (2026-08-04).**  
> Do not use as current readiness claim. See [`architecture/CURRENT.md`](architecture/CURRENT.md) · [`architecture/LLM_CONTEXT.md`](architecture/LLM_CONTEXT.md).

# Dual-runtime verification report

**Date:** 2026-08-04  
**Auditor stance:** adversarial — journal `docs/dual-runtime-progress.md` and Phase 1–7 “done” statuses treated as unproven until falsified or confirmed by code + reproducible tests.  
**Scope:** Shared Hosting (PHP) + VPS (Node/TS claimed without PHP).

---

## 1. Verdict

**Classification: C (architectural scaffold / PoC) leaning B (working Node kernel with partial modules).**

**Not A.** There is no production dual-runtime with baseline parity.

Falsified claims from the journal:

| Claim | Result |
| --- | --- |
| Phase 1–7 done | **False** — contracts SoT unenforced; modules mostly stubs; deploy incomplete; OpenAPI ~3% of PHP surface |
| 30 Node modules implemented | **False** — 30 *registered*; ≥4 empty; many identity/list-only |
| VPS Node without PHP | **False (pre-fix)** — migrate preferred `php` SqlTranspiler; without PHP, SQLite migrate failed on `002_enterprise.sql` |
| Parity harness proves equivalence | **False** — 5 smoke cases; data divergence accepted if status/success/error match |
| Contracts are SoT | **False as enforcement** — copies + soft validate; empty permissions still “OK” |

---

## 2. Inventory of changes (dual-runtime worktree)

### New trees / significant files

| Path | Role |
| --- | --- |
| `contracts/` | Intended SoT: OpenAPI slice, permissions/events/capabilities/errors/resources, migration SQL copies, module manifests, MCP/builder snapshots, 1 blueprint |
| `runtime-node/` | Node/Hono API runtime (auth, AdminCrud, migrate, 30 module files) |
| `tests/parity/` | Smoke parity runner + 5 JSON cases |
| `scripts/contracts/` | `validate-contracts.js`, `sync-from-contracts.js` |
| `scripts/gen-node-modules.py` | Generator that produced thin module shells |
| `scripts/audit-count-routes.py` | Audit helper (route counts) |
| `mcp-cms/src/deploy/vps.js` | VPS artifact build + SSH “atomic” deploy/rollback |
| `docs/dual-runtime*.md` | Architecture / product / progress docs |

### Modified (existing platform)

| Path | Role |
| --- | --- |
| `backend/.../SystemModule.php` | `GET /capabilities` |
| `scripts/build-hosting.js` | Capability gate for shared ZIP |
| `mcp-cms/src/index.js`, `local.js`, `sites.js` | Dual build/deploy tools, site runtime fields |
| `mcp-cms/manifest/mcp-tools.v1.json` | New tool names |
| `CMS_MAP.md`, `INSTALL.md`, `docs/README.md` | Navigation / install notes |
| `.gitignore`, `mcp-cms/.env.example` | Ignore + env docs |

### Deleted

None observed for dual-runtime (no removal of PHP production path).

### New dependencies (`runtime-node/package.json`)

hono, @hono/node-server, jose, argon2, bcryptjs, better-sqlite3, mysql2, pg, zod, yaml, dotenv, otplib (+ TS/vitest/tsx dev).

### New build / MCP commands

- `runtime-node`: `dev`, `build`, `start`, `migrate`, `test`, `typecheck`
- MCP: `cms_local_build(target)`, `cms_vps_build`, `cms_shared_build`, `cms_rollback` (per manifest/index)
- Shared still: `scripts/build-hosting.js`

### New env vars (documented / used)

`RUNTIME`, `DB_*`, JWT secrets, `SCHEDULER_TOKEN`, `PHP_BIN` / (post-fix) `JASEFLY_USE_PHP_TRANSPILER`, VPS site: `SSH_HOST`, `SSH_USER`, `SSH_KEY_PATH`, `DEPLOY_PATH`, `HEALTHCHECK_URL`, `RESTART_COMMAND`.

### Runtime contracts

OpenAPI `contracts/openapi/jasefly.v1.yaml` (**10 paths**), capabilities, permissions/events JSON, admin-resources, errors envelope, migrations index, module manifests, platform api-snapshot / services.

### Structure snapshots

**`contracts/`:** openapi, permissions, events, capabilities, errors, resources, migrations (001–027 + index), modules (*.manifest.json ×30), mcp, builder, platform, blueprints (1), schema (**empty**).

**`runtime-node/`:** `src/{app,auth,cli,core,crud,db,http,modules,platform}`, vitest, systemd unit, `.env.example`.

**`tests/parity/`:** `runner.mjs` + cases `01`–`05`.

**MCP adapters:** `mcp-cms/src/deploy/vps.js` (+ hooks in `index.js` / `local.js`).

**Capability system:** `contracts/capabilities` → Node `platform/capabilities.ts` + PHP SystemModule + shared build gate.

**Generated artifacts:** mostly **manual copies** via sync script; OpenAPI not generating PHP/Node routers; `contracts/schema/` unused; FE `sitePulse.json` unrelated churn.

### Route surface evidence

```
openapi_paths                 10
php_router_calls_approx       325
node_app_route_calls_approx   138
```

Method: `scripts/audit-count-routes.py`.

---

## 3. Stub / formal-implementation scan

| File | Line | Problem | Severity | Blocks parity? |
| --- | --- | --- | --- | --- |
| `runtime-node/src/db/sqlTranspile.ts` | 8–20, 23–54 | Prefers `spawnSync(php)` SqlTranspiler; JS fallback broken on `ADD COLUMN …, ADD INDEX` → Node SQLite migrate **fails without PHP** | **Critical** | Yes (independence + install) |
| `docs/dual-runtime-progress.md` | 8–13 | Claims Phase 1–7 / 30 modules done | High (docs fraud risk) | Yes (false readiness) |
| `runtime-node/src/modules/portfolio.ts` | 3 | Empty `register` | High | Yes |
| `runtime-node/src/modules/projects.ts` | 3 | Empty `register` | High | Yes |
| `runtime-node/src/modules/webhooks.ts` | 3 | Empty `register` | High | Yes |
| `runtime-node/src/modules/template.ts` | 3 | Empty `register` | High | Yes |
| `runtime-node/src/modules/translate.ts` | 10–13 | Identity map; `provider: 'identity'` | High | Yes |
| `runtime-node/src/modules/payments.ts` | 7–20 | Naive order insert; webhook accepts any body, no HMAC | **Critical** (security + parity) | Yes |
| `runtime-node/src/modules/module-manager.ts` | 13–15 | Health always `{ ok: true }`; no ZIP lifecycle | High | Yes |
| `runtime-node/src/modules/scheduler.ts` | 9–16 | Marks jobs `completed` with no handler execution | High | Yes |
| `runtime-node/src/modules/access.ts` | 7–20 | Partial rule eval; bootstrap `capabilities: []`; admin route unauthenticated | High | Yes |
| `runtime-node/src/app.ts` | 85–111 | Admin CRUD: `requireAuth` only — no permission/capability checks | **Critical** | Yes |
| `runtime-node/src/crud/AdminCrud.ts` | 59–60 | HTML “sanitizer parity later” — stores raw | High | Partial |
| `mcp-cms/src/deploy/vps.js` | 190–192 | Returns `ok: true` **without** performing healthcheck; no auto-rollback | **Critical** | Ops |
| `mcp-cms/src/deploy/vps.js` | 165–186 | SSH remote commands via string interpolation | High | Ops/security |
| `tests/parity/runner.mjs` | 118–127 | On JSON mismatch, only compares status/success/error — **data divergence ignored** | **Critical** | Yes |
| `scripts/contracts/validate-contracts.js` | 34–35 | Empty `permissions: []` still validates OK (proven) | **Critical** | SoT |
| `contracts/schema/` | — | Empty; no runtime JSON Schema validation | High | Contracts |
| `contracts/openapi/jasefly.v1.yaml` | — | ~10 paths vs ~325 PHP routes | High | Coverage |
| Silent `.catch(() => [])` / `undefined` | many modules | Hides DB/schema errors as empty success | Medium–High | Yes |
| Vitest | 6 tests | Kernel smoke; no module behavioral parity | High | Testing |
| Parity cases | 5 | Smoke only; no DB/events/lifecycle | High | Testing |

Pre-fix proof: with `php` removed from `PATH`, `npm test` in `runtime-node` failed on migration `002_enterprise.sql` (`ADD COLUMN INDEX`). With PHP restored, 6/6 passed — **production default path depended on PHP binary**.

---

## 4. PHP independence of Node runtime

| Check | Result |
| --- | --- |
| package.json deps | No PHP packages (OK) |
| migrate runner | **Calls PHP** via `sqlTranspile.ts` when available |
| JS fallback completeness | **Insufficient** for enterprise migrations on SQLite |
| MCP VPS artifact | Copies `runtime-node` + frontend dist + contracts — no PHP tree required in tarball |
| Runtime business logic | Does not HTTP-call PHP sidecar (OK) |
| “migrate (PHP SqlTranspiler bridge)” | **Production migrate dependency** for non-MySQL (preferred path), not build-only / not test-only |

**Conclusion (pre-fix):** claimed “VPS without PHP” is **not achieved** for SQLite/PG migrate. MySQL may pass SQL through unchanged (no transpile), but default/docs/tests use SQLite + PHP bridge.

**Post-fix target:** JS transpile primary; PHP only if `JASEFLY_USE_PHP_TRANSPILER=1`; Node tests must pass with PHP absent from PATH.

---

## 5. Module matrix (30 registered)

Statuses: `full parity` | `partial` | `registered only` | `stub` | `missing`.

| Module | PHP routes (approx) | Node routes | Real Node logic | Reg-only | DB side effects | Parity tests | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| system | many | health/caps/settings subset | partial kernel | no | some | smoke health/caps | **partial** |
| content / pages | many | AdminCrud + content helpers | CRUD subset | no | yes (CRUD) | none domain | **partial** |
| blog | many | thin list/CRUD | thin | no | CRUD | none | **partial** |
| projects | many | **empty register** | none | **yes** | no | none | **registered only** |
| media | many | upload/list subset | partial | no | yes | none | **partial** |
| users | many | admin users thin | thin | no | yes | login/me only | **partial** |
| forms | moderate | get/submit/list | basic submit | no | yes | none | **partial** |
| scheduler | moderate | tick marks completed | **no job handlers** | no | status flip | none | **stub** |
| support | many | tickets/messages subset | basic CRUD | no | yes | none | **partial** |
| payments | many | checkout/webhook/list | naive; **no HMAC** | no | orders insert | none | **stub** |
| orders | moderate | thin | thin | no | CRUD | none | **partial** |
| products | moderate | thin | thin | no | CRUD | none | **partial** |
| newsletter | moderate | subscribe | insert + catch swallow | no | yes | none | **partial** |
| comments | moderate | thin | thin | no | yes | none | **partial** |
| analytics | moderate | track event | insert + catch | no | yes | none | **partial** |
| notifications | moderate | thin | thin | no | limited | none | **partial** |
| automation | moderate | thin | thin | no | limited | none | **stub/partial** |
| webhooks | moderate | **empty** | none | **yes** | no | none | **registered only** |
| mail | moderate | contact insert | thin | no | yes | none | **partial** |
| translate | many | batch identity | **identity only** | no | no | none | **stub** |
| access | many | can/providers/bootstrap | incomplete ACL | no | no | none | **stub** |
| seo | moderate | thin | thin | no | limited | none | **partial** |
| registration | moderate | register user | thin | no | yes | none | **partial** |
| lab | moderate | thin | thin | no | limited | none | **partial** |
| module-manager | many | list + fake health | **no ZIP install** | no | read | none | **stub** |
| ddos | moderate | thin flags | thin | no | limited | none | **partial** |
| overload | moderate | thin | thin | no | limited | none | **partial** |
| demo | moderate | thin | thin | no | limited | none | **partial** |
| portfolio | moderate | **empty** | none | **yes** | no | none | **registered only** |
| template | moderate | **empty** | none | **yes** | no | none | **registered only** |
| publicSite | (core) | site/health assembly | partial | no | migrate catch | smoke site | **partial** |

### Deep paths (requested modules)

**Payments (Node):**  
`POST /payments/checkout` → parse JSON → (no authz) → `INSERT orders` → `lastInsertId` → `{order_id,pending}` → no payment provider / no events for paid.  
`POST /payments/webhook/:provider` → accept any body → `events.publish` → `{received:true}` (**no signature**).

**Support:**  
`POST /support/tickets` → insert ticket → return row; messages insert; admin list auth-only. Missing FAQ, poll semantics, soft rate limits, sound/visitor parity with PHP.

**Translate:**  
`POST /translate/batch` → map text→text, `provider:'identity'`. **No** Google/Libre/cache/corpus.

**ModuleManager:**  
`GET .../health` → always ok. **No** validate ZIP → jail → snapshot → install → migrate → enable.

**Scheduler:**  
`tick` → `UPDATE … completed` without executing job type handlers.

**Access:**  
`POST /access/can` — only trivial `auth/authenticated`; bootstrap returns empty capabilities; **admin bootstrap not behind auth**.

**Forms:**  
slug lookup → insert `form_submissions` → event `form.submitted`. Missing field validation / spam / mail hooks of PHP.

**Auth:**  
login / refresh / 2fa / me / MCP bearer — **most complete** Node domain; still no PHP PermissionMiddleware parity on admin.

**Content/Pages:**  
AdminCrud against `pages` resource — list/create/update/delete if tables exist; layout_json mapping. Not full PublicController/prerender/seed logic.

**Builder-related:**  
No Node PageBuilder API surface equivalent to PHP AdminController snapshot flows; FE still expects PHP-shaped admin APIs.

---

## 6. Source of Truth

| Question | Answer |
| --- | --- |
| Generated from contracts? | Migrations copied; resources read by Node AdminCrud; capabilities loaded at runtime; **routers not generated** |
| Manual sync? | `sync-from-contracts.js` copies snapshots; OpenAPI/manifests edited by hand |
| Independent PHP/Node types? | Yes — PHP modules remain primary; Node reimplements thinly |
| CI fails on drift? | **No** — validate is structural; empty perms OK (proven) |
| Change PHP route without contracts? | **Yes** |
| Change Node route without contracts? | **Yes** |
| OpenAPI coverage | **Core slice only** (~10 / ~325 ≈ **3%**) |
| JSON Schema runtime? | **No** (`contracts/schema/` empty; zod unused for request contracts) |
| Permissions/events from manifest at runtime? | Permissions JSON **not enforced** on Node admin; EventBus is in-process publish only |

**Controlled drift test:** emptied `permissions-core.v1.json` to `{"permissions":[]}` → validate still **OK** → restored. SoT enforcement **failed**.

---

## 7. Parity harness

| Metric | Value |
| --- | --- |
| Cases | **5** (health, capabilities `parity:false`, site, login-invalid, unknown-resource→401) |
| Compares both runtimes | Only if both `PHP_BASE` and `NODE_BASE` set |
| HTTP status / success / error | Yes |
| Response JSON data | **No** (explicitly loose) |
| Permissions / DB / events / lifecycle / migrations | **No** |

**Verdict:** smoke harness, not behavioral parity.

**Intentional break (pre-fix expectation):** changing Node `data.status` while keeping HTTP 200/`success:true` would still print `[PARITY OK]` because runner ignores data when status/success/error match.

---

## 8. Test matrix (initial audit run)

| Command | Exit | Passed | Failed | Duration | What it really checks |
| --- | --- | --- | --- | --- | --- |
| `node scripts/contracts/validate-contracts.js` | 0 | n/a | 0 | ~36ms | File presence + array shapes; **not** semantic SoT |
| Empty permissions drift | 0 | — | — | — | **Proves validate too weak** |
| `runtime-node` `npm test` **with PHP** | 0 | 6 | 0 | ~7s | Health/caps/site/login/CRUD/MCP token |
| `runtime-node` `npm test` **without PHP** | ≠0 | — | migrate | — | **Proves PHP dependency** |
| PHP `backend/tests/run.php` | (prior claim 323) | — | — | — | Shared path; not Node parity |
| Parity suite dual | not fully run in audit window without both servers | 5 cases max | — | — | Smoke |
| Frontend / VPS unpack boot | not fully exercised this pass | — | — | — | See remaining |

### Quality of 6 Node tests

Cover: health envelope, capabilities arrays, site `enabled_plugins` presence, invalid login 401, login→me→social-links CRUD, MCP token role.  
**Do not cover:** payments/translate/support/scheduler/module-manager, permissions deny, migrate without PHP (pre-fix), webhook security, parity vs PHP.

---

## 9. Shared hosting regression

| Check | Evidence |
| --- | --- |
| PHP path still present | Unremoved `backend/`, `build-hosting.js` |
| Capability gate added | `scripts/build-hosting.js` + SystemModule capabilities |
| Update ZIP / SiteUpdater | Not re-diffed against prior artifact this pass (no prior ZIP in `release/`) |
| Risk | Gate misconfig could block shared build — needs explicit shared ZIP rebuild in post-fix matrix |

---

## 10. VPS build / deploy

| Check | Result |
| --- | --- |
| Artifact intent | runtime-node + frontend-dist + contracts |
| PHP excluded from tarball | By copy filter — **yes** (tree not copied) |
| `npm ci` in artifact | **node_modules excluded** from stage — server must `npm ci --omit=dev` (docs claim; not proven in empty-dir boot this pass) |
| Healthcheck | **Claimed, not executed** (Critical) |
| Auto rollback on bad health | **Missing** |
| SSH escaping | Single-quoted paths; stamp/cmd injection residual risk |
| Secrets in logs | Key path not echoed in `vpsStatus` (good); command stderr may still leak |

---

## 11. Security (new Node + MCP)

| Area | Finding | Severity |
| --- | --- | --- |
| Admin ACL | Auth-only CRUD | Critical |
| Payment webhooks | No signature / replay | Critical |
| Access bootstrap | Unauthenticated | High |
| SQL | Parameterized `?` in most paths; table names from resource map (allowlist via contracts) | Medium OK / High if resource map poisoned |
| Path / archive | ModuleManager does not extract ZIPs yet | N/A / stub |
| SSH deploy | Shell string assembly | High |
| JWT / password | jose + argon2/bcrypt present | Partial OK (needs threat review) |
| Rate limit / CORS | CORS configurable; soft rate limits of PHP **not** ported | High gap |
| Verbose errors | Migration errors can include SQL snippets | Medium |
| Timing on login | Not reviewed in depth this pass | Medium |

---

## 12. Scores (method noted)

| Metric | Score | Method |
| --- | --- | --- |
| % baseline API in Node | **~25–40%** | Node route regs 138 / PHP ~325; many Node routes thin/stub → effective **~15–25%** behavioral |
| % baseline modules with real logic | **~20%** (6/30 generous partial; 0 full parity) | Matrix statuses |
| % OpenAPI coverage | **~3%** | 10 / 325 |
| % parity scenarios | **≪1%** of needed; **5** smoke cases | Case count vs module surface |
| % PHP runtime independence | **0% pre-fix** on SQLite migrate; target **100%** after transpile fix for default path | PATH-without-php test |
| Production readiness Shared | **~70–85%** (existing product; dual changes small) | Prior PHP suite + unchanged core |
| Production readiness Node VPS | **~15–25%** | Kernel yes; modules/deploy/security/parity no |

**Continuous architecture scores (0–10):**  
Core dual design 6 · Module isolation 4 · Builder Node 1 · SDK binding 3 · Package lifecycle Node 1 · Security Node 3 · Observability 3 · Contract governance 2 · Testing 2 · Production Node 2 · Maintainability 4.

---

## 13–15. Remediation log (post-audit fixes + retest)

### Fixed (this session)

| Issue | Fix |
| --- | --- |
| PHP subprocess required for SQLite migrate | `sqlTranspile.ts`: JS-first; PHP only if `JASEFLY_USE_PHP_TRANSPILER=1`; CREATE/ALTER/INSERT IGNORE/DELETE JOIN/FK handling |
| Empty permissions still validated | `validate-contracts.js`: non-empty permissions/events/baseline/resources |
| Parity ignored data divergence | `tests/parity/runner.mjs`: deep scrubbed JSON compare |
| Admin CRUD auth-only | `requireAdmin` role gate on admin CRUD |
| Access bootstrap unauthenticated | `requireAdmin` on bootstrap |
| Payment webhook open | Requires `PAYMENTS_WEBHOOK_SECRET` + header match; else 503 |
| VPS deploy fake healthcheck | `probeHealth` + auto-`rollbackVps` on failure; safer remote tokens |
| False “Phase 1–7 done” journal | `dual-runtime-progress.md` rewritten to partial/scaffold |
| Typecheck/build broken | envelope/Database/app/ModuleContext typing |

### Evidence (retest)

| Command | Exit | Result |
| --- | --- | --- |
| `node scripts/contracts/validate-contracts.js` | 0 | OK |
| Empty `permissions: []` then validate | **1** | FAIL `permissions too small` (restored) |
| `runtime-node` `npm test` with PHP **removed from PATH** | 0 | **9/9** passed |
| `runtime-node` `npm run typecheck` | 0 | OK |
| `runtime-node` `npm run build` | 0 | OK |
| `php backend/tests/run.php` | 0 | **323 passed, 0 failed** |
| `node tests/parity/prove-deep-compare.mjs` | 0 | **PROOF_OK** — `[PARITY] health` on `runtime` field diverge |

### Remaining (still Critical/High for production dual-runtime)

- **No full baseline parity** — 30 modules registered; many stubs/empty; OpenAPI ~3% surface
- **Permissions**: role gate ≠ PHP PermissionMiddleware / capability matrix
- **Translate/Payments/Scheduler/ModuleManager** still stub/partial behavior
- **Contracts** still not generating routers; PHP/Node can drift routes without OpenAPI update
- **JSON Schema** unused; events not enforced from manifest
- **Parity suite** still 5 smoke cases (deep compare fixed, coverage not)
- **Live SSH VPS** deploy/rollback unproven on real host
- **Shared ZIP** structure diff vs prior artifact not done (no prior zip in `release/`)
- **Empty-dir VPS boot** (unpack → npm ci --omit=dev → migrate → start) not run this pass
- **Webhook HMAC** (provider signatures) not implemented — only shared secret header
- Silent `.catch` swallows remain in several modules

### Final verdict after remediation

**Still C → B: architectural scaffold / working Node kernel with partial modules.**

- Confirmed improved: Node SQLite migrate **without PHP**; contract empty-drift fails; parity deep-compare catches data divergence; admin role gate; webhook secret required; VPS healthcheck+rollback code path exists.
- **Not confirmed:** production dual-runtime with baseline API parity, or honest “30 modules done”.
- **PHP independence (migrate/default SQLite path):** now **yes** for tested migrate+kernel (was **no**).
- **Node VPS production readiness:** still **~20–30%** (kernel+migrate fixed; modules/deploy/parity incomplete).

### Scores after remediation (method unchanged)

| Metric | Before | After |
| --- | --- | --- |
| PHP independence (SQLite migrate) | 0% | **~95%** for covered SQL constructs (full PHP SqlTranspiler parity not proven) |
| Contract validate usefulness | broken | **basic non-empty** (still not route drift CI) |
| Parity harness integrity | broken | **deep compare OK**; coverage still ~5 smoke |
| Production Node VPS | ~15–25% | **~20–30%** |
| Classification | C/B | **C leaning B** |
