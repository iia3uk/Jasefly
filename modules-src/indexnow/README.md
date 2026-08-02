# IndexNow (Jasefly module)

ZIP-модуль для протокола [IndexNow](https://www.indexnow.org/) с акцентом на поддержку Яндекса.

## Возможности

- Генерация ключа (8–128, `a-zA-Z0-9-`)
- Запись файла `/{key}.txt` в корень сайта (имя = ключ, содержимое = ключ)
- Отправка URL на Bing / Яндекс / Seznam (Google **не** поддерживает IndexNow; hub не дублируется с Bing)
- Rate-limit: не бить один endpoint чаще 90с; после 429 — час паузы; не переотправлять тот же URL 15 мин; debounce авто 45с
- Автоотправка при `resource.afterSave` / `afterDelete` / `page.afterPublish`
- Ручная отправка списка или всех опубликованных страниц
- Журнал ответов API (200/202 = успех)

## Установка

1. Соберите ZIP: `node scripts/build-module.js indexnow --yes`
2. В админке: **Модули → Загрузить** пакет `release/modules/jasefly-module-indexnow-1.0.2.zip`
3. Включите модуль → **IndexNow**
4. Нажмите **«Настроить за меня»** (или сгенерируйте ключ вручную) → проверьте, что открывается `https://ваш-сайт/{ключ}.txt`
5. Отправьте тестовый URL; ожидайте HTTP 200 или 202

## Права

- `indexnow.view` — статус и журнал
- `indexnow.manage` — ключ / настройки / файл
- `indexnow.submit` — отправка URL
