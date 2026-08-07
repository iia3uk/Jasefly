<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Contract\ModuleInterface;
use App\Database;
use Throwable;

/**
 * Persists plugin enable/disable state and per-plugin settings in the `modules`
 * table, so the Plugins admin page can toggle and configure plugins at runtime
 * (without editing config files).
 *
 * Resolution rules:
 *  - Core (`system`, `users`, `module-manager`) is always ON.
 *  - isEnabled(): ON only when a row exists with is_enabled=1 (default-off).
 *  - Missing row → OFF (unless core), even if ModuleInterface::enabled() is true.
 *  - ModuleInterface::enabled() still applies as an extra OFF gate when a row is on
 *    (e.g. Template/Automation ship enabled()=false).
 *  - getSettings(): stored JSON merged over the module's declared defaults.
 */
final class PluginStateService
{
    /** @var list<string> */
    public const CORE = ['system', 'users', 'module-manager'];

    /** @var array<string, mixed> */
    private array $appConfig;
    /** @var array<string, array{name:string,is_enabled:bool,settings:?string}>|null */
    private ?array $cache = null;

    /**
     * @param array<string, mixed> $appConfig App config (for the module's own enabled() gate).
     */
    public function __construct(Database $db, array $appConfig = []) {
        $this->db = $db;
        $this->appConfig = $appConfig;
    }

    private Database $db;

    /** True if the module is enabled (default-off when no DB row; core always on). */
    public function isEnabled(ModuleInterface $module): bool
    {
        $name = $module->name();
        if (in_array($name, self::CORE, true)) {
            return true;
        }
        $row = $this->row($name);
        if ($row === null) {
            return false;
        }
        if (!(bool) $row['is_enabled']) {
            return false;
        }
        // Row says on — still honour module config gate (template/automation/…).
        return $module->enabled($this->appConfig);
    }

    /** Enable/disable a module by name. Creates a row if missing. */
    public function setEnabled(string $name, bool $enabled): void
    {
        $this->db->upsert('modules', ['name' => $name, 'is_enabled' => $enabled ? 1 : 0], ['name'], ['is_enabled']);
        $this->cache = null;
    }

    /**
     * Resolved settings: stored JSON merged over the module's defaults.
     *
     * @return array<string, mixed>
     */
    public function getSettings(ModuleInterface $module): array
    {
        $defaults = $module->settings();
        $row = $this->row($module->name());
        $stored = [];
        if ($row && !empty($row['settings'])) {
            $decoded = json_decode((string) $row['settings'], true);
            if (is_array($decoded)) {
                $stored = $decoded;
            }
        }
        return array_merge($defaults, $stored);
    }

    /**
     * Persist settings for a module (only keys present in the schema are kept).
     *
     * @param array<string, mixed> $settings
     */
    public function setSettings(ModuleInterface $module, array $settings): void
    {
        // Keep only keys declared in the schema (plus defaults) to avoid
        // storing arbitrary user input the plugin doesn't understand.
        $allowed = array_merge(
            array_column($module->settingsSchema(), 'key'),
            array_keys($module->settings()),
        );
        $clean = [];
        foreach ($settings as $k => $v) {
            // Skip UI-only schema keys (section headings).
            if (str_starts_with((string) $k, '_heading_')) {
                continue;
            }
            if (in_array($k, $allowed, true)) {
                $clean[$k] = $v;
            }
        }
        $json = json_encode($clean, JSON_UNESCAPED_UNICODE);
        $this->db->upsert('modules', ['name' => $module->name(), 'is_enabled' => 1, 'settings' => $json], ['name'], ['settings']);
        $this->cache = null;
    }

    /**
     * @return array{name:string,is_enabled:bool,settings:?string}|null
     */
    private function row(string $name): ?array
    {
        $rows = $this->rows();
        return $rows[$name] ?? null;
    }

    /**
     * @return array<string, array{name:string,is_enabled:bool,settings:?string}>
     */
    private function rows(): array
    {
        if ($this->cache !== null) {
            return $this->cache;
        }
        $out = [];
        try {
            foreach ($this->db->all('SELECT name, is_enabled, settings FROM `modules`') as $r) {
                $out[(string) $r['name']] = [
                    'name' => (string) $r['name'],
                    'is_enabled' => (bool) (int) $r['is_enabled'],
                    'settings' => isset($r['settings']) ? (string) $r['settings'] : null,
                ];
            }
        } catch (Throwable) {
            // Table not created yet (migration pending) — everything default-off.
        }
        return $this->cache = $out;
    }
}
