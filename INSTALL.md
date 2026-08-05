# Установка и запуск Jasefly

Полная инструкция: локальная разработка, чистая установка, shared-хостинг, Node VPS, обновления, MCP.

Jasefly — **AI-first modular dual-runtime platform**: PHP для shared hosting, Node для VPS/cloud, dual — для локальной разработки и CI parity. CMS-функции (страницы, медиа, контент) встроены в админку.

Обзор продукта: [`README.md`](README.md) · матрица runtime×target: [`docs/runtime-target-matrix.md`](docs/runtime-target-matrix.md).

Секреты (`JWT_SECRET`, `MCP_API_TOKEN`, пароли БД, `config.local.php`) **никогда** не коммитьте. В репозитории только `*.example`.

---

## 1. Что это

| Путь | Назначение |
| --- | --- |
| `backend/` | PHP runtime (shared hosting): API, инсталлер, миграции, модули |
| `runtime-node/` | Node runtime (VPS / cloud): тот же контрактный API |
| `frontend/` | Публичный сайт + админка + билдер (React / Vite) |
| `contracts/` | Source of truth для PHP ↔ Node |
| `mcp-cms/` | MCP-сервер для AI-агентов (Cursor и др.) |
| `scripts/jasefly/` | CLI: `doctor` / `dev` / `build` / `test` |
| `scripts/` | Сборка PHP ZIP / Node VPS-артефактов |
| `content/` | Контент-пакеты (пример: `jasefly-official`) |

Composer не нужен: PHP backend — plain PHP с автозагрузчиком.

---

## 2. Требования

### Локально

- Windows 10/11 **или** Linux/macOS
- **Node.js 20+** и npm
- **PHP 8.2+** с расширениями: `pdo`, `json`, `mbstring`, `openssl`, плюс `pdo_mysql` и/или `pdo_sqlite`
- **MySQL 8+ / MariaDB** *или* SQLite (для быстрого старта)

На чистом Windows можно запустить `setup.bat` — скрипт сам подтянет portable Node/PHP в `.tools/` (папка в `.gitignore`).

### Shared-хостинг (production)

- PHP 8.2+
- MySQL / MariaDB
- Возможность указать document root на содержимое install-пакета
- Запись в `api/storage/` (uploads, logs, cache, backups)

### VPS Node runtime (production, optional target)

- **Без PHP** на сервере
- Node.js 20+, MySQL или PostgreSQL
- Сборка: `cms_local_build({ target: 'vps' })` или `cd runtime-node && npm run build`
- Процесс: systemd (`runtime-node/deploy/jasefly-node.service`) или PM2
- Контракты: общий каталог `contracts/` (SoT для PHP и Node)
- Подробности: [`docs/dual-runtime.md`](docs/dual-runtime.md)

---

## 3. Быстрый старт (CLI-first)

Нужны **Node.js 20+** и npm. Для `runtime=php` или `dual` — ещё **PHP 8.2+** (см. §2). Зависимости сами не появятся, если их нет в системе (на Windows их может поставить `setup.bat` в `.tools/`).

```bash
git clone https://github.com/iia3uk/jasefly.git
cd jasefly
npm install
node scripts/jasefly/cli.mjs doctor
node scripts/jasefly/cli.mjs dev --runtime=dual --target=local
```

Сайт: **http://localhost:5173** · админка: `/admin` (после установки).

Сборка артефактов:

```bash
node scripts/jasefly/cli.mjs build --runtime=php --target=shared
node scripts/jasefly/cli.mjs build --runtime=node --target=vps
node scripts/jasefly/cli.mjs test --runtime=dual
```

---

## 3a. Быстрый старт (Windows shortcuts)

1. Клонируйте репозиторий (как выше).

2. Дважды кликните **`setup.bat`**  
   (или `install.bat`, если Node и PHP уже установлены)

3. Дважды кликните **`start.bat`** (PHP API + Vite; dual CLI — §3)

4. Откройте **http://localhost:5173**

Админка: `/admin` (после установки).  
Локальный `dev.js` задаёт пароль `Admin123!` явно через `--password=` — **смените на проде**; веб/CLI инсталлер пароль по умолчанию больше не ставит.

Остановка: `stop.bat` или клавиша `Q` в окне `start.bat`.

Подробности лаунчера: [LOCAL_DEV.md](LOCAL_DEV.md).

---

## 4. Ручной локальный запуск

### 4.1. Зависимости frontend / MCP

```bash
cd frontend && npm install && cd ..
cd mcp-cms && npm install && cd ..
```

### 4.2. Конфиг API

Скопируйте примеры (не коммитьте копии):

```bash
# Windows PowerShell
Copy-Item backend\config\config.local.example.php backend\config\config.local.php
Copy-Item backend\config\.env.example backend\config\.env
```

Заполните `backend/config/.env`:

- `APP_URL` — URL фронта (локально часто `http://localhost:5173`)
- `JWT_SECRET` — длинная случайная строка
- `DB_*` — MySQL **или** путь SQLite
- `MCP_API_TOKEN` — свой токен для агентов (опционально на старте)
- `CORS_ORIGINS` — origin фронта

### 4.3. Установка БД (CLI)

SQLite (без сервера БД):

```bash
cd backend
php install.php --driver=sqlite --sqlite_path=storage/sqlite/cms.sqlite --url=http://localhost:5173 --email=admin@example.com --password=YOUR_STRONG_PASSWORD --demo=0 --keep=1
```

MySQL:

