# PHP architecture — FINAL FREEZE

**Status:** FROZEN (2026-08-08)  
**Verified:** live ZIP lifecycle on MySQL/Docker · suite **1277 / 0** · Node **71 / 0** · certify **15/15** · combos/dual-runtime YES · `legacy-extract` absent  
**Canonical companion:** [`architecture/CURRENT.md`](architecture/CURRENT.md)  
**Rule:** no new PHP extraction/redesign unless required for Node parity.

---

## 1. Platform / Core

Owns infrastructure only — not product domains.

| Area | Location | Notes |
| --- | --- | --- |
| Bootstrap / Container / Router | `backend/src/Bootstrap.php`, `Core/`, `Router.php` | Host boot |
| ModuleRegistry + PackageModuleAdapter | `Core/ModuleRegistry.php`, `Core/Modules/*` | Bundled discover + ZIP adapter |
| InstalledModuleLoader | `Services/Modules/InstalledModuleLoader.php` | Package boot; namespace scan after health preload |
| Module Package Manager | `Services/Modules/*`, `Modules/ModuleManager/` | ZIP lifecycle |
| Platform SDK | `backend/src/Platform/` | Contracts + adapters for packages |
| CapabilityRegistry / ServiceRegistry | `Platform/Capabilities/` | Capability + soft facades |
| EventDispatcher + EventCatalog | `Core/EventDispatcher.php`, `Platform/Events/EventCatalog.php` | Bus + discovery metadata |
| Access / ACL | `Platform/Access/`, `Modules/Access/` | Host ACL |
| Auth / JWT | Controllers + `Modules/Users/` | Host identity |
| Contract snapshots | `Platform/Manifest/*.v1.json` | Governance |

Packages must import **`App\Platform\*`** (and `App\PackageModules\{Slug}\*`) only — never `App\Core\*` / `App\Controllers\*` / `App\Services\*` internals.

---

## 2. Host infrastructure (bundled, not ZIP)

Present under `backend/src/Modules/`:

| Module | Role |
| --- | --- |
| System | Health, plugins mirror, templates, backup, MCP status |
| Content | Pages, nav, site bootstrap, host chrome CRUD |
| Media | Uploads / library |
| Users | Users/roles |
| Access | Paywall / ACL HTTP |
| Mail | SMTP / contact infra (`$ctx->mail()`) |
| Scheduler | Jobs / cron / `PackageJobLifecycle` |
| Seo | Redirects / SEO settings / prerender helpers |
| ModuleManager | Admin MPM UI/API |
| Ddos / Overload | Edge / load guards |
| Demo / Lab / Template | Sandbox / experiments / scaffold |
| Portfolio | **Deprecated** composition metadata only — not a ZIP product |

---

## 3. ZIP package domains (15)

Sources: https://github.com/iia3uk/Jasefly-Modules · ZIPs: `release/modules/jasefly-module-{slug}-*.zip`  
**Not** in `backend/src/Modules/` · **no** `backend/legacy-extract/`

| Package | Provides (summary) |
| --- | --- |
| webhooks | Outbound webhooks + SSRF-safe dispatch |
| comments | Comments / reviews |
| forms | Forms + submissions + actions |
| analytics | Collect + admin + scheduler jobs |
| newsletter | Campaigns + subscribe |
| automation | Rules + EventCatalog triggers + resume jobs |
| notifications | Inbox + `notifications.send` soft facade |
| support | Tickets / FAQ / chat |
| translate | Batch translate + corpus hooks |
| products | Catalog |
| orders | Orders / carts |
| payments | Providers + checkout |
| registration | Public signup via Platform Auth |
| blog | Content Resources type `blog` |
| projects | Content Resources types `projects`, `project-categories` |

Live verify: `JASEFLY_LIVE_VERIFY=1 php backend/bin/live-package-verify.php`

---

## 4. Generic SDK boundaries

| Boundary | API | Notes |
| --- | --- | --- |
| HTTP / routes | `$ctx->http()` | Package routes; soft rate limit; outbound |
| Permissions | `$ctx->permissions()` | Capability checks |
| Settings / storage | `$ctx->settings()`, storage adapters | Per-slug jail |
| Mail | `$ctx->mail()` | Soft; host Mail module |
| Notifications | `$ctx->notifications()` + `registerBackend` | Soft; package-provided send |
| Scheduler / jobs | `$ctx->scheduler()` / `jobs()` | Namespaced types + lifecycle release |
| Events | `$ctx->events()` publish/subscribe/`declare` | EventCatalog for discovery |
| Content Resources | `$ctx->resources()` | Opaque types; no product methods |
| Catalog / Orders | soft facades | Commerce packages |
| Auth lifecycle | `$ctx->auth()` | Registration gates |
| Capabilities | `$ctx->capabilities()` | require / register / revoke on disable |
| Builder | package widgets + `stableType` / hostSlots | No Blog-specific Builder branches required |

**Forbidden product methods:** `blogPosts()`, `projects()`, `portfolio()`, etc.

---

## 5. Package lifecycle (canonical)

`ModulePackageService`: upload → validate ZIP → inspect → install → migrations → hooks → enable → health.  
Disable/uninstall: `CapabilityRegistry::revokeModule`, clear Notifications/Catalog/Orders/ContentResources, `EventCatalog::clearOwner`, `PackageJobLifecycle::release`.  
Preserve-data policy via `module.json` `install.preserve_data_on_uninstall`.

---

## 6. EventCatalog

- Metadata registry for Automation/UI discovery — **not** a second bus.
- Packages `declare()` public event ids; disable clears by owner slug.
- No product event whitelist in Core.

---

## 7. Content Resources API

`PlatformContentResourcesInterface` / `ContentResourcesAdapter` / `$ctx->resources()`:

`register`, `clearOwner`, `has`/`owner`/`types`, CRUD, `publish`, relations, `publicList`/`publicGet`.

- Host owns pages/nav/site bootstrap.
- Blog/Projects register opaque types; Public/Admin controllers do not own their SQL.
- Synthetic proof: `zed-content-probe` / `ZedContentResourcesProbeTest`.

---

## 8. Mail / Notifications / HTTP / Scheduler

| Surface | Host | Package |
| --- | --- | --- |
| Mail | Mail module + MailAdapter | consume `$ctx->mail()` |
| Notifications | soft facade | Notifications ZIP registers backend |
| HTTP | HttpAdapter + SsrfGuard / OutboundHttp | routes + outbound |
| Scheduler | Scheduler module + JobRunner | namespaced handlers; release on disable |

---

## 9. Intentional technical debt (do not “fix” casually)

1. Admin dashboard / SoftDelete / Sitemap / MediaUsage still know some table names (`blog_posts`, `projects`, …).
2. PublicController path→plugin gates + translate settings chrome.
3. ZIP soft-disable Design B: disabled packages are **unloaded** (not soft-routed) unless loader later loads `registersRoutesWhenDisabled`.
4. Portfolio composition chrome (about/contact/services) may still FE-gate on `portfolio`.
5. Live production hosting install verify of all 15 ZIPs (optional ops).
6. Lab remains bundled (SKIP extract).

---

## 10. Freeze checklist (verified)

- [x] Extracted domains absent from `backend/src/Modules/` discovery  
- [x] `backend/legacy-extract/` absent  
- [x] No `App\Modules\{Extracted}\` static imports in Core/Controllers  
- [x] Certify 15/15 OK  
- [x] `php backend/tests/run.php` → 1195 / 0  
- [x] Content-plane redesign + Blog/Projects package-owned  
- [x] Portfolio deprecated composition shell  

**PHP PHASE COMPLETE · FROZEN.**
