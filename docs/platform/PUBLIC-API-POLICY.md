# Public API Policy

1. New package-facing APIs go under `App\Platform\` or `frontend/src/platform`.
2. Register in `PublicApiRegistry` / `platform.manifest.json` (`php backend/bin/sdk.php export-sdk`).
3. Breaking changes bump `SdkVersion::CURRENT` and keep prior generations in `SUPPORTED` until removal.
4. Mark removals with `#[DeprecatedApi(since, removeIn)]`.
5. Changelog: `docs/platform/SDK-CHANGELOG.md`.
