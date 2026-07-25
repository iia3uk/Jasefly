# SDK Versioning

| Constant | Value |
| --- | --- |
| `SdkVersion::CURRENT` | 2 |
| `SdkVersion::SUPPORTED` | 1, 2 |

Declare in `module.json`:

```json
"jasefly": { "min_version": "1.0.0", "api_version": 1, "sdk_version": 1 }
```

- Module `sdk_version` > platform max → **install blocked**
- Module on v1 while platform CURRENT=2 → **supported** via Compatibility Layer (warnings)
- Prefer `jobs()` (v2) over only `scheduler()`; v1 alias `db()` is deprecated
