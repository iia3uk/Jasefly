# Module Development (SDK-first)

1. `node scripts/create-module.js my-mod`
2. Extend `App\Platform\Package\AbstractPackageModule`
3. Implement `bootPlatform(PlatformContext $ctx)` — routes via `$ctx->http()`
4. Ship `frontend-dist` with `register(ctx)` (Platform or legacy hybrid)
5. Set `jasefly.sdk_version` + `capabilities`
6. `node scripts/validate-module.js my-mod`
7. `node scripts/build-module.js my-mod --yes`

Reference: `modules-src/demo-kit/`.
