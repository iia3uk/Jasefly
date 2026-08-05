<p align="center">

<img src="logo_full.svg" width="440" alt="Jasefly Logo">

</p>

<h2 align="center">
AI-first modular dual-runtime platform
</h2>

<p align="center">

One architecture. Two production runtimes. Contracts as the source of truth.<br>
CMS, Builder, and Admin are applications on the platform — not the product boundary.

</p>

<p align="center">

<a href="https://iia3uk.ru">Portfolio</a> •
<a href="docs/README.md">Documentation</a> •
<a href="INSTALL.md">Installation</a>

</p>

---

## What is Jasefly?

**Jasefly** is an AI-first modular **dual-runtime** platform/framework for websites, SaaS surfaces, and installable ZIP ecosystems.

| Runtime | Role |
| --- | --- |
| **PHP** | Production on shared hosting |
| **Node** | Production on VPS / cloud |
| **Dual** | Local development + CI behavioral parity (not a third production server) |

Both runtimes implement the same HTTP/module contracts under [`contracts/`](contracts/README.md). The React frontend (public site, admin, builder) talks to whichever runtime you deploy.

---

## Runtime × deployment target

| Runtime | Local | Shared | VPS | Docker | Cloud |
| --- | :---: | :---: | :---: | :---: | :---: |
| **Node** | ✓ | — | ✓ | ✓ | ✓ |
| **PHP** | ✓ | ✓ | — | ✓ | — |
| **Dual** | ✓ | ✓ | ✓ | ✓ | ✓ |

- **Shared hosting → PHP**
- **VPS / cloud → Node**
- **Dual → both artifacts + parity gate** (dev/CI harness)

Impossible pairs (`node`+`shared`, `php`+`vps`, `php`+`cloud`) fail in the CLI. Matrix SoT: [`docs/runtime-target-matrix.md`](docs/runtime-target-matrix.md).

---

## Architecture

```text
                         Contracts
                             │
              ┌──────────────┴──────────────┐
              │                             │
         PHP Runtime                   Node Runtime
       Shared Hosting                  VPS / Cloud
              │                             │
              └──────────────┬──────────────┘
                             │
                    React Frontend
             Public Site • Admin • Builder
                             │
                    Platform SDK / MCP
                             │
                  ZIP Modules / Packages
```

**Dual runtime** boots PHP + Node together for development and the CI parity harness. It is not a separate production deployment target.

---

## Behavioral parity

Covered baseline (as of Core Freeze evidence):

| Gate | Result |
| --- | --- |
| Built-in modules | **28/28** done |
| Behavioral cases | **879/879** |
| Source of truth | [`contracts/`](contracts/README.md) |

PHP and Node follow the same contracts for those scenarios. GitHub Actions boots both runtimes and compares real HTTP cases (`scripts/behavior/run-all.mjs` / `jasefly test --runtime=dual`).

Parity is **contract-scoped**: do not assume absolute identity outside covered auth/deep scenarios and scrubbed env-volatile fields. Progress: [`docs/dual-runtime-parity-progress.md`](docs/dual-runtime-parity-progress.md).

---

## CLI

```bash
jasefly doctor
jasefly dev   --runtime=node|php|dual
jasefly build --runtime=node|php|dual --target=...
jasefly test  --runtime=node|php|dual
```

Examples:

```bash
npm install

node scripts/jasefly/cli.mjs doctor --runtime=dual --target=local
node scripts/jasefly/cli.mjs build --runtime=php --target=shared
node scripts/jasefly/cli.mjs build --runtime=node --target=vps
node scripts/jasefly/cli.mjs test --runtime=dual
```

Env overrides: `JASEFLY_RUNTIME`, `JASEFLY_TARGET` (flags win). Defaults: `dev` / `test` / `doctor` → `dual` + `local`; `build` requires `--runtime`.

Details: [`docs/runtime-target-matrix.md`](docs/runtime-target-matrix.md) · [`docs/cli.md`](docs/cli.md).

---

## Production artifacts

| Runtime | Artifact | Notes |
| --- | --- | --- |
| **PHP** | `release/jasefly-cms-install-*.zip` / `jasefly-cms-update-*.zip` | Shared-hosting layout; **no** `runtime-node` |
| **Node** | `release/jasefly-cms-vps-*.tgz` (`.zip` on Windows) | VPS stage; **no** PHP API tree |
| **Dual** | both families | PHP shared ZIP + Node VPS package |

Node is not required on shared hosting. PHP is not required on a Node VPS. Packaging rules: [`docs/deployment.md`](docs/deployment.md), [`docs/dual-runtime.md`](docs/dual-runtime.md).

---

## MCP (AI operations)

MCP server: [`mcp-cms/`](mcp-cms/README.md). Secrets only in `mcp-cms/.env` (never in `mcp.json` or chat).

Typical release workflow:

```text
Request
  → inspect site          (cms_sites / cms_site_map / diagnostics)
  → backup                (before production mutations)
  → build                 (cms_local_build / shared|vps)
  → tests                 (cms_local_test)
  → deploy                (cms_deploy_update / cms_release)
  → migrations            (applied with update package)
  → verify                (post-deploy health / site / DB / diagnostics)
  → diagnostics / recovery
```

