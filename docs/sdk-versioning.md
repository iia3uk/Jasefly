# SDK versioning

## Purpose

State which Platform SDK generations this CMS build supports.

## How it works

Source of truth: `App\Platform\SdkVersion`.

| Constant | Value |
| --- | --- |
| `CURRENT` | `2` |
| `SUPPORTED` | `[1, 2]` |
| `MIN_SUPPORTED` | `1` |
| Stability map | `1 => stable`, `2 => current` |

Package manifests set `jasefly.sdk_version`. Unsupported generations fail compatibility / certify. Generation 1 remains supported (Forms reference certified). Generation 2 is current (includes newer surface such as jobs-oriented APIs).

`isDeprecatedGeneration` is true for supported versions less than `CURRENT`.

## Execution flow

1. Author sets `jasefly.sdk_version` in `module.json`.
2. Validator / `CompatibilityChecker` / certify compare against `SdkVersion::supports`.
3. Runtime adapters may apply `CompatibilityLayer` aliases for older generations.

## Key components

- `App\Platform\SdkVersion`
- `CompatibilityLayer`
- Manifest field `jasefly.sdk_version`

## Files involved

- `backend/src/Platform/SdkVersion.php`
- `backend/src/Platform/Compatibility/CompatibilityLayer.php`
- `modules-src/*/module.json`

## Related pages

- [platform-sdk.md](platform-sdk.md)
- [sdk-certification.md](sdk-certification.md)
- [contracts-and-governance.md](contracts-and-governance.md)

## Common mistakes

- Documenting “SDK v3” without a matching `SdkVersion` constant.
- Bumping `CURRENT` without updating certify targets and snapshots.

## Extension points

Host maintainers only: change `SdkVersion` + adapters + snapshots together.

## See also

- [platform-sdk.md](platform-sdk.md)
- [sdk-certification.md](sdk-certification.md)
