# Импорт контента (JSON → сайт)

Заполните сайт текстом одним файлом — без ручного ввода в каждой вкладке админки. Картинки потом в **Медиатеке**.

## Сценарий

1. Пришлите в чат Cursor весь текст (био, проекты, услуги, контакты…).
2. Агент соберёт `content/content-pack.json`.
3. Вы заливаете файл на хост и запускаете импорт.
4. Меняете только фото/обложки в админке.

## Файлы

| Путь | Назначение |
|------|------------|
| [`content/content-pack.template.json`](content/content-pack.template.json) | Пустой каркас |
| [`content/content-pack.example.json`](content/content-pack.example.json) | Короткий пример |
| [`content/content-pack.schema.json`](content/content-pack.schema.json) | JSON Schema |
| [`content/content-pack.json`](content/content-pack.json) | Ваш готовый пак (создаёт агент) |
| `api/import-content.php` | Импортёр на хосте |

## Что прислать в чат (чеклист)

Скопируйте блоки и заполните:

```
### Профиль
Имя:
Должность:
Краткое био:
Полное био:
Город / локация:
Статус доступности:
Лет опыта:

### Hero (главная)
Заголовок:
Подзаголовок:
Бейдж:
Кнопка 1 (текст + ссылка):
Кнопка 2 (текст + ссылка):

### Контакты
Email, телефон, адрес, город, страна:
Текст после отправки формы:

### Соцсети
GitHub / LinkedIn / Telegram / др. (URL):

### Статистика (цифры на сайте)
Label — значение — суффикс:

### Опыт работы
Компания | роль | даты | описание | технологии:

### Образование
ВУЗ | степень | специальность | даты:

### Навыки
Категории и навыки (%):

### Проекты
Название | slug | коротко | полный текст | роль | ссылки | стек | фичи:

### Блог (если нужно)
Заголовок | slug | анонс | текст | теги:

### Услуги
Название | описание | список фич:

### Товары витрины (новый формат, опционально)
Если шаблон storefront/digital — лучше явный `products[]`:
slug, badge, attrs (category/platform/delivery), tags, tabs[{label,html}], gallery:
(если `products` пуст — импортёр сам развернёт `services` → products)

### Отзывы
Автор | роль | компания | текст | оценка:

### SEO
Title сайта, description, keywords:

### Прочее
Навигация (если нестандартная), политика конфиденциальности:
```

Можно кидать черновиком — агент разложит по полям JSON сам.

## Запуск на Beget

1. Залейте update-пакет (`build-hosting.bat` → **2 Update**), если на хосте ещё нет `import-content.php`.
2. Положите JSON одним из способов:
   - **предпочтительно:** откройте `/import-content.php` (корень сайта) и загрузите файл через форму;
   - или `/api/import-content.php` (нужен актуальный `.htaccess`, иначе REST вернёт `Not found`);
   - или скопируйте в `public_html/api/storage/content-pack.json` и откройте  
     `/import-content.php?force=1&run=1` (с галкой storage / тем же GET).
3. Если видите JSON `{"error":"Not found"}` — запрос попал в API-роутер: обновите корневой `.htaccess` или используйте **корневой** `/import-content.php`.

**Важно:** режим `replace_content` очищает списки контента и обновляет singletons. Пользователь админа и `config.local.php` не трогаются. Медиа на диске не удаляются, но привязки в тексте не проставляются — назначьте обложки вручную.

## MCP (Cursor) — без заливки ZIP на хост

См. [`mcp-cms/README.md`](mcp-cms/README.md).

1. В `config.local.php` задайте `mcp_api_token`.
2. Подключите MCP в Cursor (`CMS_URL` + `CMS_MCP_TOKEN`).
3. Агент пишет pack локально → `cms_apply_content_pack` с `confirm_replace: true` → контент на сайте обновляется по API.

Повторный импорт: `?force=1` или удалите `api/storage/.content_imported`.

После успеха удалите `import-content.php` (и корневый shim).

## CLI (если есть SSH)

```bash
cd ~/…/public_html/api
php import-content.php storage/content-pack.json
# или
php import-content.php /path/to/content-pack.json
```

## Локально

```bash
php backend/import-content.php content/content-pack.example.json
```

Нужен установленный CMS с `backend/config/config.local.php`.

## Миграция услуг → витрина (без полного re-import)

Если контент уже в БД, а шаблон витрины стал развёрнутым:

```bash
cd …/api   # или backend локально
php scripts/migrate-services-to-products.php --template=digital
```

Скрипт upsert’ит товары из `content/content-pack.json` → `products[]` (или из `services`), ставит `storefront_template`, правит ссылки «Услуги» на `/products`. Обложки — вручную в Медиатеке.
