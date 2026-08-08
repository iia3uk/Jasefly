# Node domain native SDK

**Status:** in progress → acceptance via suites  
**PHP:** FROZEN  
**Predecessor:** package host READY + 15/15 domain extraction (legacy bridge)

## Architecture

```
Jasefly-Modules `modules-src/{slug}/backend/node/index.ts` (https://github.com/iia3uk/Jasefly-Modules)
  export { register } from './domain.js'

register(platformContext)  // pure PlatformContext — no ModuleContext
  → http / database / events / jobs / settings / passwords / plugins / …
```

Shared generic helpers live in `package-sdk/node/` and are copied into each package as `backend/node/sdk/`.

Packages must **not** import `runtime-node/src/modules/*`.

## Removed compatibility

- `registerLegacy` / `registerModule` package entry
- `legacyModuleBind.ts` / ModuleContext fake `app`
- PackageLoader ModuleContext construction

Canonical entry: `invokePackageEntry` → `register(PlatformContext)` only.

## Package-owned jobs

| Job type | Owner package |
| --- | --- |
| `analytics.retention` | analytics |
| `analytics.aggregate` | analytics |
| `newsletter.campaign.send` | newsletter |
| `automation.resume` | automation |

Host `registerDefaultHandlers` keeps only platform noops (`noop`, `scheduler.noop`, `scheduler.cleanup`) plus `http_ping` / event dispatch.