Preferred one-shot: `cms_release({ summary, changes, site? })`.

Also covered:

- **Multi-site orchestration** — `CMS_SITES`; pass `site` when ≥2 hosts
- **Content** — digests, CRUD, singletons, bulk (bounded)
- **Module lifecycle** — inspect / install / update / enable / disable / health / rollback
- **Backup before production operations**
- **Explicit `confirm: true`** for dangerous mutations
- **Post-deploy verification** — `ready` / `problems[]`

Rate limits and cache protect shared hosting (`cms_hosting_guard`).

---

## Platform SDK & ZIP modules

Installable packages depend on the **Platform SDK** only (`App\Platform\*`, `frontend/src/platform`) — never Core internals.

| Surface | Notes |
| --- | --- |
| SDK generations | **1** supported · **2** current |
| Certification | `php backend/bin/sdk.php certify` |
| Capabilities / permissions / events | Declared + governed snapshots |
| Migrations | Package-owned, additive |
| Builder widgets / admin pages | Registered via host context |
| Quarantine | Failed bootstrap isolates; site stays up |

Docs: [`docs/platform-sdk.md`](docs/platform-sdk.md) · [`docs/sdk-certification.md`](docs/sdk-certification.md) · [`docs/package-lifecycle.md`](docs/package-lifecycle.md).

---

## Core status — Jasefly 1.0 frozen

**Core Frozen** (see [`docs/core-freeze-1.0.md`](docs/core-freeze-1.0.md)):

- Public HTTP / MCP / widget / permission / event / capability IDs frozen
- SDK generations **1** and **2** supported
- Runtime × target matrix frozen
- Migrations **forward-only** (no rewrite of shipped files)
- SemVer: additive on **1.x**; removals / renames → **major**
- Dual parity gate remains the regression wall for baseline modules

Product `VERSION` may still show a pre-release label until the `1.0.0` tag is cut; freeze rules apply to the core surface regardless.

---

## Security / production readiness (confirmed)

- Empty `jwt_secret` fails production boot
- Authorization against **live DB** (not blind JWT role trust)
- SSRF guard + DNS pin on outbound HTTP
- Upload MIME / extension checks; no PHP execution in uploads
- Module path jail + quarantine
- Production debug stacks disabled for unverified clients
- HSTS (HTTPS) / COOP / CORP security headers
- Installer requires an explicit strong admin password (min length enforced)

Full notes: [`docs/security.md`](docs/security.md).

---

## Quick start

### CLI-first (recommended)

Requires **Node.js 20+**. For `runtime=php` or `dual`, also **PHP 8.2+** with `pdo` / `json` / `mbstring` / `openssl` (+ `pdo_sqlite` and/or `pdo_mysql`). Install those yourself (or use the Windows helper below).

```bash
npm install
node scripts/jasefly/cli.mjs doctor
node scripts/jasefly/cli.mjs dev --runtime=dual --target=local
```

Open `http://localhost:5173` · Admin `/admin` after install.

```bash
node scripts/jasefly/cli.mjs test --runtime=dual
node scripts/jasefly/cli.mjs build --runtime=php --target=shared
node scripts/jasefly/cli.mjs build --runtime=node --target=vps
```

### Windows shortcuts

```bat
setup.bat
start.bat
```

`setup.bat` can provision portable Node/PHP under `.tools/` when needed; see [`INSTALL.md`](INSTALL.md) and [`LOCAL_DEV.md`](LOCAL_DEV.md). Stop with `stop.bat` or `Q` in the launcher window.

---

## Repository layout

| Path | Role |
| --- | --- |
| `backend/` | PHP runtime, installer, migrations, modules |
| `runtime-node/` | Node runtime (VPS / cloud) |
| `frontend/` | React public site, admin, builder |
| `contracts/` | Dual-runtime source of truth |
| `modules-src/` | ZIP module sources |
| `mcp-cms/` | MCP server for agents |
| `scripts/jasefly/` | Unified CLI |
| `docs/` | Technical documentation |
| `release/` | Built artifacts (gitignored output) |

---

## Documentation

| Doc | Topic |
| --- | --- |
| [`INSTALL.md`](INSTALL.md) | Install, hosting, updates |
| [`docs/README.md`](docs/README.md) | Docs index |
| [`docs/runtime-target-matrix.md`](docs/runtime-target-matrix.md) | Runtime × target |
| [`docs/dual-runtime.md`](docs/dual-runtime.md) | Dual operations |
| [`docs/core-freeze-1.0.md`](docs/core-freeze-1.0.md) | 1.0 freeze audit |
| [`docs/platform-sdk.md`](docs/platform-sdk.md) | Platform SDK |
| [`docs/deployment.md`](docs/deployment.md) | Packaging & MCP deploy |
| [`CMS_MAP.md`](CMS_MAP.md) | Symptom → file map (agents) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Layer architecture |

---

## Support

If Jasefly saves you time or powers a product, consider supporting development:

https://pay.cloudtips.ru/p/4cbdc8ab

---

## Author

**iia3uk** — [https://iia3uk.ru](https://iia3uk.ru)

---

## Star the project

If Jasefly is useful, a ⭐ helps the project stay visible and motivates further work.

---

## License

[MIT](LICENSE.md) — Copyright (c) 2026 Jasefly
