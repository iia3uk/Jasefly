<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Каталог описаний плагинов для админки «Плагины».
 * Модуль может переопределить description()/longDescription()/category().
 */
final class PluginCatalogMeta
{
    public const CATEGORIES = [
            'core' => 'Ядро',
        'content' => 'Контент',
        'commerce' => 'Коммерция',
        'comms' => 'Коммуникации',
        'security' => 'Безопасность',
        'integrations' => 'Интеграции',
        'other' => 'Прочее',
    ];

    /**
     * @return array{category: string, description: string, long_description: string}
     */
    public static function get(string $name): array
    {
        $all = self::all();
        return $all[$name] ?? [
            'category' => 'other',
            'description' => '',
            'long_description' => '',
        ];
    }

    /**
     * Hard deps: plugin will not enable / will not work without these.
     *
     * @return list<string>
     */
    public static function requires(string $name): array
    {
        return self::dependencyMap()[$name]['requires'] ?? [];
    }

    /**
     * Soft deps: recommended companions (UI only).
     *
     * @return list<string>
     */
    public static function suggests(string $name): array
    {
        return self::dependencyMap()[$name]['suggests'] ?? [];
    }

    /**
     * @return array<string, array{requires: list<string>, suggests: list<string>}>
     */
    public static function dependencyMap(): array
    {
        return [
            'system' => ['requires' => [], 'suggests' => []],
            'users' => ['requires' => ['system'], 'suggests' => []],
            'registration' => [
                'requires' => ['users'],
                'suggests' => ['mail'], // verify email / уведомления
            ],
            'content' => [
                'requires' => ['system'],
                'suggests' => ['media'],
            ],
            'media' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'portfolio' => [
                'requires' => ['content', 'media'],
                'suggests' => ['projects', 'blog'],
            ],
            'projects' => [
                'requires' => ['media'],
                'suggests' => ['portfolio'],
            ],
            'blog' => [
                'requires' => ['media'],
                'suggests' => ['portfolio', 'seo'],
            ],
            'seo' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'template' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'products' => [
                'requires' => ['media'],
                'suggests' => ['payments'],
            ],
            'payments' => [
                'requires' => ['products'],
                'suggests' => ['mail'],
            ],
            'orders' => [
                'requires' => ['products'],
                'suggests' => ['payments'],
            ],
            'comments' => [
                'requires' => ['system'],
                'suggests' => ['orders'],
            ],
            'analytics' => [
                'requires' => ['system'],
                'suggests' => ['scheduler'],
            ],
            'mail' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'ddos' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'translate' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'webhooks' => [
                'requires' => ['system'],
                'suggests' => ['payments'],
            ],
            'support' => [
                'requires' => ['system'],
                'suggests' => ['mail'],
            ],
            'lab' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'scheduler' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'module-manager' => [
                'requires' => ['system'],
                'suggests' => [],
            ],
            'forms' => [
                'requires' => ['system'],
                'suggests' => ['mail'],
            ],
            'notifications' => [
                'requires' => ['system'],
                'suggests' => ['mail'],
            ],
            'automation' => [
                'requires' => ['scheduler'],
                'suggests' => ['forms', 'notifications', 'mail'],
            ],
            'newsletter' => [
                'requires' => ['scheduler'],
                'suggests' => ['mail', 'forms'],
            ],
        ];
    }

    public static function categoryLabel(string $key): string
    {
        return self::CATEGORIES[$key] ?? self::CATEGORIES['other'];
    }

    /**
     * Порядок секций на странице плагинов.
     *
     * @return list<string>
     */
    public static function categoryOrder(): array
    {
        return array_keys(self::CATEGORIES);
    }

