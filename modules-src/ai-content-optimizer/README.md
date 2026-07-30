# AI Content Optimizer

ZIP-модуль Jasefly (не встроенный плагин): SEO-обновление опубликованных материалов через [OpenRouter](https://openrouter.ai).

## Возможности

- Профили по типам контента: blog, pages, projects, products, services
- OpenRouter: несколько API-ключей и моделей с автоматическим failover
- HTTP Proxy (опционально)
- Настраиваемый промпт, поля (title/content/excerpt/SEO), режимы заголовка
- Защита slug, quality gate (min chars / рост / сохранение темы)
- Отметка «Информация обновлена — ДД.ММ.ГГГГ»
- Резервные копии before/after + журнал
- Cron через Scheduler (`ai-content-optimizer.tick`, раз в час при включении)

## Сборка

```bash
php backend/bin/sdk.php certify modules-src/ai-content-optimizer
node scripts/build-module.js ai-content-optimizer --yes
```

ZIP: `release/modules/jasefly-module-ai-content-optimizer-1.0.0.zip`

## Установка

Админка → Модули → загрузить ZIP → Enable.  
Права: `ai-content-optimizer.view|manage|run` (назначить роли).  
Нужен плагин Scheduler для cron; без него доступен ручной запуск.

## Настройка

1. Вставить OpenRouter API keys  
2. Проверить список моделей (бесплатные по умолчанию)  
3. Включить cron или жать «Запуск»  
4. Порог качества и поля — в профиле

По умолчанию slug не меняется.
