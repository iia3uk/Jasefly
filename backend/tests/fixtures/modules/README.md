# CI reference module packages

Public copies of SDK certification samples used when `modules-src/` is absent
(local-only / gitignored). Prefer `modules-src/{slug}/` for day-to-day development;
CI and `SdkCliService::resolveModulePath` fall back here.

- `demo-kit` — general package-manager sample
- `forms-sdk-reference` — Forms via Platform SDK (lifecycle certification)
