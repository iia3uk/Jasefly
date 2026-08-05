# One-click local development (Windows)

Double-click these files in the project root — no terminal typing required.

For CLI-first dual runtime (PHP + Node + Vite), prefer:

```bash
npm install
node scripts/jasefly/cli.mjs doctor --runtime=dual --target=local
node scripts/jasefly/cli.mjs dev --runtime=dual --target=local
```

See [`INSTALL.md`](INSTALL.md) §3 and [`docs/runtime-target-matrix.md`](docs/runtime-target-matrix.md).

| File | What it does |
| --- | --- |
| **setup.bat** | **Новый ПК / перенос:** сам скачает portable Node+PHP в `.tools\`, `npm install`, БД (MySQL или SQLite) |
| **pack-transfer.bat** | Собрать ZIP для переноса на другой компьютер |
| **install.bat** | Setup via `dev.js install` (если Node/PHP уже есть) |
| **start.bat** | Runs `dev.js start` — PHP API + Vite, health checks, browser |
| **stop.bat** | Runs `dev.js stop` — stops all launcher-managed processes |
| **restart.bat** | Runs `dev.js restart` — stop then start |

Equivalent commands: `node dev.js [start|stop|restart|install]` (PHP+Vite path). Dual Node twin: `jasefly dev --runtime=dual`.

## First run (чистый ПК)

1. Распакуй архив из `pack-transfer.bat`.
2. Double-click **`setup.bat`** — нужен только Windows 10/11 (PowerShell + tar).  
   Node/PHP скачаются в `.tools\`, если их нет в системе.  
   Если MySQL недоступен — автоматически **SQLite** (сервер БД не нужен).
3. Browser / `start.bat` → **http://localhost:5173**.

## First run (уже стоят Node + XAMPP/MySQL)

1. Double-click **`install.bat`**.
2. Double-click **`start.bat`**.

Admin (after local `dev.js` install): `admin@example.com` / `Admin123!` (explicit local-only password via `--password=` — change for anything beyond local).
Default local installer email in `dev.js` is `admin@example.com`.

## What `dev.js` does automatically

- Detects **Node.js**, **npm**, **PHP**, **MySQL**, and **Git**
- Runs **`npm install`** if `frontend/node_modules` is missing
- Generates missing **`frontend/.env.development.local`** and **`backend/config/config.local.php`**
- Creates **storage** directories under `backend/storage/`
- Tests the **MySQL** connection and offers to run the DB installer if not initialized
- Finds **free ports** (defaults **8080** / **5173**) and syncs env + CORS
- Starts **PHP built-in server** and **Vite**
- Waits until both servers respond, then **opens the browser**
- **Watches PHP backend files** (`backend/src`, `backend/routes`) and restarts PHP only on change
- **Auto-restarts** crashed PHP or Vite processes
- **Graceful shutdown** on `Q`, Ctrl+C, or closing the window

## Hotkeys (while `start.bat` is running)

| Key | Action |
| --- | --- |
| **R** | Restart all services |
| **O** | Open site in browser |
| **C** | Clear console |
| **Q** | Quit (stop all processes) |

## Logs

Written to `.dev/logs/` (gitignored via `.dev/`):

| File | Contents |
| --- | --- |
| `launcher.log` | Startup steps, errors, restarts |
| `backend.log` | PHP server output |
| `frontend.log` | Vite output |

## If MySQL credentials differ

Edit `.dev/database.env` then run **install.bat** again:

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=portfolio_cms
DB_USER=root
DB_PASS=yourpassword
```

## Production

These scripts are for local DX only. Shared hosting uses `scripts/build-hosting.js` — see [`docs/deployment.md`](docs/deployment.md) and [`INSTALL.md`](INSTALL.md).

## See also

- [`INSTALL.md`](INSTALL.md)
- [`docs/README.md`](docs/README.md)
- [`docs/bootstrap-and-request.md`](docs/bootstrap-and-request.md)
