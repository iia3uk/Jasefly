# Node domain extraction → native PlatformContext

**Status:** COMPLETE (native SDK)  
**PHP:** FROZEN  
**Host:** `registerAll.ts` / `moduleNames.ts` = host-only (no extracted domain static registration)

## Ownership

All 15 domains are package-owned in [Jasefly-Modules](https://github.com/iia3uk/Jasefly-Modules) under `modules-src/{slug}/` with Node entry:

`backend/node/index.ts` → `export { register } from './domain.js'`  
`register(platformContext)` — pure PlatformContext (no `registerLegacy` / ModuleContext)

| slug | entry | notes |
| --- | --- | --- |
| webhooks | `register` | events + SSRF `http.fetch` |
| comments | `register` | |
| analytics | `register` | owns `analytics.retention` / `analytics.aggregate` jobs |
| notifications | `register` | |
| newsletter | `register` | owns `newsletter.campaign.send` |
| registration | `register` | `passwords()` facade |
| forms | `register` | |
| automation | `register` | owns `automation.resume` |
| translate | `register` | package-local TranslateService |
| support | `register` | `plugins().softGate` + `permissionAny` |
| blog | `register` | |
| projects | `register` | public `/projects*` |
| products | `register` | |
| orders | `register` | |
| payments | `register` | |

## Shared package SDK

`package-sdk/node/{helpers,platform-types}.ts` → copied into each package `backend/node/sdk/`.

Allowed package backend deps: PlatformContext · shared SDK · own code · explicit third-party.

## Compatibility removed

- `registerLegacy` / `registerModule` entry
- `legacyModuleBind.ts` / fake ModuleContext `app`
- PackageLoader ModuleContext construction
- Host silent noops for package job types

Canonical invoke: `runtime-node/src/packages/invokePackageEntry.ts`

## Proof

- Synthetic unknown package: `runtime-node/tests/package-host-zed.test.ts`
- Architecture assertions: `runtime-node/tests/package-native-sdk-assertions.test.ts`
- Docs: `docs/node-package-host.md`, `docs/node-domain-native-sdk.md`
