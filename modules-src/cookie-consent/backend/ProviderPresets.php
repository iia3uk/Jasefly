<?php
declare(strict_types=1);

namespace App\PackageModules\CookieConsent;

/**
 * Known analytics/ads provider presets for cookie gate markers.
 * @phpstan-type Preset array{id: string, label: string, category: string, markers: list<string>, script_hints: list<string>}
 */
final class ProviderPresets
{
    /**
     * @return list<Preset>
     */
    public static function all(): array
    {
        return [
            [
                'id' => 'yandex_metrika',
                'label' => 'Яндекс.Метрика',
                'category' => 'analytics',
                'markers' => ['mc.yandex.ru', 'ym(', 'yandex_metrika'],
                'script_hints' => ['mc.yandex.ru/metrika'],
            ],
            [
                'id' => 'google_analytics',
                'label' => 'Google Analytics',
                'category' => 'analytics',
                'markers' => ['google-analytics.com', 'gtag(', 'G-', 'UA-'],
                'script_hints' => ['googletagmanager.com/gtag', 'google-analytics.com/analytics.js'],
            ],
            [
                'id' => 'google_tag_manager',
                'label' => 'Google Tag Manager',
                'category' => 'analytics',
                'markers' => ['googletagmanager.com', 'GTM-'],
                'script_hints' => ['googletagmanager.com/gtm.js'],
            ],
            [
                'id' => 'matomo',
                'label' => 'Matomo',
                'category' => 'analytics',
                'markers' => ['_paq', 'matomo.', 'piwik.'],
                'script_hints' => ['matomo.js', 'piwik.js'],
            ],
            [
                'id' => 'liveinternet',
                'label' => 'LiveInternet',
                'category' => 'analytics',
                'markers' => ['counter.yadro.ru', 'liveinternet'],
                'script_hints' => ['counter.yadro.ru'],
            ],
            [
                'id' => 'yandex_ads',
                'label' => 'Яндекс Реклама',
                'category' => 'marketing',
                'markers' => ['an.yandex.ru', 'yandex_ad', 'Ya.Context'],
                'script_hints' => ['an.yandex.ru'],
            ],
            [
                'id' => 'google_ads',
                'label' => 'Google Ads',
                'category' => 'marketing',
                'markers' => ['googleadservices', 'AW-', 'gtag(\'config\', \'AW-'],
                'script_hints' => ['googleadservices.com', 'www.googleadservices.com'],
            ],
            [
                'id' => 'vk_ads',
                'label' => 'VK Реклама',
                'category' => 'marketing',
                'markers' => ['vk.com/rtrg', 'VK.Retargeting', 'top-fwz1.mail.ru'],
                'script_hints' => ['vk.com/js/api/openapi'],
            ],
            [
                'id' => 'meta_pixel',
                'label' => 'Meta Pixel',
                'category' => 'marketing',
                'markers' => ['fbq(', 'facebook.net/en_US/fbevents', 'connect.facebook.net'],
                'script_hints' => ['connect.facebook.net'],
            ],
            [
                'id' => 'mytarget',
                'label' => 'myTarget',
                'category' => 'marketing',
                'markers' => ['mail.ru/counter', 'top-fwz1.mail.ru', '_tmr'],
                'script_hints' => ['top-fwz1.mail.ru'],
            ],
        ];
    }

    /**
     * @return Preset|null
     */
    public static function get(string $id): ?array
    {
        foreach (self::all() as $p) {
            if ($p['id'] === $id) {
                return $p;
            }
        }
        return null;
    }
}
