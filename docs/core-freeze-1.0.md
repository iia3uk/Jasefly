# Jasefly 1.0 — Final Freeze Audit

**Status:** Core Frozen  
**Product version target:** `1.0.0` (repo `VERSION` at audit time may still read `1.0.0-rc.1` until the release tag is cut)  
**Date:** 2026-08-05  
**Scope:** Platform core (PHP API + Node twin contracts + Platform SDK + builder public surface + release matrix). Not a freeze of all marketing copy or every admin UX string.  
**Method:** Evidence from committed contracts, governance tests, dual parity gate, SDK policy. **No code changes in this audit.**

---

## Verdict (short)

**Yes — the core can be considered frozen for Jasefly 1.0.**

Evidence that the freeze is real (not aspirational):

| Gate | Evidence |
| --- | --- |
| HTTP / module behavior | Dual parity **879/879**, modules **done 28/28** |
| Contracts SoT | `contracts/` + `validate-contracts.js` |
| Platform SDK | `SdkVersion` CURRENT=2, SUPPORTED=[1,2]; `api-diff` breaking=[] |
| Governance | `ContractGovernanceTest` + snapshots (capabilities, permissions, events, MCP, widgets) |
| Runtime matrix | Strict: node≠shared, php≠vps/cloud |
| Release identity | `VERSION` / `LICENSE.md` / `NOTICE` in packaging policy |

Remaining technical debt does **not** reopen the core contract. It belongs to **1.1+** (see §9).

If the project later **removes** a frozen identifier, **rewrites** shipped migrations, or **drops** SDK v1 without a major bump — that is a **violation of this freeze**, not “iteration”.

---

## 1. Frozen API

These become **contracts** after 1.0. Additive changes allowed only under Versioning Rules (§5). Removals / renames / semantic breaks → **major**.

### 1.1 HTTP API

| Contract | Location / gate |
| --- | --- |
| Public + admin route set (method + path shape) | `contracts/baseline/routes.v1.json`, `contracts/baseline/node-routes.v1.json` |
| Behavior manifests (auth/deep cases) | `contracts/behavior/**` + dual runner |
| Success / error envelopes | `contracts/schema/envelope.*.v1.json`, `contracts/errors/errors.v1.json` |
| OpenAPI surface | `contracts/openapi/jasefly.v1.yaml` |
| Auth model | Bearer JWT + refresh rotation; cookie auth as implemented; role/capability checks against **live DB**, not JWT claims alone |
| Installer public behavior | Explicit `admin_password` (min 12); no hardcoded default password |

**Frozen response promises for public clients:**

- JSON envelope fields used by FE/MCP (`success`, `error`, `errors`, `data`) keep meaning.
- Stable resource URLs under `/api/v1/...` (and dual prefix `/api/...` where registered).
- Soft-plugin / disabled-module HTTP semantics already under test (empty list / 404 / `plugin_disabled`) stay.

**Not frozen as public API:**

- Internal `App\Core\*`, `App\Services\*` method signatures (except via Platform SDK).
- Admin UI React component props.
- Log file formats under `storage/logs/` (best-effort ops).

### 1.2 Content / builder data contracts

| Contract | Gate |
| --- | --- |
| Builder widget **type ids** | `contracts/builder/widget-types.v1.json` (+ FE vitest) |
| Layout JSON: existing widget types remain renderable | Builder compat / migrations policy — no silent type removal |
| Admin CRUD resource map | `contracts/resources/admin-resources.v1.json` |

### 1.3 MCP tool names

| Contract | Gate |
| --- | --- |
| Tool identifiers | `contracts/mcp/mcp-tools.v1.json` / `mcp-cms/manifest/mcp-tools.v1.json` |

Removing or renaming a published MCP tool without major + snapshot update is breaking.

### 1.4 CLI surface (operator)

Frozen **command names and required flags** for:

- `backend/bin/modules.php` — list/inspect/install/update/enable/disable/uninstall/rollback/migrations/health/reconcile-mirror  
- `backend/bin/sdk.php` — certify / api-diff / deprecations / list-capabilities / …  
- `jasefly` (`scripts/jasefly/cli.mjs`) — `doctor` / `dev` / `build` / `test` with `--runtime` / `--target`  
- `backend/install.php` CLI — requires `--password=` / `admin_password`  
- `backend/migrate.php`, `import-content.php` (`--confirm` where destructive)

