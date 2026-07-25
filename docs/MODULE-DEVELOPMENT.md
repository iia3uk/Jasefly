# Developing a module package

1. `node scripts/create-module.js my-mod`
2. Implement `backend/{Studly}Module.php` extending `AbstractPackageModule`
3. Add SQL under `migrations/`
4. Ship prebuilt `frontend-dist/` (manifest.json + entry.js)
5. `node scripts/build-module.js my-mod --yes`
6. Install via Admin or CLI

SDK: `backend/src/Core/Modules/*`, FE contract `frontend/src/core/packageModuleTypes.ts`.
