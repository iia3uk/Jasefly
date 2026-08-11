# Clean install — Jasefly

## 1. Prepare the host

- PHP 8.2+ with extensions: `pdo`, `pdo_mysql` (or sqlite), `json`, `mbstring`, `openssl`
- Empty MySQL/MariaDB database (or use SQLite for local)
- Writable directories: `api/storage` (uploads, logs, backups, cache)

## 2. Create the database

In the hosting panel (or locally):

```sql
CREATE DATABASE YOUR_DATABASE_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'YOUR_DATABASE_USER'@'localhost' IDENTIFIED BY 'YOUR_DATABASE_PASSWORD';
GRANT ALL ON YOUR_DATABASE_NAME.* TO 'YOUR_DATABASE_USER'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Deploy the install package

1. Build locally: `node scripts/build-hosting.js --mode=full --domain=https://YOUR_DOMAIN --demo=no --yes`
2. Upload `release/jasefly-cms-install-*.zip` to the server and extract into the site root.
3. Ensure the web root serves the SPA and `/api` points at the PHP backend (package layout is hosting-ready).

## 4. Run the installer

Open `http://YOUR_DOMAIN/install.php` (HTTPS if the cert already works). Without a certificate the package does **not** force HTTPS until `api/storage/.https_ok` exists (auto after a successful `https://` visit or System → «Проверить сертификат»).

Fill in:

- Database host / name / user / password (`YOUR_DATABASE_*`)
- Site URL (`https://YOUR_DOMAIN`)
- Admin email (you choose; no default production users ship in the repo)

Leave **demo content** unchecked for a clean site:

- Site name: **Jasefly**
- Description: **Modular PHP + React framework**
- Home, About, Privacy pages
- Basic navigation
- Empty projects / blog / products / media

Optional: enable **Jasefly Demo** to load `[DEMO]` sample rows (easy to delete in admin).

## 5. First administrator

The installer creates **one** admin account with the email and password you provide (min 12 characters). There is no default password.

## 6. Sign in

1. Open `/admin/login` (or your custom admin base path from site settings).
2. Sign in with the installer email + password.
3. Configure theme, pages, plugins, mail, MCP token (`api/config/.env`).

## 7. Local CLI install (optional)

```bat
cd backend
php install.php --driver=sqlite --sqlite_path=storage/sqlite/cms.sqlite --url=http://localhost:5173 --email=admin@example.com --demo=0 --keep=1
```

Then point the frontend API base at the PHP server and run `start.bat`.

## 8. After install

- Confirm installer files were removed
- Set a strong JWT secret / MCP token via `config/.env` (see `.env.example`)
- Never commit `config.local.php` or `.env`

## See also

- [`docs/database-and-migrations.md`](docs/database-and-migrations.md)
- [`docs/deployment.md`](docs/deployment.md)
- [`docs/security.md`](docs/security.md)
- [`INSTALL.md`](INSTALL.md)
