# Developing a module package

**Policy:** new optional features are **package modules** (ZIP on top of CMS), not bundled plugins.  
Migration guide (RU): [MODULE-FROM-PLUGINS.md](MODULE-FROM-PLUGINS.md).

## Steps

1. `node scripts/create-module.js my-mod` (or copy `modules-src/demo-kit/`)
2. Implement `backend/{Studly}Module.php` extending `AbstractPackageModule`  
   Namespace: `App\PackageModules\{Studly}\`
3. Add SQL under `migrations/`
4. Ship prebuilt `frontend-dist/` (`manifest.json` + entry with `register(ctx)`)
5. `node scripts/validate-module.js my-mod`
6. `node scripts/build-module.js my-mod --yes`
7. Install via Admin `/admin/modules` or CLI `php backend/bin/modules.php install …`

SDK: `backend/src/Core/Modules/*` · FE: `frontend/src/core/packageModuleTypes.ts` · Example: `modules-src/demo-kit/`.
