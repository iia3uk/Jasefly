# Плагины → пакетные модули (политика и миграция)

## Коротко

| | Плагины (`/admin/plugins`) | Пакетные модули (`/admin/modules`) |
| --- | --- | --- |
| Что это | Фича с тем же контрактом модуля | Та же фича |
| Где код | Вшит в релиз CMS (`backend/src/Modules/*` + `frontend/src/modules/*`) | ZIP поверх CMS (`api/modules/{slug}/` + `public_html/modules/{slug}/`) |
| Как появляется | Вместе с `cms_release` | Upload → install → enable |
| Обновление | Только обновлением всей CMS | Отдельный ZIP update / rollback |

**Правило с этого момента:** новые опциональные фичи (каталог, интеграции, клиентские доработки) делаем **пакетными модулями**, а не вшитыми плагинами. В ядре оставляем только платформенный минимум.

### Что остаётся вшитым (bundled / «плагины»)

- Ядро CMS и Module Package Manager
- Платформенные system-модули: Site, Users, Media, Scheduler, и т.п. из `backend/docs/MODULES.md` (пока они часть продукта)
- То, без чего сайт/админка не поднимаются

### Что обязано быть пакетом

- Любая **новая** опциональная фича
- Клиентские / партнёрские / экспериментальные фичи
- Всё, что должно ставиться и обновляться **без** пересборки CMS
- Эталон: `modules-src/demo-kit/`

---

## Новый модуль с нуля (не плагин)

```bash
node scripts/create-module.js my-feature
# правки в modules-src/my-feature/
node scripts/validate-module.js my-feature
node scripts/build-module.js my-feature --yes
# → release/modules/jasefly-module-my-feature-x.y.z.zip
```

Админка: **Модули** → Загрузить → Установить → Включить.  
CLI: `php backend/bin/modules.php install path/to.zip`

Подробности: [platform/MODULE-DEVELOPMENT.md](platform/MODULE-DEVELOPMENT.md), [platform/PLATFORM-SDK.md](platform/PLATFORM-SDK.md), [MODULE-PACKAGES.md](MODULE-PACKAGES.md), [MODULE-MANIFEST.md](MODULE-MANIFEST.md).

---

## Миграция существующего bundled-плагина → пакет

Исходники плагина обычно:

- BE: `backend/src/Modules/{Name}/`
- FE: `frontend/src/modules/{name}/`
- Миграции: `backend/src/Modules/{Name}/migrations/`
- Гейт: `pluginGates` / PluginsPage

Целевой каркас:

```text
modules-src/{slug}/
  module.json
  checksums.json          # пишет build-module.js
  backend/{Studly}Module.php
  migrations/*.sql
  hooks/                  # опционально
  frontend-dist/          # ОБЯЗАТЕЛЬНО на хостинг (без Node)
    manifest.json
    index.js              # (и css при необходимости)
  frontend/src/           # исходники для сборки FE (локально)
```

### Чеклист миграции

1. **Slug** — kebab-case (`newsletter`, `webhooks`). Не менять slug без миграции данных/permissions.
2. **Скелет:** `node scripts/create-module.js {slug}` (или скопировать `modules-src/demo-kit/`).
3. **module.json**
   - `entrypoints.backend`: `backend/{Studly}Module.php`
   - `entrypoints.frontend_manifest`: `frontend-dist/manifest.json`
   - `migrations.path`: `migrations`
   - `permissions`: все `*.view` / `*.manage` плагина
   - `jasefly.api_version`: `1`
4. **Backend**
   - Namespace: `App\PackageModules\{Studly}\…` (не `App\Modules\…`)
   - Класс наследует `App\Core\Modules\AbstractPackageModule`
   - Перенести `registerRoutes`, `adminNav`, сервисы, middleware
   - Не патчить ядро: только свой код + публичные SDK/сервисы CMS
5. **SQL**
   - Скопировать миграции в `modules-src/{slug}/migrations/`
   - Идемпотентность (`IF NOT EXISTS` / безопасные ALTER) — как в bundled
   - Данные uninstall: `install.preserve_data_on_uninstall` + при необходимости `migrations/uninstall/`
6. **Frontend**
   - На хостинге **нет** Vite: только `frontend-dist/`
   - Контракт FE: `export default { slug, version, register(ctx) }`  
     см. `frontend/src/core/packageModuleTypes.ts`
   - В `register(ctx)`:
     - `ctx.registerAdminNavItem(…)`
     - `ctx.registerAdminRoute(…)` — экран админки
     - `ctx.registerPublicRoute(…)` — публичные маршруты
     - `ctx.registerBuilderWidget(…)` — виджеты билдера (type лучше `{slug}.…`)
   - Собрать бандл с `react` / `react-dom` как **external** (использовать React хоста) либо тонкий stub + экраны через host placeholder (как demo-kit)
7. **Права**
   - Объявить в `module.json` → установщик зарегистрирует в `permissions`
   - FE: при необходимости сегмент в `rolePermissions.ts` **только если** экран живёт в ядре; для package-экранов permission задаётся в nav/route модуля
8. **Сборка и проверка**
   ```bash
   node scripts/validate-module.js {slug}
   node scripts/build-module.js {slug} --yes
   php backend/bin/modules.php install release/modules/jasefly-module-{slug}-*.zip
   php backend/bin/modules.php health {slug}
   ```
9. **Вычистить из ядра (после успешного пакета)**
   - Удалить / не грузить `backend/src/Modules/{Name}` и `frontend/src/modules/{name}`
   - Убрать из автодискавери / catalog meta, если больше не bundled
   - Обновить `CMS_MAP.md`, changelog
   - **Не** оставлять два активных модуля с одним slug

### Чего не делать

- Не класть секреты в ZIP
- Не писать файлы вне `api/modules/{slug}`, `public_html/modules/{slug}`, `storage/modules/{slug}`
- Не требовать Node/Composer на shared-хостинге
- Не тащить новую опциональную фичу обратно в `backend/src/Modules/` «потому что так привычнее»

---

## Админские поверхности

| Задача | Где |
| --- | --- |
| Вкл/выкл / настройки **вшитых** фич | `/admin/plugins` |
| Установка / update / health / uninstall **пакетов** | `/admin/modules` |
| Эталонный ZIP | `modules-src/demo-kit/` → `release/modules/jasefly-module-demo-kit-*.zip` |

---

## Для агентов Cursor

1. Новая фича = пакет в `modules-src/{slug}/`, не патч ядра.
2. Перед поиском — `CMS_MAP.md` (Module Package Manager).
3. Деплой ядра: MCP `cms_release`. Деплой фичи клиента: ZIP в `/admin/modules` (или CLI), не смешивать с core zip без нужды.
4. После добавления контура — обновить строку в `CMS_MAP.md`.
