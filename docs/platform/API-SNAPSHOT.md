# API Snapshot & Diff

Track changes to the public Platform SDK surface over time.

## Files

| File | Purpose |
| --- | --- |
| `backend/src/Platform/Manifest/api-snapshot.v1.json` | Committed baseline snapshot |
| `backend/src/Platform/Manifest/capabilities.v1.json` | Core capability id freeze |
| `backend/src/Platform/Manifest/permissions-core.v1.json` | Core permission id freeze |
| `backend/src/Platform/Manifest/events-core.v1.json` | Core event id freeze |
| `backend/src/Platform/Manifest/platform.manifest.json` | Exported public API catalog |
| `backend/src/Platform/Analysis/ApiSnapshot.php` | Generator / diff engine |
| `backend/tests/ContractGovernanceTest.php` | Wired into `run.php` (api-diff + related freezes) |

## Commands

```bash
# Regenerate committed snapshot (after intentional API changes)
php backend/bin/sdk.php api-snapshot

# Export platform.manifest.json (SDK versions, contracts, capabilities)
php backend/bin/sdk.php export-sdk

# Compare live registry vs committed snapshot
php backend/bin/sdk.php api-diff
```

MCP: `cms_sdk_api_diff`, `cms_export_sdk`

## api-diff output

```json
{
  "ok": true,
  "added": [],
  "removed": [],
  "changed": []
}
```

- `ok: false` when removed or breaking `changed` entries exist
- CI runs `api-diff` on every push/PR (`.github/workflows/platform-sdk.yml`)

## When to update snapshot

1. Added/removed public contract method
2. Changed `SdkVersion::STABILITY` or `SUPPORTED`
3. New exported service in `ServiceRegistry::PUBLIC_CATALOG`
4. After SDK v1 freeze or major platform release

Workflow:

```bash
php backend/bin/sdk.php export-sdk
php backend/bin/sdk.php api-snapshot
php backend/bin/sdk.php api-diff   # should report ok: true
git add backend/src/Platform/Manifest/
```

## Related

- `PUBLIC-API-GOVERNANCE.md` — policy for breaking vs additive changes
- `SDK-CERTIFICATION.md` — module-level certify (separate from platform API diff)