New subcommands are **minor/patch**. Removing or changing meaning of existing ones is **major**.

---

## 2. Frozen SDK

Future CMS versions that claim compatibility with **SDK generation 1 or 2** **must** keep:

### 2.1 Generations

| Generation | Status at 1.0 | Obligation |
| --- | --- | --- |
| **1** | `stable` | Keep loadable; CompatibilityLayer aliases (`db()` → `database()`) until a **major** that drops v1 |
| **2** | `current` | Full public catalog; certify target for new packages |

Dropping support for generation **1** → **major** (and update `SdkVersion::SUPPORTED`).

Introducing generation **3** → new generation number + adapters; removing v2 methods still → major for packages on v2.

### 2.2 Public service IDs (`ServiceRegistry::PUBLIC_CATALOG`)

Frozen IDs (packages may only use these):

`db`, `database`, `storage`, `events`, `scheduler`, `mail`, `notifications`, `settings`, `permissions`, `users`, `media`, `builder`, `http`, `cache`, `logger`, `config`, `translations`, `assets`, `health`, `content`, `capabilities`, `features`, `access`

Rules:

- Packages **must not** import `App\Core\*`, `App\Services\*`, `App\Modules\*`, `App\Controllers\*`.
- Contracts live under `App\Platform\Contracts\*` (and documented Manifest types).
- New service IDs → **minor** (additive) + sdk-policy + snapshot update.
- Remove / rename service ID or break interface method → **major**.

### 2.3 Deprecated but supported until major

| Symbol | Rule |
| --- | --- |
| `PlatformContext::db()` | Deprecated; replacement `database()`; **do not remove before SDK major / gen drop** |

### 2.4 Package manifest fields

Frozen required semantics for installable ZIPs:

- `module.json` / `jasefly.sdk_version`
- `capabilities.requires` / `provides` vs `contracts/capabilities/capabilities.v1.json`
- Checksums / path jail / no Core imports (validator)
- Lifecycle stages: validate → jail → snapshot → install → perms → migrations → health → enable

### 2.5 Certification

`php backend/bin/sdk.php certify` (and lifecycle certify when enabled) remains the bar for “supported package on 1.x”.

---

## 3. Frozen Runtime Layer

Cannot break across 1.x without **major**:

### 3.1 Dual-runtime behavioral parity

- PHP Shared and Node VPS must continue to honor **contracts SoT** under `contracts/`.
- Dual test gate (`scripts/behavior/run-all.mjs`) is the regression wall for baseline modules.
- Scrubbed parity fields: changing scrub rules to hide a real divergence is **not** allowed; fixing a runtime to match contract is.

### 3.2 Runtime × target matrix

| Rule | Frozen |
| --- | --- |
| shared hosting = PHP | yes |
| VPS / cloud = Node | yes |
| `node` + `shared` | rejected |
| `php` + `vps` / `php` + `cloud` | rejected |
| Each runtime builds/tests without requiring the other at **runtime** | yes (dual is a **dev/CI** harness) |

### 3.3 Bootstrap / security invariants

- Empty `jwt_secret` in `production` → fail boot.
- Production HTTP responses do not expose stacks via `?debug=1` / unverified Bearer (ops: `.show_errors` or non-prod `APP_ENV`).
- Uploads: MIME/finfo + extension cross-check; no PHP execution in uploads.
- Storage/config deny-from-web in hosting package.
- SSRF guard on outbound HTTP.

### 3.4 Hosting package shape

- PHP update ZIP: flat `public_html` root; **no** `api/tests/`; includes `VERSION`, `LICENSE.md`, `NOTICE`, `release-meta.json`.
- Node VPS artifact: `runtime-node/dist` + prod deps; **no** PHP API tree; identity files present.
- Update packages must not ship installer or wipe `storage/` media.

### 3.5 Ownership boundaries

- Core = infra only; domain = modules; packages → Platform SDK only.
- Soft plugin gates / quarantine remain the failure model for bad packages (site stays up).

---

## 4. Migration Policy

### 4.1 What is a breaking change

