# Cross-runtime package architecture

**Status:** CURRENT (cross-runtime contract notes) · see also [`architecture/CURRENT.md`](architecture/CURRENT.md)  
**PHP architecture:** FROZEN (no further domain extraction)  
**Principle:** ONE PACKAGE · ONE IDENTITY · MULTIPLE OPTIONAL RUNTIME ENTRYPOINTS

## Diagram

```
                 Package ZIP
            (modules-src → release ZIP)
                      |
              module.json (SoT)
           entrypoints.backend / .node
           surfaces / migrations / FE
                 /          \
        PHP adapter      Node adapter
     PackageModuleAdapter  PackageLoader
     PlatformContext.php   createPlatformContext
                 \          /
         PackageSurfaceRegistry (process-local)
         SoftDelete / Dashboard / Sitemap / Media / ACL
```

## Package surfaces

Packages declare host contributions in `module.json` → `surfaces` (and/or `ctx.surfaces().register()` at boot):

| Surface | Host consumers |
| --- | --- |
| `trash` | SoftDelete |
| `dashboard` | Admin dashboard counts |
| `sitemap` | SitemapService / Node content sitemap |
| `media` | MediaUsage collectors |
| `content_acl` | PermissionService content resources |
| `schema` | Canonical table ownership (role=owner) |

Unknown packages (e.g. synthetic `zed`) register without host slug edits. Disable/unload → `clearOwner`.

## Settings semantic SoT

- **Canonical bag:** `modules.settings` JSON keyed by `modules.name` (= package slug)
- PHP `SettingsAdapter`: read/write bag; dual-write + fallback to `settings_kv` `module.{slug}.*`
- Node `settings()`: same bag API (`get`/`set` patch)

## Lifecycle state machine

States: `installed` → `enabled` ↔ `disabled`; `failed` / `quarantined`; `uninstalled`

- Install records `installed` (not mixed with enabled)
- PHP compatibility: explicit transition `installed → enabled` after successful health
- Node: install → `installed`; enable is separate (observable two-phase)

## Authorization

Package declares required permission → host resolves principal → host decides (fail-closed).  
Node: `ctx.http().permission('cap')` uses `AuthService.mePayload` capabilities (no admin-role soft bypass).  
PHP: `permissionMiddleware(?string $capability)` same seam.

## Orders schema ownership

- Canonical owner: **orders** (`surfaces.schema` role=owner)
- Payments requires orders; may `CREATE IF NOT EXISTS` as legacy bootstrap (checksum frozen) with role=consumer
- Assertion: one `role=owner` per table across modules-src

## MCP

`cms_list_resources` = host UX hints ∪ runtime `surfaces.content_acl` from enabled modules. Not lifecycle authority.

## Proof

Dual-runtime fixture: `runtime-node/tests/fixtures/modules/zed` (v2 surfaces/settings/ACL/lifecycle).
