# Platform SDK

Official public API for installable ZIP modules. Package code may depend on **`App\Platform\*`** (PHP) and **`frontend/src/platform`** (FE) only.

## Backend

Entry: `App\Platform\PlatformContext` via `bootPlatform(PlatformContext $ctx)` on `App\Platform\Package\AbstractPackageModule`.

Services: `database()`, `storage()`, `events()`, `scheduler()` / `jobs()`, `mail()`, `notifications()`, `settings()`, `permissions()`, `users()`, `media()`, `builder()`, `http()`, `cache()`, `logger()`, `config()`, `translations()`, `assets()`, `health()`, `content()`, `capabilities()`, `feature()`, `service()`.

## Frontend

```ts
import type { JaseflyPlatformModule } from '@/platform' // host types
export default {
  slug: 'my-mod',
  version: '1.0.0',
  async register(ctx) {
    ctx.admin.registerNavItem({ ... })
    ctx.builder.registerWidget({ ... })
    ctx.public.registerRoute({ ... })
  }
}
```

Legacy `registerAdminNavItem` / `registerBuilderWidget` still work (hybrid loader).

## CLI

```bash
php backend/bin/sdk.php validate-sdk modules-src/my-mod
php backend/bin/sdk.php list-capabilities
php backend/bin/sdk.php export-sdk
php backend/bin/sdk.php sdk-report
```

`scripts/build-module.js` runs `validate-sdk` before ZIP.
