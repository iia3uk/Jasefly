# Module recovery

- Fatal package boot → `InstalledModuleLoader` marks `failed` + safe-mode skip
- CLI: `php backend/bin/modules.php disable {slug}`
- Clear safe-mode entry after fix; re-enable from Admin
- Core update preserves `api/modules/`, `storage/modules/`, `public_html/modules/`
