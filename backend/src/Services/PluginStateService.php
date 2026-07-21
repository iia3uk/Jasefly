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
 *  - isEnabled(): a module is ON when its row has is_enabled=1, OR when no row
 *    exists yet (default-on). A row with is_enabled=0 turns it OFF.
 *  - getSettings(): stored JSON merged over the module's declared defaults.
 */
final class PluginStateService
{
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

    /** True if the module is enabled (default-on when no DB row). */
    public function isEnabled(ModuleInterface $module): bool
    {
        $row = $this->row($module->name());
        if ($row === null) {
            // No explicit state → respect the module's own config gate.
            return $module->enabled($this->appConfig);
        }
        return (bool) $row['is_enabled'];
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
            // Table not created yet (migration pending) — everything default-on.
        }
        return $this->cache = $out;
    }
}
