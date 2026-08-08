# CI reference module packages

Approved Core fixtures used when the first-party package source repo is absent.

Canonical first-party sources: https://github.com/iia3uk/Jasefly-Modules  

Day-to-day development of the 15 extracted domains: clone/open that repository (or nested `Jasefly-Modules/`).  
CI and `SdkCliService::resolveModulePath` / `scripts/modules-root.mjs` fall back here.

Also includes SDK samples:

- `demo-kit` — general package-manager sample
- `forms-sdk-reference` — Forms via Platform SDK (lifecycle certification)
- `zed*` / probes — synthetic dual-runtime / seam proofs
