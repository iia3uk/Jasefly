# Backend — PHP runtime (shared hosting)

PHP REST API for Jasefly on **shared hosting**. No Composer — `App\Bootstrap` autoload.

This is one of two production runtimes. The Node twin lives in [`../runtime-node/`](../runtime-node/README.md). Shared contracts: [`../contracts/`](../contracts/README.md).

## Local server

```bash
# Preferred (matrix-aware)
node ../scripts/jasefly/cli.mjs dev --runtime=php --target=local

# Or direct
cd backend
php -S localhost:8080 router.php
```

Installer / config: [`../INSTALL.md`](../INSTALL.md). Request path: [`../docs/bootstrap-and-request.md`](../docs/bootstrap-and-request.md).

## Ownership

- Front controller: `public/index.php`
- Modules: `src/Modules/`
- Platform SDK (ZIP packages): `src/Platform/`
- Migrations: `migrations/` + `migrate.php`

## Build artifact

```bash
node ../scripts/jasefly/cli.mjs build --runtime=php --target=shared
```

Produces `release/jasefly-cms-*-*.zip` — must **not** contain `runtime-node/`.

## See also

- [`../docs/README.md`](../docs/README.md)
- [`../docs/routing.md`](../docs/routing.md)
- [`../docs/cli.md`](../docs/cli.md)
- [`../docs/runtime-target-matrix.md`](../docs/runtime-target-matrix.md)
- [`docs/MODULES.md`](docs/MODULES.md)
