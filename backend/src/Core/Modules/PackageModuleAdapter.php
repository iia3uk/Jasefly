<?php
declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Core\PluginCatalogMeta;
use App\Database;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\PlatformContextFactory;
use App\Router;

/**
 * Wraps a package entrypoint class into ModuleInterface for ModuleRegistry.
 */
final class PackageModuleAdapter extends AbstractModule
{
    private bool $platformBooted = false;

    public function __construct(
        private InstallableModuleInterface $inner,
        private ModuleManifest $packageManifest,
    ) {}

    public function name(): string
    {
        return $this->inner->name() !== '' ? $this->inner->name() : $this->packageManifest->slug();
    }

    public function label(): string
    {
        $raw = $this->inner->label() !== '' ? $this->inner->label() : $this->packageManifest->name();
        return PluginCatalogMeta::displayLabel($this->name(), $raw);
    }

    public function description(): string
    {
        $d = $this->inner->description();
        return $d !== '' ? $d : $this->packageManifest->description();
    }

    public function priority(): int
    {
        return $this->inner->priority();
    }

    public function registersRoutesWhenDisabled(): bool
    {
        return $this->inner->registersRoutesWhenDisabled();
    }

    public function requires(): array
    {
        return array_keys($this->packageManifest->requiredDependencies());
    }

    public function suggests(): array
    {
        return array_keys($this->packageManifest->optionalDependencies());
    }

    public function boot(Database $db, array $app): void
    {
        $this->inner->boot($db, $app);
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $this->bootPlatformOnce($router, $db, $app, $apiPrefix);
        $this->inner->registerRoutes($router, $db, $app, $apiPrefix);
    }

    private function bootPlatformOnce(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        if ($this->platformBooted) {
            return;
        }
        $this->platformBooted = true;
        try {
            $paths = ModulePackagePaths::fromApp($app);
            $c = Container::getInstance();
            $events = $c->has(EventDispatcher::class) ? $c->get(EventDispatcher::class) : null;
            if (!$events instanceof EventDispatcher) {
                $events = new EventDispatcher();
            }
            $factory = new PlatformContextFactory($db, $app, $paths, $events);
            $ctx = $factory->withRouter($router, $apiPrefix)->create(
                $this->packageManifest->slug(),
                $this->packageManifest,
            );
            foreach ($this->packageManifest->providedCapabilities() as $cap) {
                $factory->capabilities()->register(
                    $cap,
                    'module.' . $this->packageManifest->slug(),
                    $this->packageManifest->slug(),
                    80,
                );
            }
            $surfaces = $this->packageManifest->surfaces();
            if ($surfaces !== []) {
                $ctx->surfaces()->register($surfaces);
            }
            $this->inner->bootPlatform($ctx);
        } catch (\Throwable $e) {
            @error_log('PackageModuleAdapter bootPlatform ' . $this->packageManifest->slug() . ': ' . $e->getMessage());
            throw $e;
        }
    }

    public function adminNav(): array
    {
        $nav = $this->inner->adminNav();
        $slug = $this->name();
        $out = [];
        foreach ($nav as $item) {
            if (!is_array($item)) {
                continue;
            }
            $path = (string) ($item['path'] ?? '');
            $label = (string) ($item['label'] ?? '');
            if (PluginCatalogMeta::isBrokenLabel($label)) {
                if ($path === '/admin/support/faq' || str_starts_with($path, '/admin/support/faq/')) {
                    $item['label'] = 'FAQ бота';
                } elseif ($slug !== '' && isset(PluginCatalogMeta::LABELS_RU[$slug])) {
                    $item['label'] = PluginCatalogMeta::LABELS_RU[$slug];
                }
            }
            $group = (string) ($item['group'] ?? '');
            if (PluginCatalogMeta::isBrokenLabel($group)) {
                $item['group'] = 'Коммуникации';
            }
            $out[] = $item;
        }
        return $out;
    }

    public function resources(): array
    {
        return $this->inner->resources();
    }

    public function blueprints(): array
    {
        return $this->inner->blueprints();
    }

    public function hooks(): array
    {
        return $this->inner->hooks();
    }

    public function blocks(): array
    {
        return $this->inner->blocks();
    }

    public function publicRoutes(): array
    {
        return $this->inner->publicRoutes();
    }

    public function settingsSchema(): array
    {
        $schema = $this->inner->settingsSchema();
        return $this->repairSchemaLabels($schema);
    }

    /**
     * @param list<array<string, mixed>> $schema
     * @return list<array<string, mixed>>
     */
    private function repairSchemaLabels(array $schema): array
    {
        if ($this->name() !== 'support') {
            return $schema;
        }
        $defaults = [
            'widget_enabled' => 'Показывать виджет чата',
            'widget_title' => 'Заголовок виджета',
            'greeting' => 'Приветствие',
            'position' => 'Позиция',
            'poll_interval_ms' => 'Интервал опроса (мс)',
            'require_contact_on_leave' => 'Требовать контакт при уходе',
            'social_types' => 'Типы соцсетей',
            'bot_fallback' => 'Ответ бота',
            'disposable_domains' => 'Доп. disposable-домены',
            'notify_email' => 'Email-уведомления',
            'notify_email_to' => 'Email получателя',
            'notify_telegram' => 'Telegram',
            'telegram_bot_token' => 'Telegram bot token',
            'telegram_chat_id' => 'Telegram chat id',
            'notify_discord' => 'Discord webhook',
            'discord_webhook_url' => 'Discord webhook URL',
            'notify_max' => 'Max messenger',
            'max_api_url' => 'Max bot API URL',
            'max_bot_token' => 'Max bot token',
            'max_chat_id' => 'Max chat id',
        ];
        $optionDefaults = [
            'bottom-left' => 'Слева внизу',
            'bottom-right' => 'Справа внизу',
        ];
        $out = [];
        foreach ($schema as $field) {
            if (!is_array($field)) {
                continue;
            }
            $key = (string) ($field['key'] ?? '');
            $label = (string) ($field['label'] ?? '');
            if ($key !== '' && isset($defaults[$key]) && PluginCatalogMeta::isBrokenLabel($label)) {
                $field['label'] = $defaults[$key];
            }
            if (isset($field['options']) && is_array($field['options'])) {
                $opts = [];
                foreach ($field['options'] as $opt) {
                    if (!is_array($opt)) {
                        continue;
                    }
                    $val = (string) ($opt['value'] ?? '');
                    $ol = (string) ($opt['label'] ?? '');
                    if ($val !== '' && isset($optionDefaults[$val]) && PluginCatalogMeta::isBrokenLabel($ol)) {
                        $opt['label'] = $optionDefaults[$val];
                    }
                    $opts[] = $opt;
                }
                $field['options'] = $opts;
            }
            $out[] = $field;
        }
        return $out;
    }

    public function settings(): array
    {
        return $this->inner->settings();
    }

    public function demoPages(): array
    {
        return $this->inner->demoPages();
    }

    public function globalMiddleware(Database $db, array $app): array
    {
        return $this->inner->globalMiddleware($db, $app);
    }

    public function packageManifest(): ModuleManifest
    {
        return $this->packageManifest;
    }

    public function inner(): InstallableModuleInterface
    {
        return $this->inner;
    }
}
