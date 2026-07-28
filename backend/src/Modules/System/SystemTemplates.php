<?php
declare(strict_types=1);

namespace App\Modules\System;

/**
 * Каталог системных шаблонов страниц, доступных в билдере.
 * Каждый slug — отдельная редактируемая страница (layout_json).
 */
final class SystemTemplates
{
    /**
     * @return list<array{
     *   slug: string,
     *   title: string,
     *   group: string,
     *   route: string,
     *   description: string,
     *   template: string,
     *   plugin?: string|null,
     *   layout: array<string, mixed>
     * }>
     */
    public static function catalog(): array
    {
        return [
            [
                'slug' => 'about',
                'title' => 'Обо мне',
                'group' => 'Портфолио',
                'route' => '/about',
                'description' => 'Публичная страница «Обо мне» (плагин Portfolio). Seed = превью в билдере; на сайте до сохранения — классическая страница с данными.',
                'template' => 'system',
                'plugin' => 'portfolio',
                'layout' => self::aboutLayout(),
            ],
            [
                'slug' => 'contact',
                'title' => 'Контакты',
                'group' => 'Портфолио',
                'route' => '/contact',
                'description' => 'Форма обратной связи и контакты (плагин Portfolio)',
                'template' => 'system',
                'plugin' => 'portfolio',
                'layout' => self::contactLayout(),
            ],
            [
                'slug' => 'privacy',
                'title' => 'Конфиденциальность',
                'group' => 'Сайт',
                'route' => '/privacy',
                'description' => 'Политика конфиденциальности',
                'template' => 'system',
                'plugin' => null,
                'layout' => self::simpleLayout('Политика конфиденциальности', 'Опишите, какие данные собирает сайт и как они используются.'),
            ],
            [
                'slug' => 'blog',
                'title' => 'Блог (обложка)',
                'group' => 'Портфолио',
                'route' => '/blog',
                'description' => 'Шаблон раздела блога (плагин Portfolio). Пока seed — на сайте классический список постов.',
                'template' => 'system',
                'plugin' => 'portfolio',
                'layout' => self::blogLayout(),
            ],
            [
                'slug' => 'projects',
                'title' => 'Проекты (обложка)',
                'group' => 'Портфолио',
                'route' => '/projects',
                'description' => 'Шаблон раздела проектов (плагин Portfolio)',
                'template' => 'system',
                'plugin' => 'portfolio',
                'layout' => self::projectsLayout(),
            ],
            [
                'slug' => 'services',
                'title' => 'Услуги (обложка)',
                'group' => 'Портфолио',
                'route' => '/services',
                'description' => 'Шаблон раздела услуг (плагин Portfolio)',
                'template' => 'system',
                'plugin' => 'portfolio',
                'layout' => self::servicesLayout(),
            ],
            [
                'slug' => 'not-found',
                'title' => '404 — не найдено',
                'group' => 'Система',
                'route' => '/not-found',
                'description' => 'Шаблон страницы 404',
                'template' => 'system',
                'plugin' => null,
                'layout' => self::simpleLayout('Страница не найдена', 'Такой страницы нет. <a href="/">На главную</a>', 'xl'),
            ],
            [
                'slug' => 'admin-login',
                'title' => 'Вход в админку',
                'group' => 'Авторизация',
                'route' => '/admin/login',
                'description' => 'Шаблон экрана входа и 2FA (виджет «Форма входа»)',
                'template' => 'system-auth',
                'plugin' => null,
                'layout' => self::adminLoginLayout(),
            ],
            [
                'slug' => 'register',
                'title' => 'Регистрация',
                'group' => 'Авторизация',
                'route' => '/register',
                'description' => 'Публичная регистрация (виджет «Форма регистрации», плагин Registration)',
                'template' => 'system-auth',
                'plugin' => 'registration',
                'layout' => self::registerLayout(),
            ],
            [
                'slug' => 'lazy-loader',
                'title' => 'Lazy loader',
                'group' => 'Система',
                'route' => '/lazy-loader',
                'description' => 'Экран загрузки при подгрузке страниц (Suspense). Настраивается в билдере.',
                'template' => 'system-loader',
                'plugin' => null,
                'layout' => self::lazyLoaderLayout(),
            ],
            [
                'slug' => 'maintenance',
                'title' => 'Техобслуживание',
                'group' => 'Система',
                'route' => '/maintenance',
                'description' => 'Экран для гостей при включённом режиме обслуживания. Staff (admin) видит сайт как обычно.',
                'template' => 'system-auth',
                'plugin' => null,
                'layout' => self::maintenanceLayout(),
            ],
            [
                'slug' => 'payment',
                'title' => 'Оплата',
                'group' => 'Коммерция',
                'route' => '/payment',
                'description' => 'Checkout: услуга/товар + оферта + иконки карт',
                'template' => 'system-commerce',
                'plugin' => 'payments',
                'layout' => self::commercePaymentLayout(),
            ],
            [
                'slug' => 'payment-success',
                'title' => 'Оплата успешна',
                'group' => 'Коммерция',
                'route' => '/payment-success',
                'description' => 'Страница успешной оплаты',
                'template' => 'system-commerce',
                'plugin' => 'payments',
                'layout' => self::commerceResultLayout(
                    'Оплата прошла успешно',
                    'Спасибо! Мы получили ваш платёж. <a href="/">На главную</a>',
                ),
            ],
            [
                'slug' => 'payment-fail',
                'title' => 'Ошибка оплаты',
                'group' => 'Коммерция',
                'route' => '/payment-fail',
                'description' => 'Страница неуспешной оплаты',
                'template' => 'system-commerce',
                'plugin' => 'payments',
                'layout' => self::commerceResultLayout(
                    'Оплата не завершена',
                    'Платёж отменён или произошла ошибка. <a href="/payment">Попробовать снова</a>',
                ),
            ],
            [
                'slug' => 'offer',
                'title' => 'Публичная оферта',
                'group' => 'Коммерция',
                'route' => '/offer',
                'description' => 'Текст оферты и реквизиты продавца из настроек Payments',
                'template' => 'system-commerce',
                'plugin' => 'payments',
                'layout' => self::commerceOfferLayout(),
            ],
            [
                'slug' => 'products',
                'title' => 'Товары',
                'group' => 'Коммерция',
                'route' => '/products',
                'description' => 'Каталог товаров (плагин Products)',
                'template' => 'system-commerce',
                'plugin' => 'products',
                'layout' => self::commerceProductsLayout(),
            ],
            [
                'slug' => 'product-card',
                'title' => 'Карточка товара',
                'group' => 'Коммерция',
                'route' => '/product-card',
                'description' => 'Шаблон одной карточки для сетки. Поля с галочкой «Динамическое» берутся из товара.',
                'template' => 'system-commerce',
                'plugin' => 'products',
                'layout' => self::productCardLayout(),
            ],
            [
                'slug' => 'product-detail',
                'title' => 'Страница товара (алиас)',
                'group' => 'Коммерция',
                'route' => '/products/{slug}',
                'description' => 'Алиас; активный шаблон выбирается в Плагины → Products.',
                'template' => 'system-commerce',
                'plugin' => 'products',
                'layout' => class_exists(\App\Modules\Products\ProductTemplates::class)
                    ? (\App\Modules\Products\ProductTemplates::get(\App\Modules\Products\ProductTemplates::defaultId())['layout']
                        ?? self::productDetailLayout())
                    : self::productDetailLayout(),
            ],
            ...self::productTemplateCatalogEntries(),
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function productTemplateCatalogEntries(): array
    {
        if (!class_exists(\App\Modules\Products\ProductTemplates::class)) {
            return [];
        }
        return \App\Modules\Products\ProductTemplates::systemCatalogEntries();
    }

    /** @return list<array<string, mixed>> для PageSeedService / demoPages */
    public static function demoPages(): array
    {
        $out = [];
        foreach (self::catalog() as $t) {
            $out[] = [
                'slug' => $t['slug'],
                'title' => $t['title'],
                'status' => 'published',
                'template' => $t['template'],
                'seo_title' => $t['title'],
                'seo_description' => $t['description'],
                'layout' => $t['layout'],
            ];
        }
        return $out;
    }

    /** @return array<string, mixed> */
    private static function aboutLayout(): array
    {
        return self::sectionsLayout('about', [
            [['type' => 'profile-card', 'settings' => [
                'title' => 'Обо мне',
                'subtitle' => '',
                'cta_label' => 'Связаться',
                'cta_href' => '/contact',
            ]]],
            [['type' => 'skills', 'settings' => ['title' => 'Навыки', 'preset' => 'tabs', 'size' => 'sm']]],
            [['type' => 'experience', 'settings' => ['title' => 'Опыт', 'subtitle' => '']]],
            [['type' => 'cta-banner', 'settings' => [
                'title' => 'Готовы обсудить задачу?',
                'subtitle' => 'Напишите — отвечу в рабочие дни.',
                'cta_label' => 'Написать',
                'cta_href' => '/contact',
            ]]],
        ]);
    }

    /** @return array<string, mixed> */
    private static function projectsLayout(): array
    {
        return self::sectionsLayout('projects', [
            [['type' => 'heading', 'settings' => [
                'text' => 'Проекты',
                'tag' => 'h1',
                'size' => 'xl',
                'align' => 'left',
            ]]],
            [['type' => 'projects-grid', 'settings' => [
                'title' => '',
                'subtitle' => 'Избранные и недавние работы',
                'limit' => 12,
                'featured_only' => false,
            ]]],
        ]);
    }

    /** @return array<string, mixed> */
    private static function blogLayout(): array
    {
        return self::sectionsLayout('blog', [
            [['type' => 'heading', 'settings' => [
                'text' => 'Блог',
                'tag' => 'h1',
                'size' => 'xl',
                'align' => 'left',
            ]]],
            [['type' => 'blog-list', 'settings' => [
                'title' => '',
                'subtitle' => 'Заметки и разборы',
                'limit' => 12,
            ]]],
        ]);
    }

    /** @return array<string, mixed> */
    private static function servicesLayout(): array
    {
        return self::sectionsLayout('services', [
            [['type' => 'heading', 'settings' => [
                'text' => 'Услуги',
                'tag' => 'h1',
                'size' => 'xl',
                'align' => 'left',
            ]]],
            [['type' => 'services', 'settings' => [
                'title' => '',
                'subtitle' => 'Чем могу быть полезен',
            ]]],
        ]);
    }

    /**
     * Несколько секций подряд (как на классической главной).
     *
     * @param list<list<array{type: string, settings?: array<string, mixed>}>> $sections
     * @return array<string, mixed>
     */
    private static function sectionsLayout(string $prefix, array $sections): array
    {
        $elements = [];
        foreach ($sections as $i => $widgets) {
            $wEls = [];
            foreach ($widgets as $j => $w) {
                $wEls[] = [
                    'id' => 'w_' . $prefix . '_' . $i . '_' . $j,
                    'elType' => 'widget',
                    'widgetType' => $w['type'],
                    'settings' => $w['settings'] ?? [],
                    'elements' => [],
                ];
            }
            $elements[] = [
                'id' => 'sec_' . $prefix . '_' . $i,
                'elType' => 'section',
                'settings' => ['paddingY' => '3rem', 'gap' => '1.5rem'],
                'elements' => [[
                    'id' => 'col_' . $prefix . '_' . $i,
                    'elType' => 'column',
                    'settings' => ['width' => 100],
                    'elements' => $wEls,
                ]],
            ];
        }
        return [
            'version' => 1,
            'meta' => ['seed' => true],
            'elements' => $elements,
        ];
    }

    /** @return array<string, mixed> */
    private static function simpleLayout(string $heading, string $html, string $size = 'lg'): array
    {
        return self::wrap([
            [
                'id' => 'w_h_' . substr(md5($heading), 0, 6),
                'elType' => 'widget',
                'widgetType' => 'heading',
                'settings' => [
                    'text' => $heading,
                    'tag' => 'h1',
                    'size' => $size,
                    'align' => 'center',
                ],
                'elements' => [],
            ],
            [
                'id' => 'w_t_' . substr(md5($html), 0, 6),
                'elType' => 'widget',
                'widgetType' => 'text',
                'settings' => [
                    'html' => '<p style="text-align:center">' . $html . '</p>',
                    'align' => 'center',
                ],
                'elements' => [],
            ],
        ]);
    }

    /** @return array<string, mixed> */
    private static function contactLayout(): array
    {
        return self::sectionsLayout('contact', [
            [['type' => 'heading', 'settings' => [
                'text' => 'Связаться',
                'tag' => 'h1',
                'size' => 'xl',
                'align' => 'center',
            ]]],
            [['type' => 'contact-form', 'settings' => ['title' => '', 'subtitle' => '']]],
        ]);
    }

    /** @return array<string, mixed> */
    private static function adminLoginLayout(): array
    {
        $layout = self::wrap([
            [
                'id' => 'w_auth_h',
                'elType' => 'widget',
                'widgetType' => 'heading',
                'settings' => [
                    'text' => 'Jasefly CMS',
                    'tag' => 'h1',
                    'size' => 'lg',
                    'align' => 'center',
                ],
                'elements' => [],
            ],
            [
                'id' => 'w_auth_form',
                'elType' => 'widget',
                'widgetType' => 'auth-login',
                'settings' => [
                    'title' => 'Вход в админку',
                    'subtitle' => 'Email и пароль администратора',
                ],
                'elements' => [],
            ],
        ], 'auth');
        // PreferCmsLayout shows this on /admin/login (classic form is fallback only).
        $layout['meta'] = ['seed' => true, 'useOnSite' => true];
        return $layout;
    }

    /** @return array<string, mixed> */
    private static function registerLayout(): array
    {
        $layout = self::wrap([
            [
                'id' => 'w_reg_h',
                'elType' => 'widget',
                'widgetType' => 'heading',
                'settings' => [
                    'text' => 'Регистрация',
                    'tag' => 'h1',
                    'size' => 'lg',
                    'align' => 'center',
                ],
                'elements' => [],
            ],
            [
                'id' => 'w_reg_form',
                'elType' => 'widget',
                'widgetType' => 'auth-register',
                'settings' => [
                    'title' => 'Создать аккаунт',
                    'subtitle' => 'Email и пароль',
                ],
                'elements' => [],
            ],
        ], 'register');
        $layout['meta'] = ['seed' => true, 'useOnSite' => true];
        return $layout;
    }

    /** @return array<string, mixed> */
    private static function maintenanceLayout(): array
    {
        // Живой шаблон: сразу показывается гостям при maintenance_mode (не seed-пустышка).
        return [
            'version' => 1,
            'meta' => ['seed' => false, 'useOnSite' => true],
            'elements' => [[
                'id' => 'sec_maint',
                'elType' => 'section',
                'settings' => ['paddingY' => '4rem', 'gap' => '1.25rem'],
                'elements' => [[
                    'id' => 'col_maint',
                    'elType' => 'column',
                    'settings' => ['width' => 100],
                    'elements' => [
                        [
                            'id' => 'w_maint_h',
                            'elType' => 'widget',
                            'widgetType' => 'heading',
                            'settings' => [
                                'text' => 'Ведутся технические работы',
                                'tag' => 'h1',
                                'size' => 'xl',
                                'align' => 'center',
                            ],
                            'elements' => [],
                        ],
                        [
                            'id' => 'w_maint_t',
                            'elType' => 'widget',
                            'widgetType' => 'text',
                            'settings' => [
                                'html' => '<p style="text-align:center">Сайт временно недоступен. Загляните позже — мы скоро вернёмся.</p>',
                                'align' => 'center',
                            ],
                            'elements' => [],
                        ],
                        [
                            'id' => 'w_maint_cta',
                            'elType' => 'widget',
                            'widgetType' => 'button',
                            'settings' => [
                                'label' => 'Вход для администратора',
                                'href' => '/admin/login',
                                'align' => 'center',
                                'variant' => 'ghost',
                            ],
                            'elements' => [],
                        ],
                    ],
                ]],
            ]],
        ];
    }

    /** @return array<string, mixed> */
    private static function lazyLoaderLayout(): array
    {
        // Для loader seed сразу «живой»: показывается до первой кастомизации.
        $layout = self::wrap([
            [
                'id' => 'w_loader',
                'elType' => 'widget',
                'widgetType' => 'page-loader',
                'settings' => [
                    'text' => 'Загрузка',
                    'subtitle' => 'Подождите немного…',
                    'variant' => 'spinner',
                    'fullscreen' => true,
                ],
                'elements' => [],
            ],
        ], 'loader');
        $layout['meta'] = ['seed' => true, 'useOnSite' => true];
        return $layout;
    }

    /** @return array<string, mixed> */
    private static function commerceResultLayout(string $heading, string $html): array
    {
        $layout = self::simpleLayout($heading, $html);
        $layout['meta'] = ['seed' => true, 'useOnSite' => true];
        return $layout;
    }

    /** @return array<string, mixed> */
    private static function commercePaymentLayout(): array
    {
        $layout = self::wrap([
            [
                'id' => 'w_pay_checkout',
                'elType' => 'widget',
                'widgetType' => 'payment-checkout',
                'settings' => [
                    'layout' => 'marketplace',
                    'title' => 'Оформление заказа',
                    'subtitle' => 'Проверьте товар и подтвердите оплату',
                    'button_label' => 'Заказать',
                    'show_seller' => true,
                    'show_payment_icons' => true,
                    'show_back' => true,
                ],
                'elements' => [],
            ],
        ], 'pay');
        $layout['meta'] = ['seed' => true, 'useOnSite' => true];
        return $layout;
    }

    /** @return array<string, mixed> */
    private static function commerceOfferLayout(): array
    {
        $layout = self::wrap([
            [
                'id' => 'w_offer_doc',
                'elType' => 'widget',
                'widgetType' => 'offer-document',
                'settings' => ['title' => ''],
                'elements' => [],
            ],
        ], 'offer');
        $layout['meta'] = ['seed' => true, 'useOnSite' => true];
        return $layout;
    }

    /** @return array<string, mixed> */
    private static function commerceProductsLayout(): array
    {
        $layout = self::wrap([
            [
                'id' => 'w_prod_grid',
                'elType' => 'widget',
                'widgetType' => 'products-catalog',
                'settings' => [
                    'title' => 'Товары',
                    'limit' => 24,
                    'columns' => 3,
                    'card_style' => 'market',
                    'show_sidebar' => true,
                    'show_search' => true,
                ],
                'elements' => [],
            ],
        ], 'products');
        $layout['meta'] = ['seed' => true, 'useOnSite' => true];
        return $layout;
    }

    /** Шаблон одной карточки — рендерится в products-grid для каждого товара. */
    private static function productCardLayout(): array
    {
        $layout = self::wrap([
            [
                'id' => 'w_pc_img',
                'elType' => 'widget',
                'widgetType' => 'image',
                'settings' => [
                    'media_id' => null,
                    'media_id_dynamic' => true,
                    'media_id_bind' => 'media_id',
                    'alt' => '',
                    'alt_dynamic' => true,
                    'alt_bind' => 'title',
                    'ratio' => '4/5',
                ],
                'elements' => [],
            ],
            [
                'id' => 'w_pc_title',
                'elType' => 'widget',
                'widgetType' => 'heading',
                'settings' => [
                    'text' => 'Название',
                    'text_dynamic' => true,
                    'text_bind' => 'title',
                    'tag' => 'h3',
                    'size' => 'md',
                    'align' => 'left',
                ],
                'elements' => [],
            ],
            [
                'id' => 'w_pc_desc',
                'elType' => 'widget',
                'widgetType' => 'text',
                'settings' => [
                    'html' => '<p>Краткое описание</p>',
                    'html_dynamic' => true,
                    'html_bind' => 'short_description',
                    'align' => 'left',
                ],
                'elements' => [],
            ],
            [
                'id' => 'w_pc_price',
                'elType' => 'widget',
                'widgetType' => 'product-price',
                'settings' => ['prefix' => '', 'align' => 'left'],
                'elements' => [],
            ],
            [
                'id' => 'w_pc_btn',
                'elType' => 'widget',
                'widgetType' => 'button',
                'settings' => [
                    'label' => 'Подробнее',
                    'href' => '#',
                    'href_dynamic' => true,
                    'href_bind' => 'product_url',
                    'variant' => 'ghost',
                    'align' => 'left',
                ],
                'elements' => [],
            ],
            [
                'id' => 'w_pc_buy',
                'elType' => 'widget',
                'widgetType' => 'product-buy',
                'settings' => ['label' => 'Купить', 'mode' => 'payment', 'align' => 'left'],
                'elements' => [],
            ],
        ], 'pcard');
        $layout['meta'] = ['seed' => true, 'useOnSite' => true];
        // Карточка в сетке — без лишних вертикальных отступов секции.
        $layout['elements'][0]['settings']['paddingY'] = '0';
        $layout['elements'][0]['settings']['gap'] = '0.75rem';
        return $layout;
    }

    /**
     * Шаблон витрины /products/{slug}:
     * медиа | инфо | тарифы, ниже — вкладки. Все поля можно сделать динамическими.
     */
    private static function productDetailLayout(): array
    {
        return [
            'version' => 1,
            'meta' => ['seed' => true, 'useOnSite' => true],
            'elements' => [
                [
                    'id' => 'sec_pdet_main',
                    'elType' => 'section',
                    'settings' => ['paddingY' => '2rem', 'gap' => '1.5rem', 'columns' => 3],
                    'elements' => [
                        [
                            'id' => 'col_pdet_media',
                            'elType' => 'column',
                            'settings' => ['width' => 32],
                            'elements' => [
                                [
                                    'id' => 'w_pd_gallery',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-gallery',
                                    'settings' => ['ratio' => 'square'],
                                    'elements' => [],
                                ],
                                [
                                    'id' => 'w_pd_video',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-video',
                                    'settings' => [
                                        'url' => '',
                                        'url_dynamic' => true,
                                        'url_bind' => 'video_url',
                                        'label' => 'Смотреть видео',
                                    ],
                                    'elements' => [],
                                ],
                            ],
                        ],
                        [
                            'id' => 'col_pdet_info',
                            'elType' => 'column',
                            'settings' => ['width' => 38],
                            'elements' => [
                                [
                                    'id' => 'w_pd_cat',
                                    'elType' => 'widget',
                                    'widgetType' => 'heading',
                                    'settings' => [
                                        'text' => 'CATEGORY',
                                        'text_dynamic' => true,
                                        'text_bind' => 'attrs.category',
                                        'tag' => 'h4',
                                        'size' => 'md',
                                        'align' => 'left',
                                    ],
                                    'elements' => [],
                                ],
                                [
                                    'id' => 'w_pd_badge',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-badge',
                                    'settings' => [
                                        'text' => '',
                                        'text_dynamic' => true,
                                        'text_bind' => 'badge',
                                        'tone' => 'success',
                                    ],
                                    'elements' => [],
                                ],
                                [
                                    'id' => 'w_pd_title',
                                    'elType' => 'widget',
                                    'widgetType' => 'heading',
                                    'settings' => [
                                        'text' => 'Товар',
                                        'text_dynamic' => true,
                                        'text_bind' => 'title',
                                        'tag' => 'h1',
                                        'size' => 'xl',
                                        'align' => 'left',
                                    ],
                                    'elements' => [],
                                ],
                                [
                                    'id' => 'w_pd_stats',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-stats',
                                    'settings' => [
                                        'show_detection' => true,
                                        'show_stock' => true,
                                        'show_sold' => true,
                                    ],
                                    'elements' => [],
                                ],
                                [
                                    'id' => 'w_pd_expand',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-expandable',
                                    'settings' => [
                                        'html' => '',
                                        'html_dynamic' => true,
                                        'html_bind' => 'short_description',
                                        'more_label' => 'Развернуть',
                                        'less_label' => 'Свернуть',
                                    ],
                                    'elements' => [],
                                ],
                                [
                                    'id' => 'w_pd_tags',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-tags',
                                    'settings' => ['prefix' => '# '],
                                    'elements' => [],
                                ],
                            ],
                        ],
                        [
                            'id' => 'col_pdet_checkout',
                            'elType' => 'column',
                            'settings' => ['width' => 30],
                            'elements' => [[
                                'id' => 'w_pd_variants',
                                'elType' => 'widget',
                                'widgetType' => 'product-variants',
                                'settings' => [
                                    'title' => 'Оформление заказа',
                                    'button_label' => 'Перейти к оплате',
                                    'show_promo' => true,
                                    'promo_text' => 'Для этого товара доступен промокод!',
                                    'offer_label' => 'Я согласен с',
                                ],
                                'elements' => [],
                            ]],
                        ],
                    ],
                ],
                [
                    'id' => 'sec_pdet_tabs',
                    'elType' => 'section',
                    'settings' => ['paddingY' => '1rem', 'gap' => '1rem', 'columns' => 1],
                    'elements' => [[
                        'id' => 'col_pdet_tabs',
                        'elType' => 'column',
                        'settings' => ['width' => 100],
                        'elements' => [[
                            'id' => 'w_pd_tabs',
                            'elType' => 'widget',
                            'widgetType' => 'product-tabs',
                            'settings' => ['empty_html' => '<p></p>'],
                            'elements' => [],
                        ]],
                    ]],
                ],
            ],
        ];
    }

    /**
     * @param list<array<string, mixed>> $widgets
     * @return array<string, mixed>
     */
    private static function wrap(array $widgets, string $prefix = 'sys'): array
    {
        return [
            'version' => 1,
            // Заготовки не должны перекрывать живые React-страницы, пока пользователь
            // явно не сохранит шаблон в билдере (флаг seed снимается при save).
            'meta' => ['seed' => true],
            'elements' => [[
                'id' => 'sec_' . $prefix,
                'elType' => 'section',
                'settings' => ['paddingY' => '4rem', 'gap' => '1.5rem'],
                'elements' => [[
                    'id' => 'col_' . $prefix,
                    'elType' => 'column',
                    'settings' => ['width' => 100],
                    'elements' => $widgets,
                ]],
            ]],
        ];
    }

    /**
     * Фразы из заготовок — для пометки уже созданных пустышек в БД.
     *
     * @return list<string>
     */
    public static function seedMarkers(): array
    {
        return [
            'Оформите обложку раздела',
            'Карточки проектов — по /projects',
            'Добавьте заголовок и при необходимости виджеты',
            'Оформите раздел услуг в конструкторе',
            'Расскажите о себе, опыте и подходе',
            'Опишите, какие данные собирает сайт',
            'Такой страницы нет',
            'Добавьте виджеты профиля',
            'Избранные и недавние работы',
            'Чем могу быть полезен',
        ];
    }
}
