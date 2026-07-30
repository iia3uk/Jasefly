# Backend API

PHP REST API for the Jasefly framework. No Composer — `App\Bootstrap` autoload.

## Local server

```bash
cd backend
php -S localhost:8080 router.php
```

Installer / config: see [`../INSTALL.md`](../INSTALL.md). Architecture: [`../docs/bootstrap-and-request.md`](../docs/bootstrap-and-request.md).

## Ownership

- Front controller: `public/index.php`
- Modules: `src/Modules/`
- Platform SDK (ZIP): `src/Platform/`
- Migrations: `migrations/` + `migrate.php`

## See also

- [`../docs/README.md`](../docs/README.md)
- [`../docs/routing.md`](../docs/routing.md)
- [`../docs/cli.md`](../docs/cli.md)
- [`docs/MODULES.md`](docs/MODULES.md) → module system
