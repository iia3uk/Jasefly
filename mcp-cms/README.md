# Jasefly — MCP

AI operator surface for **multi-site** content, module lifecycle, and release gates (build → test → changelog → deploy → verify).

Code deploy pipeline (authoritative): [`docs/deployment.md`](../docs/deployment.md). Runtime matrix: [`docs/runtime-target-matrix.md`](../docs/runtime-target-matrix.md). Engineer docs: [`docs/README.md`](../docs/README.md). Product overview: [`../README.md`](../README.md).

## Секреты только в `.env`

| Где | Файл |
|-----|------|
| MCP на ПК | `mcp-cms/.env` ← скопируй из `.env.example` |
| Сайт | `api/config/.env` ← из `backend/config/.env.example` |

**Не клади токены в `mcp.json` и не пиши в чат.**  
`.env` закрыт от HTTP (rewrite + deny в `config/`).

Cursor MCP config — только путь к скрипту:
```json
{
  "mcpServers": {
    "jasefly-cms": {
      "command": "node",
      "args": ["C:/JASEFLY_CMS/mcp-cms/src/index.js"],
      "env": { "CMS_REPO_ROOT": "C:/JASEFLY_CMS" }
    }
  }
}
```

Ключи (`CMS_URL`, `CMS_MCP_TOKEN`) читаются из `mcp-cms/.env`.

На сайте в `api/config/.env`:
```
MCP_API_TOKEN=тот_же_секрет
```
(или `mcp_api_token` в `config.local.php`)

## Несколько сайтов (один MCP)

Полный гайд: [`docs/mcp-multi-site.md`](../docs/mcp-multi-site.md).

Один процесс Cursor MCP может управлять несколькими инсталляциями Jasefly (контент + деплой; PHP shared и Node VPS в одном агенте). **Новый сайт = только строки в `.env` + рестарт MCP.** Код (`src/sites.js`) не трогать — это парсер env, не каталог доменов. Секреты — в `mcp-cms/.env`:

```env
CMS_SITES=jasefly,iia3uk

CMS_SITE_JASEFLY_URL=https://jasefly.com
CMS_SITE_JASEFLY_TOKEN=…
CMS_SITE_JASEFLY_ALIASES=jasefly.com,www.jasefly.com,official

CMS_SITE_IIA3UK_URL=https://iia3uk.ru
CMS_SITE_IIA3UK_TOKEN=…
CMS_SITE_IIA3UK_ALIASES=iia3uk.ru,www.iia3uk.ru
```

- Список без токенов: **`cms_sites`**
- Во все remote-tools передавайте **`site`**: id (`jasefly`), alias (`official`) или домен (`iia3uk.ru`)
- При **2+** сайтах без `site` tool вернёт ошибку со списком — агент должен спросить пользователя
- При **одном** сайте (или legacy `CMS_URL`) параметр `site` можно не передавать
- Локальные `cms_local_build` / `cms_local_test` без `site`
- Fan-out «залей на все» нет — каждый вызов на один хост
- После смены `.env` перезапустите MCP в Cursor

Пример: `cms_release({ summary: "…", changes: ["…"], site: "iia3uk" })`

## Module packages

MCP tools: `cms_modules_list`, `cms_module_inspect`, `cms_module_install`, `cms_module_update`, `cms_module_enable`, `cms_module_disable`, `cms_module_health`, `cms_module_operations`, `cms_module_rollback`, `cms_module_release`.

Dangerous ops require `confirm: true`. Build locally: `cms_module_release({ module: "demo-kit" })` → `release/modules/*.zip`.

**One-shot на хостинг:** `cms_module_release({ module: "indexnow", install: true, confirm: true })` — build → upload → install/update → enable.

## Plugins

| Tool | Назначение |
|------|------------|
| `cms_plugins_list` | Каталог плагинов (`enabled_only` опционально) |
| `cms_plugin_toggle` | Вкл/выкл (`name`, `enabled`, `confirm: true`) |

## Admin API модулей

`cms_admin_request` — авторизованный GET/POST/PUT/PATCH/DELETE только под `/admin/*`. Мутации требуют `confirm: true`.

Примеры: `/admin/indexnow/setup`, `/admin/plugins/translate/settings`, `/admin/system`.

## Хостинг не долбим

По умолчанию MCP:
- **очередь** — 1 запрос за раз  
- **пауза ~2с** между запросами (`CMS_MIN_INTERVAL_MS`)  
- **макс. 15/мин** (`CMS_MAX_PER_MINUTE`)  
- **кэш GET ~90с** (`CMS_CACHE_TTL_MS`)  
- `cms_bulk` ≤ 25 операций  

Агенту: один `cms_site_map`, правки через `cms_bulk`, не крутить `cms_list` в цикле.  
Статус лимитов: `cms_hosting_guard`.

## Карта контента для нейронки

Перед правками:
1. `cms_site_map` — все страницы + nav + hero/theme  
2. `cms_pages_digest` — короткие выжимки  
3. `cms_page_digest` (slug) — детали layout/стили/тексты  
4. Правка: `cms_update` / `cms_put_singleton`

В выжимке: slug, статус, виджеты, тексты, стили, excerpt, one-line `summary`.

## Схема БД

`cms_db_schema` — живой снапшот таблиц (MCP-токен):
- по умолчанию список имён + `expected.missing` (таблицы модулей, которых ещё нет)
- `table=products` — колонки/индексы одной таблицы
- `detail=full` — колонки всех таблиц (тяжелее)
- `counts=true` — COUNT(*) по таблицам (осторожно на shared)

После миграций/деплоя: `cms_db_schema` → смотри `ok` и `expected.missing`.

## Пайплайн кода

Порядок:
1. `cms_local_build`
2. `cms_local_test`
3. `cms_changelog` (обязателен — журнал MCP)
4. `cms_deploy_update` → сам делает шаг 5
5. verify: API `/health` + публичный `/site` + HTML корень + `cms_db_schema` + diagnostics  
   → ответ `ready: true` и **«Готово»** (или `problems[]`)

**Предпочтительно одним вызовом:**
```
cms_release({ summary: "…", changes: ["…"], site: "jasefly" })
```
(`site` обязателен, если в `.env` настроено больше одного сайта.)

Отдельно перепроверить прод: `cms_verify_alive`.

Логи: `cms_site_diagnostics`. Схема БД: `cms_db_schema`.
