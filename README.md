# Jasefly CMS

Модульная CMS: PHP API, React-админка, Page Builder, плагины, MCP для AI-агентов, install/update ZIP для shared-хостинга.

**Автор:** [IIA3UK](https://github.com/iia3uk)  
**Сайт:** [jasefly.com](https://jasefly.com)

> **Полная инструкция по установке и запуску:** [`INSTALL.md`](INSTALL.md)

---

## Возможности

- Page Builder (секции, колонки, виджеты, SEO, черновики)
- Модули/плагины с явными зависимостями (контент, блог, магазин, платежи, перевод, поддержка, Lab, …)
- MCP: агенты работают через tools и токен, не через весь репозиторий
- Локальная сборка frontend → пакет → обновление из админки
- Production runtime: PHP + MySQL (Node на хостинге не нужен)

---

## Быстрый старт

```bash
git clone https://github.com/iia3uk/jasefly.git
cd jasefly
```

**Windows:** `setup.bat` → `start.bat` → http://localhost:5173  

**Вручную:** см. [`INSTALL.md`](INSTALL.md) (PHP API + `npm run dev`).

Админка: `/admin`. Пароль после инсталлера смените сразу.

---

## Структура репозитория

| Путь | Роль |
| --- | --- |
| `backend/` | REST API, installer, migrations, modules |
| `frontend/` | Public site + admin (Vite/React) |
| `mcp-cms/` | MCP server (build → test → deploy gate) |
| `scripts/` | `build-hosting.js` — install/update ZIP |
| `content/` | Content packs (пример `jasefly-official`) |

Composer не используется.

---

## Shared hosting (кратко)

1. `node scripts/build-hosting.js --mode=full --domain=https://YOUR_DOMAIN --demo=no --yes`
2. Загрузить `release/jasefly-cms-install-*.zip`, распаковать
3. Создать MySQL БД → открыть `/install.php`
4. Обновления: `--mode=update` → админка → Обновления

Секреты только в `api/config/.env` на сервере (шаблон в `backend/config/.env.example`).

---

## Документация

| Документ | Тема |
| --- | --- |
| [INSTALL.md](INSTALL.md) | **Установка и запуск (полная)** |
| [LOCAL_DEV.md](LOCAL_DEV.md) | Лаунчер Windows |
| [CLEAN_INSTALL.md](CLEAN_INSTALL.md) | Чистая установка |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Модули, виджеты, API |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Архитектура |
| [SECURITY.md](SECURITY.md) | Безопасность |
| [CMS_MAP.md](CMS_MAP.md) | Карта путей |
| [mcp-cms/README.md](mcp-cms/README.md) | MCP |

---

## Что не входит в публичный репозиторий

- `.env`, `config.local.php`, токены MCP/JWT
- `node_modules/`, `frontend/dist/`, `release/`
- uploads / logs / backups
- локальные дампы и third-party scrapes

---

## Поддержать проект

Если Jasefly CMS оказалась полезной — можно скинуть любую сумму:

**https://pay.cloudtips.ru/p/4cbdc8ab**

---

## License / authorship

Jasefly CMS by IIA3UK.  
Use and fork freely; do not commit secrets or production credentials.
