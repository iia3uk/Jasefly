# Content import

## Purpose

Explain how JSON content packs load into the CMS database.

## How it works

Importer: `backend/import-content.php` (on hosting under `api/`). Uses `ContentPackImporter` (and related services). Schema: `backend/content/content-pack.schema.json` (also mirrored under `content/` / hosting package). Admin can run content-pack ops under system routes; wipe paths require explicit confirmation (`--confirm` on CLI).

Templates/examples live under `content/` in the repo and are copied into hosting packages by `build-hosting.js`.

MCP can apply packs via content tools (`cms_write_content_pack` / `cms_apply_content_pack` / `cms_read_local_pack`) when configured — see `mcp-cms/README.md`.

## Execution flow

1. Author JSON against the schema (template/example in `content/`).
2. Place file on host or pass path to CLI/MCP.
3. Run importer (with `--confirm` if wiping).
4. Fix media URLs in Media library afterward (packs are text-first).

## Key components

| Piece | Role |
| --- | --- |
| `import-content.php` | CLI/HTTP entry |
| `ContentPackImporter` | Apply logic |
| JSON Schema | Validation shape |
| MCP content tools | Agent-assisted apply |

## Files involved

- `backend/import-content.php`
- `content/content-pack.schema.json`
- `content/content-pack.template.json`
- `content/content-pack.example.json`
- Root pointer [`../CONTENT_IMPORT.md`](../CONTENT_IMPORT.md)

## Related pages

- [deployment.md](deployment.md)
- [recovery.md](recovery.md)
- [cli.md](cli.md)

## Common mistakes

- Running wipe without `--confirm`.
- Expecting images to import as binary — media is usually uploaded separately.

## Extension points

- Extend schema + importer together; contract tests may assert schema invariants.

## See also

- [database-and-migrations.md](database-and-migrations.md)
- [../CONTENT_IMPORT.md](../CONTENT_IMPORT.md)
