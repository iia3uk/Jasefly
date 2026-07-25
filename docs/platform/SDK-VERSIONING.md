# SDK Versioning

| Constant | Value |
| --- | --- |
| `SdkVersion::CURRENT` | 2 |
| `SdkVersion::SUPPORTED` | 1, 2 |
| SDK v1 stability | **stable** (Forms SDK reference certified) |
| SDK v2 stability | **current** |

Declare in `module.json`:

```json
"jasefly": { "min_version": "1.0.0", "api_version": 1, "sdk_version": 1 }
```

- Module `sdk_version` > platform max → **install blocked**
- Module on v1 (stable) while CURRENT=2 → **supported**; soft upgrade recommendation, not "deprecated"
- Module on unsupported old generation → blocked or deprecated warning per `STABILITY` map
- Prefer `jobs()` (v2) over only `scheduler()`; v1 alias `db()` is deprecated at API level

Certification: `docs/platform/SDK-CERTIFICATION.md`  
Governance: `docs/platform/PUBLIC-API-GOVERNANCE.md`