```bash
cd backend
php install.php --driver=mysql --host=127.0.0.1 --port=3306 --name=jasefly_cms --user=root --pass=YOUR_PASSWORD --url=http://localhost:5173 --email=admin@example.com --password=YOUR_STRONG_PASSWORD --demo=0 --keep=1
```

Либо откройте веб-инсталлер (`install.php`), если так удобнее.

### 4.4. Frontend env

Создайте `frontend/.env.development.local` (игнорируется git):

```env
VITE_API_BASE=http://127.0.0.1:8080/api/v1
```

Порт PHP подставьте свой (лаунчер по умолчанию часто `8080`).

### 4.5. Запуск процессов

Терминал 1 — API:

```bash
cd backend/public
php -S 127.0.0.1:8080
```

Терминал 2 — Vite:

```bash
cd frontend
npm run dev
```

Сайт: http://localhost:5173  
API health: http://127.0.0.1:8080/api/v1/… (см. маршруты модулей)

---

## 5. Production: install ZIP на shared-хостинг

### 5.1. Сборка пакета локально

```bash
# один раз
copy build-hosting.config.example.json build-hosting.config.json
# отредактируйте domain и пути при необходимости
```

```bash
node scripts/build-hosting.js --mode=full --domain=https://YOUR_DOMAIN --demo=no --yes
```

Готовый файл: `release/jasefly-cms-install-YYYY-MM-DD-HH-MM-SS.zip`  
Папка `release/` в git **не** попадает.

### 5.2. На хостинге

1. Создайте пустую БД MySQL (utf8mb4).
2. Загрузите и распакуйте **install** ZIP в корень сайта (`public_html` и т.п.).
3. Откройте `https://YOUR_DOMAIN/install.php` (или `/api/install.php` — зависит от layout пакета).
4. Укажите БД, URL сайта, email администратора. Demo-контент — по желанию.
5. Войдите в админку, смените пароль.
6. Убедитесь, что инсталлер удалён / недоступен после установки.
7. Заполните `api/config/.env` на сервере (`JWT_SECRET`, `MCP_API_TOKEN`, …).

Подробнее: [CLEAN_INSTALL.md](CLEAN_INSTALL.md).

---

## 6. Обновления на хостинге

Локально соберите update-пакет:

```bash
node scripts/build-hosting.js --mode=update --domain=https://YOUR_DOMAIN --yes
```

В админке: **Обновления** → загрузить `jasefly-cms-update-*.zip`.

Пакет **не** затирает `config.local.php`, uploads, backups и логи. Перед применением проверяются манифест, совместимость и changelog.

### Планировщик (Scheduler)

Нужен для Automation / Newsletter / retries. На shared-хостинге добавьте cron каждые 5 минут:

```bash
php /path/to/api/bin/scheduler.php run --limit=20
```

Либо HTTP tick: `POST /api/v1/system/scheduler/tick` с заголовком `X-Scheduler-Token` (токен в настройках плагина «Планировщик»). Пока cron не настроен, админ-дашборд делает lazy tick.

Документация модулей: [`docs/modules/`](docs/modules/). Инженерия платформы: [`docs/README.md`](docs/README.md).

---

## 7. MCP (AI-агенты)

1. Скопируйте `mcp-cms/.env.example` → `mcp-cms/.env`.
2. Укажите:

```env
CMS_URL=https://YOUR_DOMAIN
CMS_MCP_TOKEN=тот_же_что_MCP_API_TOKEN_на_сайте
CMS_REPO_ROOT=C:/path/to/jasefly
```

3. Подключите сервер в Cursor (или другом MCP-клиенте) на `mcp-cms` — см. [mcp-cms/README.md](mcp-cms/README.md).

Токен должен совпадать с `MCP_API_TOKEN` в `api/config/.env` на сайте. Не публикуйте его.

---

## 8. Контент-пакет `content/jasefly-official`

Это пример маркетингового сайта Jasefly (layouts, скрипты apply/restore).

- Скрипты читают токен из **локального** `mcp-cms/.env` — в git токенов нет.
- На пустой установке пакет не обязателен: CMS ставится «чистой».
- Чтобы накатить контент на свой инстанс: настройте MCP env на **ваш** URL/токен и запускайте apply-скрипты осознанно (есть rate-limit на shared-хостинге).

---

## 9. Структура после клонирования — что не попадёт в git

Игнорируется (и должно):

- `.env`, `backend/config/.env`, `mcp-cms/.env`
- `backend/config/config.local.php`
- `frontend/node_modules/`, `frontend/dist/`
- `backend/storage/uploads|logs|cache|backups|…`
- `release/`, `.tools/`, `build-hosting.config.json`
- локальные дампы вроде `reference/`

---

## 10. Полезные документы

| Файл | Тема |
| --- | --- |
| [docs/README.md](docs/README.md) | Каноническая документация (reading order) |
| [README.md](README.md) | Обзор репозитория |
| [LOCAL_DEV.md](LOCAL_DEV.md) | `setup.bat` / `start.bat` |
| [CLEAN_INSTALL.md](CLEAN_INSTALL.md) | Чистая установка |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Contributor entry |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Слои + ownership |
| [docs/deployment.md](docs/deployment.md) | `cms_release` / hosting ZIP |
| [SECURITY.md](SECURITY.md) | → `docs/security.md` |
| [CMS_MAP.md](CMS_MAP.md) | Карта путей для агента |
| [mcp-cms/README.md](mcp-cms/README.md) | MCP tools |

---

## 11. Лицензия и автор

Jasefly — IIA3UK.  
Репозиторий публикуется **без** production-секретов и без чужих scraped-материалов.
