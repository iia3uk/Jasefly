# PHP extraction + live verification (final)

> **Historical architecture/audit record.**  
> Do not use as the current implementation guide.  
> See [`docs/architecture/CURRENT.md`](architecture/CURRENT.md) · [`docs/architecture/LLM_CONTEXT.md`](architecture/LLM_CONTEXT.md) · [`release/catalog/packages.md`](../release/catalog/packages.md).

## Live verification (2026-08-08) — COMPLETE

Environment: Docker MySQL `jasefly-verify-mysql:3307` + PHP 8.3 with `pdo_mysql`/`zip`/`pdo_sqlite`.  
Legacy: `backend/legacy-extract/` **removed** after package-wins proof (isolated during verify).

Harness: `JASEFLY_LIVE_VERIFY=1 php backend/bin/live-package-verify.php`

| ZIP | install | enable/boot | smoke | disable/host | re-enable | reinstall | uninstall | certify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| webhooks | OK | OK | OK | OK | OK | OK | OK | 88 |
| comments | OK | OK | OK | OK | OK | OK | OK | 88 |
| forms | OK | OK | OK | OK | OK | OK | OK | 88 |
| analytics | OK | OK | OK | OK | OK | OK | OK | 88 |
| newsletter | OK | OK | OK | OK | OK | OK | OK | 88 |
| automation | OK | OK | OK | OK | OK | OK | OK | 88 |
| notifications | OK | OK | OK | OK | OK | OK | OK | 88 |
| support | OK | OK | OK | OK | OK | OK | OK | 100 |
| translate | OK | OK | OK | OK | OK | OK | OK | 100 |
| products | OK | OK | OK | OK | OK | OK | OK | 88 |
| orders | OK | OK | OK | OK | OK | OK | OK | 88 |
| payments | OK | OK | OK | OK | OK | OK | OK | 88 |
| registration | OK | OK | OK | OK | OK | OK | OK | 88 |
| blog | OK | OK | OK | OK | OK | OK | OK | 88 |
| projects | OK | OK | OK | OK | OK | OK | OK | 88 |

Dependency combos: commerce, forms→automation/notifications, newsletter, analytics, content resources, automation_full — **OK**  
Aggregate all-15 install/enable/boot/disable-subset/re-enable — **OK**  
PHP suite after legacy purge — **Passed: 1195 / Failed: 0**

### Runtime bugs found and fixed
1. `InstalledModuleLoader` only scanned `array_diff(get_declared_classes())` → failed after health `require_once` (fixed: scan package namespace).
2. Broken `PostInstallHook` stubs (notifications/support/products/orders/payments) — replaced with real `ModuleHookInterface` classes.
3. Blog/Projects ZIPs missing `checksums.json` — rebuilt via `build-module.js`.
4. Registration migration used MariaDB-only `ADD COLUMN IF NOT EXISTS` — rewritten for MySQL.
5. Stale `api_v1.php` routes to removed `PublicController::projects/blog` — removed.
6. Tests updated for package-owned `/projects` and legacy removal.

## Remaining bundled (host infrastructure)
Access, Content, Ddos, Demo, Lab, Mail, Media, ModuleManager, Overload, Portfolio (deprecated composition), Scheduler, Seo, System, Template, Users

## Remaining PHP debt (before Node)
- Admin dashboard / SoftDelete / Sitemap / MediaUsage table hardcodes (`blog_posts`, `projects`, …)
- PublicController path→plugin gates and translate settings chrome
- ZIP soft-disabled Design B: disabled packages are unloaded (not soft-routed) unless `InstalledModuleLoader` gains disabled+`registersRoutesWhenDisabled` loading
- Live hosting install verify on production sites
- Lab SKIP (not extracted)

## Verdict
**PHP PHASE COMPLETE** — extracted packages install from ZIP without legacy; Core no longer owns those domains at runtime.
