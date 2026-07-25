# Module package security

- Zip Slip / ZIP bomb / symlink rejection (`ModulePackageValidator`)
- Path jail for extract, hooks, autoload (`ModulePackagePaths::assertContained`)
- Checksums required; signatures optional (ed25519 via libsodium)
- Installing a module = installing server code — UI warning required
- Permissions from manifest are registered but not auto-granted to roles
- Safe mode: `storage/module-safe-mode.json` skips fatal package modules