    /**
     * @return array<string, array{category: string, description: string, long_description: string}>
     */
    private static function all(): array
    {
        return [
            'system' => [
                'category' => 'core',
                'description' => 'Ядро CMS: настройки сайта, темы, страницы, бэкапы, статус системы.',
                'long_description' => "Базовый плагин, который нельзя отключить.\n\n"
                    . "• Системные страницы и конструктор\n"
                    . "• Тема, SEO-заготовки, навигация\n"
                    . "• Резервные копии, активность, корзина\n"
                    . "• Управление плагинами и служебные API\n\n"
                    . "Без System админка и публичный сайт не работают.",
            ],
            'users' => [
                'category' => 'core',
                'description' => 'Пользователи админки, роли и права доступа.',
                'long_description' => "Учётные записи редакторов и администраторов.\n\n"
                    . "• Создание и удаление пользователей\n"
                    . "• Роли (editor / admin / super_admin)\n"
                    . "• Назначение прав на разделы CMS\n"
                    . "• Вход, сессии, смена пароля\n\n"
                    . "Ядро: отключить нельзя.",
            ],
            'registration' => [
                'category' => 'core',
                'description' => 'Публичная регистрация: форма, роль по умолчанию, подтверждение email.',
                'long_description' => "Самостоятельная регистрация на сайте (/register).\n\n"
                    . "• Вкл/выкл регистрации\n"
                    . "• Роль по умолчанию (member / editor)\n"
                    . "• Подтверждение email через плагин «Почта»\n"
                    . "• Авто-вход, редиректы, согласие с условиями\n"
                    . "• Honeypot, rate limit, капча\n"
                    . "• Шаблон страницы + виджет формы\n\n"
                    . "Member не попадает в админку. Включите плагин и «Разрешить регистрацию».",
            ],
            'portfolio' => [
                'category' => 'content',
                'description' => 'Портфолио: профиль, навыки, опыт, главная, услуги и отзывы.',
                'long_description' => "Продуктовый плагин портфолио поверх ядра CMS.\n\n"
                    . "• Профиль и фото, статистика\n"
                    . "• Опыт, образование, навыки (вкладки)\n"
                    . "• Шаблон главной: Classic (Hero → обо мне → остальное) или Builder\n"
                    . "• Услуги, отзывы, секции homepage\n"
                    . "• Соцсети — в ядре CMS (Оформление → Соцсети), не в этом плагине\n\n"
                    . "Тексты правятся в разделах «Контент»; главная — в настройках плагина.",
            ],
            'projects' => [
                'category' => 'content',
                'description' => 'Кейсы и проекты: карточки, детали, теги и категории.',
                'long_description' => "Каталог работ для публичного раздела /projects.\n\n"
                    . "• Список и страница проекта\n"
                    . "• Обложки, галерея, стек, timeline\n"
                    . "• Категории и теги\n"
                    . "• Избранные проекты на главной\n\n"
                    . "Связан с Медиатекой для обложек.",
            ],
            'blog' => [
                'category' => 'content',
                'description' => 'Блог: посты, категории, теги и превью на главной.',
                'long_description' => "Публикации для /blog.\n\n"
                    . "• Черновики и публикация\n"
                    . "• SEO-поля, анонс, полный текст\n"
                    . "• Категории и теги\n"
                    . "• Превью на главной (если включено в Portfolio)\n\n"
                    . "Можно отключить, если блог не нужен.",
            ],
            'content' => [
                'category' => 'content',
                'description' => 'Публичный API контента: профиль, навыки, опыт, главная, формы.',
                'long_description' => "Слой REST для портфолио-сущностей.\n\n"
                    . "• Отдаёт данные сайту (/api/v1/…)\n"
                    . "• Связывает таблицы профиля, опыта, навыков, homepage\n"
                    . "• Контакты и вспомогательные эндпоинты\n\n"
                    . "Обычно оставляют включённым вместе с Portfolio.",
            ],
            'media' => [
                'category' => 'content',
                'description' => 'Медиатека: загрузка и привязка изображений к контенту.',
                'long_description' => "Хранение файлов на диске и записи в БД.\n\n"
                    . "• Загрузка изображений и документов\n"
                    . "• Папки / категории медиа\n"
                    . "• Выбор обложек в проектах, блоге, профиле\n\n"
                    . "Без Media обложки на сайте не назначаются.",
            ],
            'seo' => [
                'category' => 'content',
                'description' => 'SEO: title/description сайта, sitemap, мета для страниц.',
                'long_description' => "Поисковая оптимизация.\n\n"
                    . "• Глобальные SEO-настройки\n"
                    . "• Sitemap.xml\n"
                    . "• Мета для страниц и записей\n\n"
                    . "Дополняет поля SEO в редакторах контента.",
            ],
            'template' => [
                'category' => 'content',
                'description' => 'Шаблоны и пресеты оформления страниц.',
                'long_description' => "Вспомогательный плагин шаблонов.\n\n"
                    . "• Заготовки layout для конструктора\n"
                    . "• Связка с системными демо-страницами\n\n"
                    . "Нужен, если пользуетесь готовыми шаблонами страниц.",
            ],
            'products' => [
                'category' => 'commerce',
                'description' => 'Витрина товаров: каталог, карточка, шаблоны storefront.',
                'long_description' => "Коммерческий каталог и страница товара.\n\n"
                    . "• Товары с ценой, attrs, tabs, gallery, variants\n"
                    . "• Шаблоны витрины (simple / storefront / digital / landing)\n"
                    . "• Динамические поля формы под выбранный шаблон\n"
                    . "• Связка с Payments для оплаты\n\n"
                    . "Настройки шаблона — в «Коммерция → Шаблоны витрины».",
            ],
            'payments' => [
                'category' => 'commerce',
                'description' => 'Оплата: провайдеры, заказы, страницы success/fail, оферта.',
                'long_description' => "Мультиэквайринг и чекаут.\n\n"
                    . "• Включение провайдеров (ЮKassa и др.)\n"
                    . "• Заказы и статусы платежей\n"
                    . "• Системные страницы оплаты и оферты\n"
                    . "• Иконки способов оплаты, продавец\n\n"
                    . "Работает вместе с Products для покупки с витрины.",
            ],
            'orders' => [
                'category' => 'commerce',
                'description' => 'Заказы, корзины, статусы, возвраты и экспорт.',
                'long_description' => "Полный контур заказов поверх каталога Products.\n\n• Корзины и серверный расчёт итогов\n• История статусов, заметки и возвраты\n• Интеграция с Payments без дублирования orders",
            ],
            'comments' => [
                'category' => 'comms',
                'description' => 'Комментарии и отзывы с модерацией и рейтингами.',
                'long_description' => "Обсуждения и оценки для страниц, постов, проектов и товаров.\n\n• Очередь модерации\n• Проверенная покупка\n• Виджеты комментариев и отзывов",
            ],
            'analytics' => [
                'category' => 'other',
                'description' => 'Приватная аналитика событий и целей без хранения IP.',
                'long_description' => "Встроенная аналитика CMS.\n\n• События, сессии, страницы и цели\n• HMAC-хеши посетителей вместо raw IP\n• Агрегация и retention через Scheduler",
            ],
            'mail' => [
                'category' => 'comms',
                'description' => 'Почта и форма контактов: SMTP, капча, уведомления.',
                'long_description' => "Доставка писем с сайта.\n\n"
                    . "• SMTP (хост, порт, шифрование)\n"
                    . "• Отправитель и получатель заявок\n"
                    . "• Капча (опционально)\n"
                    . "• Виджет формы на страницах\n\n"
                    . "Без корректного SMTP форма «Связаться» не отправит письма.",
            ],
            'ddos' => [
                'category' => 'security',
                'description' => 'Защита от флуда: лимиты запросов и блокировки.',
                'long_description' => "Базовая anti-abuse защита API и форм.\n\n"
                    . "• Rate limit по IP\n"
                    . "• Временные блокировки\n"
                    . "• Настройки порогов в админке\n\n"
                    . "Не заменяет WAF хостинга, но снижает простой флуд.",
            ],
            'translate' => [
                'category' => 'integrations',
                'description' => 'Виджет перевода сайта на лету (как Google Translate).',
                'long_description' => "Оверлей-переводчик для посетителей.\n\n"
                    . "• Кнопка выбора языка на публичном сайте\n"
                    . "• Кэш переводов + прогрев / синк при сохранении\n"
                    . "• DeepL (API key), MyMemory или свой LibreTranslate\n"
                    . "• Настройки в Плагины → Переводчик сайта\n\n"
                    . "Качество машинное — для витрины; DeepL обычно заметно лучше MyMemory.",
            ],
            'webhooks' => [
                'category' => 'integrations',
                'description' => 'Исходящие webhook при событиях CMS (заказы, контент).',
                'long_description' => "Интеграции с внешними системами.\n\n"
                    . "• Подписка на события ядра\n"
                    . "• HTTP-уведомления на ваш URL\n"
                    . "• Полезно для CRM, Telegram-ботов, CI\n\n"
                    . "Включайте, только если настраиваете приёмник.",
            ],
            'support' => [
                'category' => 'comms',
                'description' => 'Живой чат и тикеты: виджет на сайте, inbox в админке, FAQ-бот.',
                'long_description' => "Поддержка посетителей без WebSocket (polling).\n\n"
                    . "• Плавающий виджет чата на публичном сайте\n"
                    . "• Inbox агентов с правом support.agent\n"
                    . "• Контакт (email MX / соцсеть) при уходе со страницы\n"
                    . "• FAQ-бот, если агентов нет онлайн\n"
                    . "• Уведомления: email, Telegram, Discord, Max\n\n"
                    . "Ответы только в админке; мессенджеры — оповещения.",
            ],
            'lab' => [
                'category' => 'other',
                'description' => 'Jasefly Lab: изолированные визуальные и функциональные эксперименты.',
                'long_description' => "Песочница для UI/UX экспериментов без влияния на продакшен.\n\n"
                    . "• Отдельные страницы /lab/:slug вне SiteLayout и темы сайта\n"
                    . "• Frontend entries только из whitelist (experimentRegistry)\n"
                    . "• Черновики, публикация, noindex, soft delete\n"
                    . "• CSS Modules и корневой класс jasefly-lab-{entry}\n\n"
                    . "Не меняет Page Builder, обычные страницы и глобальную тему.",
            ],
            'scheduler' => [
                'category' => 'core',
                'description' => 'Планировщик задач: очередь, cron tick, retry/cancel.',
                'long_description' => "Фоновые задачи CMS без отдельного worker-сервиса.\n\n"
                    . "• Очередь scheduled_jobs + попытки job_attempts\n"
                    . "• CLI: php backend/bin/scheduler.php run\n"
                    . "• HTTP tick по токену или lazy tick при входе в админку\n"
                    . "• Inbox в админке: статус cron, retry, cancel\n\n"
                    . "Базовый системный модуль для отложенных операций.",
            ],
            'module-manager' => [
                'category' => 'core',
                'description' => 'Менеджер модулей: установка, обновление и откат ZIP-пакетов.',
                'long_description' => "Системный модуль Module Package Manager.\n\n"
                    . "• Загрузка и inspect ZIP (module.json + checksums)\n"
                    . "• Install / update / enable / disable / uninstall / rollback\n"
                    . "• Реестр installed_modules, миграции и health-check\n"
                    . "• CLI: php backend/bin/modules.php\n"
                    . "• Публичный SPA loader: GET /api/v1/modules/runtime-assets\n\n"
                    . "Ядро для расширений из api/modules/{slug}.",
            ],
            'forms' => [
                'category' => 'comms',
                'description' => 'Конструктор форм: поля, заявки, виджет form в билдере.',
                'long_description' => "Универсальные формы поверх ядра CMS.\n\n"
                    . "• CRUD форм и полей в админке\n"
                    . "• Inbox заявок со статусами\n"
                    . "• Виджет «Форма» (plugin forms) — GET/POST /forms/{slug}\n"
                    . "• Honeypot, timing, rate limit\n"
                    . "• Legacy contact-form (mail) остаётся отдельно\n\n"
                    . "Рекомендуется вместе с «Почта» для email-экшенов.",
            ],
            'notifications' => [
                'category' => 'comms',
                'description' => 'Внутренние уведомления админки с email и Telegram-доставкой.',
                'long_description' => "Центр уведомлений CMS.\n\n• Колокольчик и inbox\n• Пользовательские и общие сообщения\n• Email / Telegram по настройкам",
            ],
            'automation' => [
                'category' => 'integrations',
                'description' => 'Сценарии по событиям CMS: условия, действия, ветвления и задержки.',
                'long_description' => "No-code автоматизация событий.\n\n• Триггеры форм, заказов и контента\n• Webhook, email, Telegram и уведомления\n• Очередь задержек через Scheduler",
            ],
            'newsletter' => [
                'category' => 'comms',
                'description' => 'Подписчики, double opt-in, списки и email-кампании.',
                'long_description' => "Email-рассылки для сайта.\n\n• Double opt-in и отписка\n• Импорт / экспорт CSV\n• Пакетная отправка через Scheduler",
            ],
        ];
    }
}
