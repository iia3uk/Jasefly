# Migration Guide → Platform SDK

1. Replace `use App\Core\Modules\AbstractPackageModule` with `App\Platform\Package\AbstractPackageModule`
2. Move route registration from `registerRoutes` into `bootPlatform` using `$ctx->http()`
3. Replace `new Mailer` / `JobQueue` / `NotificationService` with `$ctx->mail()` / `scheduler()` / `notifications()`
4. Replace filesystem paths with `$ctx->storage()` / `$ctx->assets()`
5. Add `jasefly.sdk_version` and `capabilities.requires`
6. Run `php backend/bin/sdk.php validate-sdk modules-src/{slug}` until score OK
7. Rebuild ZIP and update via `/admin/modules`

See also `docs/MODULE-FROM-PLUGINS.md`.