| Change | Class |
| --- | --- |
| Edit or delete an already-shipped migration file under `backend/migrations/` / `contracts/migrations/` that sites may have applied | **Breaking (forbidden on 1.x)** |
| Rename table/column used by public API or packages without additive migration + compat | **Breaking / major** |
| Remove core permission / event / capability ID from registry without major + snapshot | **Breaking / major** |
| Change auth token type semantics so old refresh/access tokens fail without documented migration window | **Breaking / major** |
| Remove builder widget type without compat renderer or layout migration | **Breaking / major** |
| Narrow validation so previously valid client payloads fail | **Breaking / major** (unless security CVE with documented exception) |

### 4.2 What is allowed on 1.x

| Change | Class |
| --- | --- |
| New numbered migration `028_….sql` (and peers) | patch/minor |
| Additive columns / tables / indexes | patch/minor |
| Data backfill that preserves existing rows | patch/minor |
| Module-owned migrations inside package ZIP | per package semver; must not corrupt core tables |

### 4.3 Upgrade / rollback promises

- **Upgrade:** `SiteUpdater` / hosting update ZIP applies pending migrations; preserves `config.local.php`, uploads, and content.
- **Package update rollback:** file snapshot restore; **DB migration rollback is not guaranteed** (`db_rollback_available=false`) — frozen as documented limitation, not a silent promise of full DB undo.
- **Core DB:** no rewrite of applied history; forward-only.

---

## 5. Versioning Rules

SemVer for **product** `VERSION` / release tags (`1.x.y`).

### patch (`1.0.z`)

- Bug fixes with **no** public contract change
- Security fixes that do not remove APIs (may tighten validation with CVE note)
- Dependency updates that do not change public behavior
- Docs / packaging hygiene that keep artifacts valid
- Internal refactors behind frozen interfaces (discouraged; never required for patch)

### minor (`1.y.0`, y > 0)

- New HTTP routes / MCP tools / widget types / SDK service IDs / capabilities (**additive**)
- New modules shipped in core tree
- New optional config keys with safe defaults
- New CLI subcommands
- Deprecation **announcements** (no removal yet)
- Snapshot updates that **only add** identifiers

### major (`2.0.0`)

- Remove or rename frozen API / SDK / MCP / widget / permission / event / capability
- Drop SDK generation from `SUPPORTED`
- Remove CompatibilityLayer aliases that packages still use
- Change runtime matrix product canon in an incompatible way
- Require irreversible data migration that old clients cannot read
- Break dual baseline contracts without a parallel major of the contract pack

**Pre-release labels** (`1.0.0-rc.1`): allowed before the 1.0.0 tag; after **1.0.0** is published, core freeze rules above apply.

---

## 6. Release Checklist

Before **every** release (patch/minor/major):

1. **Version** — bump root `VERSION`; align `release-meta` / changelog entry.
2. **Contracts** — `node scripts/contracts/validate-contracts.js` green.
3. **SDK** — `php backend/bin/sdk.php api-diff` → no unexpected breaking; intentional breaks only on major with snapshot + docs.
4. **PHP tests** — `backend/tests/run.php` green (incl. ContractGovernance, SecurityVerification).
5. **FE tests / lint** — as in `cms_local_test` / CI.
6. **Dual parity** (if release touches API or dual-relevant modules) — `jasefly test --runtime=dual` → **879/879** (or updated frozen total after intentional additive cases).
7. **Runtime builds**
   - PHP: `jasefly build --runtime=php` (or MCP `cms_local_build`) → ZIP validates; **no** `api/tests/`; has `VERSION` + `LICENSE.md`.
   - Node: `jasefly build --runtime=node` → VPS artifact; no PHP API tree in stage.
8. **Doctor** — `jasefly doctor` for intended runtime×target.
9. **Changelog** — human summary (MCP `cms_changelog` before deploy).
10. **Upgrade smoke** — update package against a DB that already has migrations applied (no wipe of `config.local` / uploads).
11. **Security sanity** — production defaults: no empty JWT; no shipping secrets; installer password still required.
12. **Tag / publish** — only after checklist; do not mark `1.0.0` if dual or api-diff is red.

Deploy path remains MCP **`cms_release`** (build → test → changelog → deploy → verify) when shipping to hosting.

---

## 7. Definition of Done — new module (1.x)

A module is **done for 1.x** only if **all** apply:

