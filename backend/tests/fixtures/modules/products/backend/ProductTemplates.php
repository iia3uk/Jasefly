<?php
declare(strict_types=1);

namespace App\PackageModules\Products;

/**
 * Каталог шаблонов витрины товара: layout + поля формы + превью.
 */
final class ProductTemplates
{
    public static function defaultId(): string
    {
        return 'storefront';
    }

    /** @return list<string> */
    public static function ids(): array
    {
        return array_column(self::all(), 'id');
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            self::simple(),
            self::storefront(),
            self::marketplace(),
            self::digital(),
            self::landing(),
        ];
    }

    /** @return array<string, mixed>|null */
    public static function get(string $id): ?array
    {
        foreach (self::all() as $t) {
            if (($t['id'] ?? '') === $id) {
                return $t;
            }
        }
        return null;
    }

    public static function pageSlug(string $id): string
    {
        return 'product-detail-' . $id;
    }

    /**
     * Публичный/админ каталог для UI выбора.
     *
     * @return list<array<string, mixed>>
     */
    public static function catalog(): array
    {
        $out = [];
        foreach (self::all() as $t) {
            $out[] = [
                'id' => $t['id'],
                'title' => $t['title'],
                'description' => $t['description'],
                'preview' => $t['preview'],
                'page_slug' => self::pageSlug((string) $t['id']),
                'fields' => $t['fields'],
                'field_keys' => array_column($t['fields'], 'key'),
            ];
        }
        return $out;
    }

    /**
     * Поля формы товара для шаблона (поверх базовых title/price/…).
     *
     * @return list<array<string, mixed>>
     */
    public static function formFields(string $id): array
    {
        $t = self::get($id) ?? self::get(self::defaultId());
        return is_array($t['fields'] ?? null) ? $t['fields'] : [];
    }

    /** @return list<array<string, mixed>> */
    public static function demoPages(): array
    {
        $out = [];
        foreach (self::all() as $t) {
            $id = (string) $t['id'];
            $out[] = [
                'slug' => self::pageSlug($id),
                'title' => 'Товар: ' . $t['title'],
                'status' => 'published',
                'template' => 'system-commerce',
                'seo_title' => (string) $t['title'],
                'seo_description' => (string) $t['description'],
                'layout' => $t['layout'],
            ];
        }
        // Алиас product-detail → активный по умолчанию (storefront), для совместимости.
        $def = self::get(self::defaultId());
        if ($def) {
            $out[] = [
                'slug' => 'product-detail',
                'title' => 'Страница товара',
                'status' => 'published',
                'template' => 'system-commerce',
                'seo_title' => 'Страница товара',
                'seo_description' => 'Алиас активного шаблона витрины',
                'layout' => $def['layout'],
            ];
        }
        return $out;
    }

    /** Записи для SystemTemplates catalog (админка страниц). */
    public static function systemCatalogEntries(): array
    {
        $entries = [];
        foreach (self::all() as $t) {
            $id = (string) $t['id'];
            $entries[] = [
                'slug' => self::pageSlug($id),
                'title' => 'Товар: ' . $t['title'],
                'group' => 'Коммерция',
                'route' => '/products/{slug}',
                'description' => (string) $t['description'],
                'template' => 'system-commerce',
                'plugin' => 'products',
                'layout' => $t['layout'],
            ];
        }
        return $entries;
    }

    // ─── Templates ───────────────────────────────────────────────

    /** @return array<string, mixed> */
    private static function simple(): array
    {
        return [
            'id' => 'simple',
            'title' => 'Простой',
            'description' => 'Классика: фото слева, название, описание, цена и кнопка «Купить».',
            'preview' => ['#0c0e12', '#6b8cff'],
            'fields' => [
                self::field('short_description', 'Краткое описание', 'textarea'),
                self::field('description', 'Полное описание', 'richtext'),
                self::field('stock', 'Остаток', 'number', 'Пусто = безлимит'),
            ],
            'layout' => self::layoutSimple(),
        ];
    }

    /** @return array<string, mixed> */
    private static function storefront(): array
    {
        return [
            'id' => 'storefront',
            'title' => 'Витрина с тарифами',
            'description' => 'Галерея, бейдж, статистика, тарифы, вкладки — как у цифровых товаров.',
            'preview' => ['#0a0a0c', '#3b82f6'],
            'fields' => [
                self::field('badge', 'Бейдж статуса', 'text', 'Напр. Хит продаж, Новинка'),
                self::field('attrs.category', 'Категория', 'text', 'Показывается над названием'),
                self::field('attrs.detection', 'Гарантия / статус', 'text', 'Напр. 12 месяцев'),
                self::field('short_description', 'Краткое описание', 'textarea'),
                self::field('video_url', 'URL видео', 'url'),
                self::field('sold_count', 'Продано', 'number'),
                self::field('stock', 'Остаток', 'number'),
                self::field('tags', 'Теги', 'json', '["Шаблоны","Дизайн"]'),
                self::field('gallery', 'Галерея media_id', 'json', '[12, 15]'),
                self::field('variants', 'Тарифы', 'json', '[{"label":"12 месяцев","price":1890,"old_price":2490,"highlight":"ВЫГОДНО"}]'),
                self::field('tabs', 'Вкладки', 'json', '[{"label":"Что внутри","html":"<p>…</p>"}]'),
            ],
            'layout' => self::layoutStorefront(),
        ];
    }

    /** @return array<string, mixed> */
    private static function marketplace(): array
    {
        return [
            'id' => 'marketplace',
            'title' => 'Витрина',
            'description' => 'Галерея, параметры, карточка покупки и отзывы — нейтральный layout под стиль сайта.',
            'preview' => ['#0e1219', '#8eb6ff'],
            'fields' => [
                self::field('badge', 'Бейдж', 'text', 'Напр. Хит продаж'),
                self::field('attrs.brand', 'Бренд', 'text'),
                self::field('attrs.original', 'Оригинал (1/0)', 'text', '1 = бейдж «Оригинал»'),
                self::field('attrs.rating', 'Рейтинг', 'text', 'Напр. 4.9'),
                self::field('attrs.reviews_count', 'Число оценок', 'number'),
                self::field('attrs.questions_count', 'Число вопросов', 'number'),
                self::field('attrs.old_price', 'Старая цена', 'number'),
                self::field('attrs.discount_label', 'Скидка', 'text', 'Напр. −24%'),
                self::field('attrs.price_tag', 'Плашка цены', 'text', 'Хорошая цена'),
                self::field('attrs.promo_ends', 'Текст акции', 'text'),
                self::field('attrs.delivery', 'Доставка', 'text', 'Завтра / Мгновенно'),
                self::field('attrs.seller', 'Продавец', 'text'),
                self::field('attrs.seller_rating', 'Рейтинг продавца', 'text'),
                self::field('attrs.specs', 'Характеристики', 'json', '[{"label":"Артикул","value":"…","group":"Основное"}]'),
                self::field('attrs.reviews', 'Отзывы', 'json', '[{"name":"Анна","rating":5,"text":"…","pros":["Качество"]}]'),
                self::field('short_description', 'Краткое описание', 'textarea'),
                self::field('description', 'Полное описание', 'richtext'),
                self::field('gallery', 'Галерея media_id', 'json'),
                self::field('stock', 'Остаток', 'number'),
                self::field('sold_count', 'Продано', 'number'),
            ],
            'layout' => self::layoutMarketplace(),
        ];
    }

    /** @return array<string, mixed> */
    private static function digital(): array
    {
        return [
            'id' => 'digital',
            'title' => 'Цифровой товар',
            'description' => 'Центрированная карточка: бейдж, фичи, одна цена, быстрая покупка.',
            'preview' => ['#0e0a14', '#a78bfa'],
            'fields' => [
                self::field('badge', 'Бейдж', 'text'),
                self::field('short_description', 'Краткое описание', 'textarea'),
                self::field('description', 'Описание / фичи', 'richtext'),
                self::field('attrs.platform', 'Платформа', 'text', 'Windows / Steam / …'),
                self::field('attrs.delivery', 'Доставка', 'text', 'Мгновенно / 24ч'),
                self::field('tags', 'Теги', 'json'),
                self::field('stock', 'Остаток', 'number'),
            ],
            'layout' => self::layoutDigital(),
        ];
    }

    /** @return array<string, mixed> */
    private static function landing(): array
    {
        return [
            'id' => 'landing',
            'title' => 'Лендинг',
            'description' => 'Широкий баннер, описание, CTA и вкладки с деталями внизу.',
            'preview' => ['#081018', '#22d3ee'],
            'fields' => [
                self::field('badge', 'Бейдж', 'text'),
                self::field('short_description', 'Подзаголовок', 'textarea'),
                self::field('description', 'Основной текст', 'richtext'),
                self::field('video_url', 'URL видео', 'url'),
                self::field('gallery', 'Галерея media_id', 'json'),
                self::field('tabs', 'Вкладки', 'json'),
                self::field('tags', 'Теги', 'json'),
            ],
            'layout' => self::layoutLanding(),
        ];
    }

    /**
     * @return array{key:string,label:string,widget:string,help:?string,column:string,attr_key:?string}
     */
    private static function field(string $key, string $label, string $widget, ?string $help = null): array
    {
        $attrKey = null;
        $column = $key;
        if (str_starts_with($key, 'attrs.')) {
            $attrKey = substr($key, strlen('attrs.'));
            $column = 'attrs';
        }
        return [
            'key' => $key,
            'label' => $label,
            'widget' => $widget,
            'help' => $help,
            'column' => $column,
            'attr_key' => $attrKey,
        ];
    }

    // ─── Layouts ─────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private static function layoutSimple(): array
    {
        return [
            'version' => 1,
            'meta' => ['seed' => true, 'useOnSite' => true, 'product_template' => 'simple'],
            'elements' => [[
                'id' => 'sec_simple',
                'elType' => 'section',
                'settings' => ['paddingY' => '2.5rem', 'gap' => '2rem', 'columns' => 2],
                'elements' => [
                    [
                        'id' => 'col_s_media',
                        'elType' => 'column',
                        'settings' => ['width' => 45],
                        'elements' => [[
                            'id' => 'w_s_img',
                            'elType' => 'widget',
                            'widgetType' => 'image',
                            'settings' => [
                                'media_id' => null,
                                'media_id_dynamic' => true,
                                'media_id_bind' => 'media_id',
                                'alt_dynamic' => true,
                                'alt_bind' => 'title',
                                'ratio' => 'square',
                            ],
                            'elements' => [],
                        ]],
                    ],
                    [
                        'id' => 'col_s_info',
                        'elType' => 'column',
                        'settings' => ['width' => 55],
                        'elements' => [
                            self::wHeading('w_s_title', 'title', 'h1', 'xl'),
                            self::wText('w_s_short', 'short_description'),
                            [
                                'id' => 'w_s_price',
                                'elType' => 'widget',
                                'widgetType' => 'product-price',
                                'settings' => ['prefix' => '', 'align' => 'left'],
                                'elements' => [],
                            ],
                            self::wText('w_s_desc', 'description'),
                            [
                                'id' => 'w_s_buy',
                                'elType' => 'widget',
                                'widgetType' => 'product-buy',
                                'settings' => ['label' => 'Купить', 'mode' => 'payment', 'align' => 'left'],
                                'elements' => [],
                            ],
                        ],
                    ],
                ],
            ]],
        ];
    }

    /** @return array<string, mixed> */
    private static function layoutStorefront(): array
    {
        return [
            'version' => 1,
            'meta' => ['seed' => true, 'useOnSite' => true, 'product_template' => 'storefront'],
            'elements' => [
                [
                    'id' => 'sec_sf_main',
                    'elType' => 'section',
                    'settings' => ['paddingY' => '2rem', 'gap' => '1.5rem', 'columns' => 3],
                    'elements' => [
                        [
                            'id' => 'col_sf_media',
                            'elType' => 'column',
                            'settings' => ['width' => 32],
                            'elements' => [
                                [
                                    'id' => 'w_sf_gallery',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-gallery',
                                    'settings' => ['ratio' => 'square'],
                                    'elements' => [],
                                ],
                                [
                                    'id' => 'w_sf_video',
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
                            'id' => 'col_sf_info',
                            'elType' => 'column',
                            'settings' => ['width' => 38],
                            'elements' => [
                                self::wHeading('w_sf_cat', 'attrs.category', 'h4', 'md'),
                                [
                                    'id' => 'w_sf_badge',
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
                                self::wHeading('w_sf_title', 'title', 'h1', 'xl'),
                                [
                                    'id' => 'w_sf_stats',
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
                                    'id' => 'w_sf_expand',
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
                                    'id' => 'w_sf_tags',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-tags',
                                    'settings' => ['prefix' => '# '],
                                    'elements' => [],
                                ],
                            ],
                        ],
                        [
                            'id' => 'col_sf_pay',
                            'elType' => 'column',
                            'settings' => ['width' => 30],
                            'elements' => [[
                                'id' => 'w_sf_variants',
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
                    'id' => 'sec_sf_tabs',
                    'elType' => 'section',
                    'settings' => ['paddingY' => '1rem', 'gap' => '1rem', 'columns' => 1],
                    'elements' => [[
                        'id' => 'col_sf_tabs',
                        'elType' => 'column',
                        'settings' => ['width' => 100],
                        'elements' => [[
                            'id' => 'w_sf_tabs',
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

    /** @return array<string, mixed> */
    private static function layoutMarketplace(): array
    {
        return [
            'version' => 1,
            'meta' => ['seed' => true, 'useOnSite' => true, 'product_template' => 'marketplace'],
            'elements' => [
                [
                    'id' => 'sec_mp_main',
                    'elType' => 'section',
                    'settings' => [
                        'paddingY' => '1.5rem',
                        'gap' => '1.25rem',
                        'columns' => 3,
                    ],
                    'elements' => [
                        [
                            'id' => 'col_mp_gallery',
                            'elType' => 'column',
                            'settings' => ['width' => 40],
                            'elements' => [[
                                'id' => 'w_mp_gallery',
                                'elType' => 'widget',
                                'widgetType' => 'product-mp-gallery',
                                'settings' => [],
                                'elements' => [],
                            ]],
                        ],
                        [
                            'id' => 'col_mp_info',
                            'elType' => 'column',
                            'settings' => ['width' => 35],
                            'elements' => [
                                [
                                    'id' => 'w_mp_title',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-mp-title',
                                    'settings' => [],
                                    'elements' => [],
                                ],
                                [
                                    'id' => 'w_mp_specs',
                                    'elType' => 'widget',
                                    'widgetType' => 'product-mp-specs',
                                    'settings' => [
                                        'preview_limit' => 5,
                                        'open_label' => 'Подробные характеристики',
                                        'tone' => 'site',
                                    ],
                                    'elements' => [],
                                ],
                            ],
                        ],
                        [
                            'id' => 'col_mp_buy',
                            'elType' => 'column',
                            'settings' => ['width' => 25],
                            'elements' => [[
                                'id' => 'w_mp_buy',
                                'elType' => 'widget',
                                'widgetType' => 'product-mp-buy',
                                'settings' => [
                                    'cart_label' => 'Оформить',
                                    'buy_label' => 'Купить',
                                    'tone' => 'site',
                                ],
                                'elements' => [],
                            ]],
                        ],
                    ],
                ],
                [
                    'id' => 'sec_mp_reviews',
                    'elType' => 'section',
                    'settings' => [
                        'paddingY' => '1rem',
                        'gap' => '1rem',
                        'columns' => 1,
                    ],
                    'elements' => [[
                        'id' => 'col_mp_reviews',
                        'elType' => 'column',
                        'settings' => ['width' => 100],
                        'elements' => [[
                            'id' => 'w_mp_reviews',
                            'elType' => 'widget',
                            'widgetType' => 'product-mp-reviews',
                            'settings' => ['all_label' => 'Смотреть все отзывы'],
                            'elements' => [],
                        ]],
                    ]],
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function layoutDigital(): array
    {
        return [
            'version' => 1,
            'meta' => ['seed' => true, 'useOnSite' => true, 'product_template' => 'digital'],
            'elements' => [[
                'id' => 'sec_dig',
                'elType' => 'section',
                'settings' => ['paddingY' => '3rem', 'gap' => '1.25rem', 'columns' => 1],
                'elements' => [[
                    'id' => 'col_dig',
                    'elType' => 'column',
                    'settings' => ['width' => 100],
                    'elements' => [
                        [
                            'id' => 'w_dig_img',
                            'elType' => 'widget',
                            'widgetType' => 'image',
                            'settings' => [
                                'media_id' => null,
                                'media_id_dynamic' => true,
                                'media_id_bind' => 'media_id',
                                'ratio' => '16/9',
                                'alt_dynamic' => true,
                                'alt_bind' => 'title',
                            ],
                            'elements' => [],
                        ],
                        [
                            'id' => 'w_dig_badge',
                            'elType' => 'widget',
                            'widgetType' => 'product-badge',
                            'settings' => [
                                'text_dynamic' => true,
                                'text_bind' => 'badge',
                                'tone' => 'accent',
                            ],
                            'elements' => [],
                        ],
                        self::wHeading('w_dig_title', 'title', 'h1', 'xl', 'center'),
                        self::wHeading('w_dig_plat', 'attrs.platform', 'h4', 'md', 'center'),
                        self::wText('w_dig_short', 'short_description', 'center'),
                        self::wText('w_dig_desc', 'description', 'center'),
                        [
                            'id' => 'w_dig_tags',
                            'elType' => 'widget',
                            'widgetType' => 'product-tags',
                            'settings' => ['prefix' => '# '],
                            'elements' => [],
                        ],
                        [
                            'id' => 'w_dig_price',
                            'elType' => 'widget',
                            'widgetType' => 'product-price',
                            'settings' => ['prefix' => '', 'align' => 'center'],
                            'elements' => [],
                        ],
                        [
                            'id' => 'w_dig_buy',
                            'elType' => 'widget',
                            'widgetType' => 'product-buy',
                            'settings' => ['label' => 'Купить сейчас', 'mode' => 'payment', 'align' => 'center'],
                            'elements' => [],
                        ],
                    ],
                ]],
            ]],
        ];
    }

    /** @return array<string, mixed> */
    private static function layoutLanding(): array
    {
        return [
            'version' => 1,
            'meta' => ['seed' => true, 'useOnSite' => true, 'product_template' => 'landing'],
            'elements' => [
                [
                    'id' => 'sec_land_hero',
                    'elType' => 'section',
                    'settings' => ['paddingY' => '1.5rem', 'gap' => '1.5rem', 'columns' => 1],
                    'elements' => [[
                        'id' => 'col_land_hero',
                        'elType' => 'column',
                        'settings' => ['width' => 100],
                        'elements' => [
                            [
                                'id' => 'w_land_gallery',
                                'elType' => 'widget',
                                'widgetType' => 'product-gallery',
                                'settings' => ['ratio' => '16/9'],
                                'elements' => [],
                            ],
                            [
                                'id' => 'w_land_badge',
                                'elType' => 'widget',
                                'widgetType' => 'product-badge',
                                'settings' => [
                                    'text_dynamic' => true,
                                    'text_bind' => 'badge',
                                    'tone' => 'success',
                                ],
                                'elements' => [],
                            ],
                            self::wHeading('w_land_title', 'title', 'h1', 'xl', 'center'),
                            self::wText('w_land_short', 'short_description', 'center'),
                            [
                                'id' => 'w_land_price',
                                'elType' => 'widget',
                                'widgetType' => 'product-price',
                                'settings' => ['align' => 'center'],
                                'elements' => [],
                            ],
                            [
                                'id' => 'w_land_buy',
                                'elType' => 'widget',
                                'widgetType' => 'product-buy',
                                'settings' => ['label' => 'Заказать', 'mode' => 'payment', 'align' => 'center'],
                                'elements' => [],
                            ],
                            [
                                'id' => 'w_land_video',
                                'elType' => 'widget',
                                'widgetType' => 'product-video',
                                'settings' => [
                                    'url_dynamic' => true,
                                    'url_bind' => 'video_url',
                                    'label' => 'Смотреть обзор',
                                ],
                                'elements' => [],
                            ],
                        ],
                    ]],
                ],
                [
                    'id' => 'sec_land_body',
                    'elType' => 'section',
                    'settings' => ['paddingY' => '1rem', 'gap' => '1.5rem', 'columns' => 1],
                    'elements' => [[
                        'id' => 'col_land_body',
                        'elType' => 'column',
                        'settings' => ['width' => 100],
                        'elements' => [
                            self::wText('w_land_desc', 'description'),
                            [
                                'id' => 'w_land_tabs',
                                'elType' => 'widget',
                                'widgetType' => 'product-tabs',
                                'settings' => [],
                                'elements' => [],
                            ],
                        ],
                    ]],
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function wHeading(string $id, string $bind, string $tag, string $size, string $align = 'left'): array
    {
        return [
            'id' => $id,
            'elType' => 'widget',
            'widgetType' => 'heading',
            'settings' => [
                'text' => '',
                'text_dynamic' => true,
                'text_bind' => $bind,
                'tag' => $tag,
                'size' => $size,
                'align' => $align,
            ],
            'elements' => [],
        ];
    }

    /** @return array<string, mixed> */
    private static function wText(string $id, string $bind, string $align = 'left'): array
    {
        return [
            'id' => $id,
            'elType' => 'widget',
            'widgetType' => 'text',
            'settings' => [
                'html' => '<p></p>',
                'html_dynamic' => true,
                'html_bind' => $bind,
                'align' => $align,
            ],
            'elements' => [],
        ];
    }
}
