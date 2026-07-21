<?php
declare(strict_types=1);

namespace App\Modules\Payments\Providers;

// Provider classes are grouped into a few files (not 1:1 PSR-4 filenames).
require_once __DIR__ . '/ProviderInterface.php';
require_once __DIR__ . '/CoreProviders.php';
require_once __DIR__ . '/RuProviders.php';
require_once __DIR__ . '/IntlProviders.php';

/**
 * Registry of all payment providers available in the CMS.
 */
final class ProviderCatalog
{
    /** @var list<ProviderInterface>|null */
    private static ?array $cache = null;

    /** @return list<ProviderInterface> */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        return self::$cache = [
            new ManualProvider(),
            new YooKassaProvider(),
            new TKassaProvider(),
            new RobokassaProvider(),
            new UnitPayProvider(),
            new PayAnyWayProvider(),
            new CloudPaymentsProvider(),
            new SberbankProvider(),
            new AlfaBankProvider(),
            new VtbProvider(),
            new GazprombankProvider(),
            new UbrirProvider(),
            new TochkaProvider(),
            new StripeProvider(),
            new PayPalProvider(),
            new CryptoProvider(),
            new PaddleProvider(),
            new LemonSqueezyProvider(),
            new AdyenProvider(),
        ];
    }

    public static function get(string $id): ?ProviderInterface
    {
        foreach (self::all() as $p) {
            if ($p->id() === $id) {
                return $p;
            }
        }
        return null;
    }

    /**
     * Full settings schema: global fields + per-provider enable + credentials.
     *
     * @return list<array<string, mixed>>
     */
    public static function settingsSchema(): array
    {
        $options = [];
        foreach (self::all() as $p) {
            $options[] = ['value' => $p->id(), 'label' => $p->label()];
        }

        $fields = [
            ['key' => '_heading_general', 'label' => 'Общие настройки', 'type' => 'heading', 'default' => ''],
            ['key' => 'default_provider', 'label' => 'Провайдер по умолчанию', 'type' => 'select', 'default' => 'manual',
                'options' => $options,
                'help' => 'Используется, если покупатель не выбрал способ оплаты'],
            // keep legacy key in sync
            ['key' => 'provider', 'label' => 'Провайдер (устар.)', 'type' => 'select', 'default' => 'manual',
                'options' => $options, 'help' => 'Синоним default_provider — оставлен для совместимости'],
            ['key' => 'test_mode', 'label' => 'Тестовый режим', 'type' => 'checkbox', 'default' => true],
            ['key' => 'currency', 'label' => 'Валюта по умолчанию', 'type' => 'text', 'default' => 'RUB'],
            ['key' => 'currency_symbol', 'label' => 'Символ валюты', 'type' => 'text', 'default' => '₽'],
            ['key' => 'merchant_name', 'label' => 'Название магазина', 'type' => 'text', 'default' => ''],
            ['key' => 'success_url', 'label' => 'URL успешной оплаты', 'type' => 'url', 'default' => '/payment-success'],
            ['key' => 'fail_url', 'label' => 'URL ошибки оплаты', 'type' => 'url', 'default' => '/payment-fail'],
            ['key' => 'webhook_secret', 'label' => 'Общий токен вебхука (?token=)', 'type' => 'text', 'default' => ''],
            ['key' => 'default_amount', 'label' => 'Сумма по умолчанию (режим открытой суммы)', 'type' => 'number', 'default' => 1000],
            ['key' => 'default_description', 'label' => 'Описание платежа по умолчанию', 'type' => 'text', 'default' => 'Оплата услуг'],
            ['key' => 'auto_create_order', 'label' => 'Создавать заказ при оплате', 'type' => 'checkbox', 'default' => true],
            ['key' => 'require_catalog_item', 'label' => 'Требовать услугу/товар (покупка по оферте)', 'type' => 'checkbox', 'default' => true,
                'help' => 'При включённом эквайринге сумма берётся из каталога, свободный «донат» отключён'],
            ['key' => 'allow_open_amount', 'label' => 'Разрешить свободную сумму (донат)', 'type' => 'checkbox', 'default' => false,
                'help' => 'Только если осознанно нужен режим без привязки к услуге/товару'],
            ['key' => '_heading_seller', 'label' => 'Продавец и оферта', 'type' => 'heading', 'default' => ''],
            ['key' => 'offer_title', 'label' => 'Название оферты', 'type' => 'text', 'default' => 'Публичная оферта'],
            ['key' => 'offer_url', 'label' => 'Ссылка на оферту', 'type' => 'url', 'default' => '/offer'],
            ['key' => 'offer_html', 'label' => 'Текст оферты (HTML)', 'type' => 'textarea', 'default' => '',
                'help' => 'Показывается на странице /offer и в блоке согласия на оплате'],
            ['key' => 'seller_name', 'label' => 'Наименование продавца', 'type' => 'text', 'default' => ''],
            ['key' => 'seller_inn', 'label' => 'ИНН', 'type' => 'text', 'default' => ''],
            ['key' => 'seller_ogrn', 'label' => 'ОГРН / ОГРНИП', 'type' => 'text', 'default' => ''],
            ['key' => 'seller_address', 'label' => 'Юридический адрес', 'type' => 'textarea', 'default' => ''],
            ['key' => 'seller_email', 'label' => 'Email продавца', 'type' => 'text', 'default' => ''],
            ['key' => 'seller_phone', 'label' => 'Телефон продавца', 'type' => 'text', 'default' => ''],
            ['key' => 'payment_icons', 'label' => 'Иконки приёма платежей', 'type' => 'text', 'default' => 'mir,visa,mastercard,sbp',
                'help' => 'Список через запятую: mir, visa, mastercard, unionpay, sbp, paypal, applepay, googlepay'],
        ];

        $groups = [
            'ru' => 'Россия',
            'intl' => 'Международные',
            'other' => 'Прочее',
        ];
        // One heading per provider so the admin UI can show a compact
        // master–detail list (section nav + 2-column credentials).
        foreach ($groups as $gid => $glabel) {
            foreach (self::all() as $p) {
                if ($p->group() !== $gid) {
                    continue;
                }
                $fields[] = [
                    'key' => '_heading_' . $p->id(),
                    'label' => $p->label(),
                    'type' => 'heading',
                    'default' => '',
                    'help' => $glabel,
                ];
                $fields[] = [
                    'key' => 'enable_' . $p->id(),
                    'label' => 'Включить',
                    'type' => 'checkbox',
                    'default' => $p->id() === 'manual',
                    'help' => 'Webhook: /api/v1/payments/webhook?provider=' . $p->id(),
                ];
                foreach ($p->credentialFields() as $f) {
                    $fields[] = $f;
                }
            }
        }

        return $fields;
    }

    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        $out = [
            'default_provider' => 'manual',
            'provider' => 'manual',
            'test_mode' => true,
            'currency' => 'RUB',
            'currency_symbol' => '₽',
            'merchant_name' => '',
            'success_url' => '/payment-success',
            'fail_url' => '/payment-fail',
            'webhook_secret' => '',
            'default_amount' => 1000,
            'default_description' => 'Оплата услуг',
            'auto_create_order' => true,
            'require_catalog_item' => true,
            'allow_open_amount' => false,
            'offer_title' => 'Публичная оферта',
            'offer_url' => '/offer',
            'offer_html' => '',
            'seller_name' => '',
            'seller_inn' => '',
            'seller_ogrn' => '',
            'seller_address' => '',
            'seller_email' => '',
            'seller_phone' => '',
            'payment_icons' => 'mir,visa,mastercard,sbp',
            'enable_manual' => true,
        ];
        foreach (self::all() as $p) {
            if ($p->id() !== 'manual') {
                $out['enable_' . $p->id()] = false;
            }
            foreach ($p->credentialFields() as $f) {
                $out[$f['key']] = $f['default'] ?? '';
            }
        }
        return $out;
    }
}