1. **Ownership** — code under `frontend/src/modules/{name}/` ↔ `backend/src/Modules/{Name}/` (or package ZIP under `modules-src/` → SDK-only).
2. **No Core leak** — package modules use Platform SDK only; static scan / certify clean.
3. **Manifest** — `contracts/modules/{name}.manifest.json` (or package `module.json`) with sdk_version + capabilities.
4. **Permissions / events** — declare; do not invent undeclared core IDs.
5. **Migrations** — additive; uninstall path if package; documented data retention.
6. **Behavior coverage** — for dual-baseline modules: auth + deep cases in `contracts/behavior/{module}/`; parity green; `module-status` **done**.
7. **Disabled semantics** — SoftPluginGate / registersRoutesWhenDisabled policy respected and tested where relevant.
8. **Admin / public UX** — Russian admin copy where UI is shipped; no secrets in client bundles.
9. **Health / quarantine** — failure isolates; does not take down Bootstrap.
10. **Docs** — CMS_MAP row and/or `docs/modules/` note; no phantom CLI commands.
11. **Release** — does not force forbidden files into hosting ZIP; capability gate for shared hosting respected.

Optional ZIP packages additionally: certify score policy, install/update/rollback smoke, mirror reconcile understood.

---

## 8. Technical Debt (real only)

Carry-forward items that are **true** and **not** freeze blockers:

| Item | Why real | Target |
| --- | --- | --- |
| Vite / release-meta builds not bit-identical | Asset hashes + `built_at` | 1.1 |
| Legacy `MailService` contact fallback | Deprecated path still referenced | 1.1 |
| `FeatureFlags` mostly always-on | Manifest surface without real gates | 1.1 |
| No app-level JSON body size cap | Relies on php.ini | 1.1 |
| `frontend/package.json` version `0.0.0` | Not product VERSION | 1.1 |
| Optional MySQL lifecycle certify (`JASEFLY_LIFECYCLE_DB=1`) | Not default CI | 1.1 |
| Hosts that once received `api/tests/` may still have leftovers | Fixed in packager going forward | ops / 1.1 prune note |
| `PlatformContext::db()` still present | Deprecated until major | keep until SDK major |
| COEP omitted | Intentional shared-hosting tradeoff | leave |

**Not debt for freeze:** dual CompatibilityLayer for SDK v1; SoftPluginGate fail-open patterns that are tested product behavior.

---

## 9. Roadmap — Jasefly 1.1+

Belong **after** 1.0 freeze (illustrative; not commitments inside this audit):

- Deterministic / reproducible frontend artifact hashes
- App-level request body / header limits
- Stronger NOTICE aggregation for redistributed npm licenses
- Retire or fully quarantine legacy non-live registrars (`routes/api_v1.php` leftover)
- Mail plugin-only path (remove legacy MailService fallback)
- Real feature-flag gating or delete unused flags
- Expanded lifecycle certify in default CI
- Optional SDK generation 3 design (additive) — only with governance
- Performance / scale hardening beyond shared-hosting defaults
- Any **removal** of deprecated `db()` → schedule as **2.0**, not 1.1

---

## 10. Final Verdict

# Core Frozen

**Jasefly 1.0 core is frozen.**

After the **1.0.0** release tag:

| Forbidden without **major** | Allowed on **1.x** |
| --- | --- |
| Remove/rename frozen HTTP, SDK, MCP, widget, permission, event, capability IDs | Additive APIs, modules, migrations |
| Rewrite shipped core migrations | New forward migrations |
| Break PHP↔Node contract parity for baseline | Fix implementations to match contracts |
| Drop SDK v1 or remove `db()` alias | Deprecate further; document |
| Ship `api/tests/` or omit LICENSE/VERSION in release | Packaging hardening that preserves contracts |
| Invert runtime matrix (Node on shared as product) | New targets only if additive and documented |

**Allowed forever on 1.x:** bugfixes, security patches, additive features, new certified packages, docs, and ops tooling that do not break the frozen surfaces above.

Cutting the git/ SemVer tag `1.0.0` is a **release process** step (checklist §6), not a reason to keep the core unfrozen.

---

## Related SoT

- `contracts/README.md`
- `docs/contracts-and-governance.md`
- `docs/sdk-versioning.md`
- `docs/runtime-target-matrix.md`
- `docs/package-lifecycle.md`
- `CMS_MAP.md`
- Root `VERSION`, `LICENSE.md`, `NOTICE`
