<?php
declare(strict_types=1);

namespace App\Core;

use App\Core\Contract\Blueprint;
use App\Core\Contract\ModuleInterface;
use App\Database;
use App\Router;
use App\Services\PluginStateService;

/**
 * Discovers and boots module/plugin packages under App\Modules\*.
 *
 * Adding a new content type = drop a folder under Modules/ that implements
 * ModuleInterface — no edits to core bootstrap required when auto-discovery is on.
 *
 * The registry is the single source of truth for:
 *  - enabled plugins
 *  - aggregated admin navigation
 *  - aggregated blueprints (for auto-migration + generic CRUD + admin UI)
 *  - aggregated builder blocks (metadata only; renderers live on frontend)
 *  - aggregated public routes (for the SPA route map)
 *  - the global EventDispatcher with all plugin hooks wired
 */
final class ModuleRegistry
{
    private EventDispatcher $events;
    private PluginStateService $state;
    /** @var list<ModuleInterface> */
    private array $modules = [];
    /** @var array<string, Blueprint>|null */
    private ?array $blueprintIndex = null;
    /** @var list<array{module:string, stage:string, error:string}> */
    private array $loadFailures = [];

    public function __construct(
        private Database $db,
        private array $app,
        private string $modulesPath
    ) {
        $this->events = new EventDispatcher();
        $this->state = new PluginStateService($db, $app);
    }

    /**
     * A module is "on" when the DB-backed plugins projection says so
     * (modules.is_enabled via PluginStateService; default-on when no row),
     * falling back to the module's own config gate.
     *
     * For package-backed modules, installed_modules.status is the canonical
     * lifecycle persistence; modules.is_enabled is the runtime projection that
     * this method reads. Correctness depends on ModulePluginMirror sync after
     * enable/disable/load-failure; reconcile/diagnostics expose projection drift.
     */
    private function isOn(ModuleInterface $module): bool
    {
        return $this->state->isEnabled($module);
    }

    public function state(): PluginStateService
    {
        return $this->state;
    }

    public function discover(): self
    {
        $dirs = glob($this->modulesPath . '/*', GLOB_ONLYDIR) ?: [];
        $manual = $this->app['modules']['register'] ?? [];

        foreach ($dirs as $dir) {
            $name = basename($dir);
            $class = "App\\Modules\\{$name}\\{$name}Module";
            $file = "$dir/{$name}Module.php";
            // class_exists(..., false) — без autoload: иначе битый модуль валит весь Bootstrap (ParseError).
            if (!class_exists($class, false) && is_file($file)) {
                try {
                    require $file;
                } catch (\Throwable $e) {
                    $msg = $e->getMessage();
                    $this->loadFailures[] = ['module' => $name, 'stage' => 'require', 'error' => $msg];
                    @error_log('ModuleRegistry skip ' . $name . ': ' . $msg);
                    continue;
                }
            }
            if (!class_exists($class, false)) {
                continue;
            }
            try {
                /** @var ModuleInterface $instance */
                $instance = new $class();
                $this->register($instance);
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                $this->loadFailures[] = ['module' => $name, 'stage' => 'construct', 'error' => $msg];
                @error_log('ModuleRegistry boot fail ' . $name . ': ' . $msg);
            }
        }

        foreach ($manual as $class) {
            if (!is_string($class) || $class === '' || !class_exists($class)) {
                continue;
            }
            try {
                $this->register(new $class());
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                $this->loadFailures[] = [
                    'module' => $class,
                    'stage' => 'manual_register',
                    'error' => $msg,
                ];
                @error_log('ModuleRegistry manual register fail ' . $class . ': ' . $msg);
            }
        }

        usort($this->modules, static fn(ModuleInterface $a, ModuleInterface $b) => $a->priority() <=> $b->priority());
        return $this;
    }

    public function register(ModuleInterface $module): void
    {
        foreach ($this->modules as $existing) {
            if ($existing->name() === $module->name()) {
                return;
            }
        }
        $this->modules[] = $module;
    }

    /**
     * Modules that failed to require/construct/boot.
     * Visible in admin system status — not silent.
     *
     * @return list<array{module:string, stage:string, error:string}>
     */
    public function loadFailures(): array
    {
        return $this->loadFailures;
    }

    public function recordLoadFailure(string $module, string $stage, string $error): void
    {
        $this->loadFailures[] = [
            'module' => $module,
            'stage' => $stage,
            'error' => $error,
        ];
    }

    public function boot(): void
    {
        foreach ($this->modules as $module) {
            if ($this->isOn($module)) {
                try {
                    $module->boot($this->db, $this->app);
                    $this->wireHooks($module);
                } catch (\Throwable $e) {
                    $msg = $e->getMessage();
                    $this->loadFailures[] = [
                        'module' => $module->name(),
                        'stage' => 'boot',
                        'error' => $msg,
                    ];
                    @error_log('ModuleRegistry boot() fail ' . $module->name() . ': ' . $msg);
                }
            }
        }
        $this->events->dispatch('module.boot', ['modules' => array_map(fn($m) => $m->name(), $this->all())]);

        // One-time auto-seed of plugin-declared demo/default pages on a fresh
        // install (WordPress-style). Idempotent & additive — existing pages are
        // never touched. Gated by a marker file so it only runs once per install;
        // enabling a plugin later seeds via the toggle handler.
        $this->autoSeedPluginPages();
    }

    /**
     * Seed all enabled plugins' demo pages once per install (marker-gated).
     * Safe to call on every boot: the marker makes the work one-shot.
     */
    private function autoSeedPluginPages(): void
    {
        $storage = rtrim((string) ($this->app['storage'] ?? dirname($this->modulesPath, 2) . '/storage'), '/\\');
        $marker = $storage . '/.pages_seeded';
        if (is_file($marker)) {
            return;
        }
        try {
            $seed = (new \App\Core\Services\PageSeedService($this->db))->seedAll($this->all());
            $this->events->dispatch('pages.seeded', $seed);
        } catch (\Throwable) {
            // pages table may not exist yet (pre-migration) — silently defer;
            // the toggle/manual seed paths and a later boot will retry.
            return;
        }
        @file_put_contents($marker, gmdate(DATE_ATOM));
    }

    private function wireHooks(ModuleInterface $module): void
    {
        foreach ($module->hooks() as $hook) {
            [$event, $handler] = $hook;
            $priority = $hook[2] ?? 0;
            $this->events->subscribe($event, $handler, $priority);
        }
    }

    public function registerRoutes(Router $router, string $apiPrefix): void
    {
        foreach ($this->modules as $module) {
            if ($this->isOn($module) || $module->registersRoutesWhenDisabled()) {
                $module->registerRoutes($router, $this->db, $this->app, $apiPrefix);
            }
        }
    }

    /** Public enable check by machine name (for soft-disabled route handlers). */
    public function isEnabledByName(string $name): bool
    {
        return $this->isNameOn($name);
    }

    /**
     * Aggregated global middleware from enabled plugins (e.g. DDoS edge guard).
     *
     * @return list<callable>
     */
    public function globalMiddleware(): array
    {
        $out = [];
        foreach ($this->all() as $module) {
            foreach ($module->globalMiddleware($this->db, $this->app) as $mw) {
                $out[] = $mw;
            }
        }
        return $out;
    }

    public function events(): EventDispatcher
    {
        return $this->events;
    }

    /** @return list<ModuleInterface> */
    public function all(): array
    {
        return array_values(array_filter(
            $this->modules,
            fn(ModuleInterface $m) => $this->isOn($m)
        ));
    }

    public function get(string $name): ?ModuleInterface
    {
        foreach ($this->modules as $module) {
            if ($module->name() === $name) {
                return $module;
            }
        }
        return null;
    }

    /** Aggregated admin navigation for /api/v1/admin/modules */
    public function adminNav(): array
    {
        $nav = [];
        foreach ($this->all() as $module) {
            foreach ($module->adminNav() as $item) {
                $nav[] = array_merge(['module' => $module->name()], $item);
            }
        }
        return $nav;
    }

    /**
     * Aggregated, normalized blueprints keyed by resource key.
     * Built lazily and cached.
     *
     * @return array<string, Blueprint>
     */
    public function blueprints(): array
    {
        if ($this->blueprintIndex !== null) {
            return $this->blueprintIndex;
        }
        $this->blueprintIndex = [];
        foreach ($this->all() as $module) {
            foreach ($module->blueprints() as $raw) {
                $bp = new Blueprint($raw);
                $this->blueprintIndex[$bp->key()] = $bp;
            }
        }
        return $this->blueprintIndex;
    }

    public function blueprint(string $key): ?Blueprint
    {
        return $this->blueprints()[$key] ?? null;
    }

    /**
     * Aggregated builder block metadata contributed by plugins.
     * Renderers live on the frontend; this is for catalog/tooling.
     *
     * @return list<array<string, mixed>>
     */
    public function blocks(): array
    {
        $blocks = [];
        foreach ($this->all() as $module) {
            foreach ($module->blocks() as $block) {
                $blocks[] = array_merge(['module' => $module->name()], $block);
            }
        }
        return $blocks;
    }

    /**
     * Aggregated public route metadata contributed by plugins.
     * The SPA consumes this to build its route map dynamically.
     *
     * @return list<array<string, mixed>>
     */
    public function publicRoutes(): array
    {
        $routes = [];
        foreach ($this->all() as $module) {
            foreach ($module->publicRoutes() as $route) {
                $routes[] = array_merge(['module' => $module->name()], $route);
            }
        }
        return $routes;
    }

    /**
     * Full catalog of ALL discovered modules (enabled or not), with runtime
     * state + settings, for the Plugins management page.
     */
    public function catalog(): array
    {
        $labels = [];
        foreach ($this->modules as $m) {
            $labels[$m->name()] = $m->label();
        }

        return array_map(function (ModuleInterface $m) use ($labels) {
            $name = $m->name();
            $requires = $m->requires();
            $suggests = $m->suggests();
            $missing = $this->missingRequires($name);
            $requiredBy = $this->requiredByEnabled($name);
            $isCore = in_array($name, ['system', 'users'], true);
            $on = $this->isOn($m);

            $canEnable = !$on;
            $canDisable = $on && !$isCore && $requiredBy === [];

            $blockDisable = null;
            if ($isCore) {
                $blockDisable = 'Ядро нельзя отключить';
            } elseif ($on && $requiredBy !== []) {
                $blockDisable = 'Сначала отключите: ' . implode(', ', array_map(
                    static fn(string $d) => $labels[$d] ?? $d,
                    $requiredBy,
                ));
            }

            return [
                'name' => $name,
                'label' => $m->label(),
                'description' => $m->description(),
                'long_description' => $m->longDescription(),
                'category' => $m->category(),
                'category_label' => PluginCatalogMeta::categoryLabel($m->category()),
                'priority' => $m->priority(),
                'is_enabled' => $on,
                'requires' => $requires,
                'requires_labels' => array_map(fn(string $d) => [
                    'name' => $d,
                    'label' => $labels[$d] ?? $d,
                    'is_enabled' => $this->isNameOn($d),
                ], $requires),
                'suggests' => $suggests,
                'suggests_labels' => array_map(fn(string $d) => [
                    'name' => $d,
                    'label' => $labels[$d] ?? $d,
                    'is_enabled' => $this->isNameOn($d),
                ], $suggests),
                'missing_requires' => $missing,
                'required_by' => $requiredBy,
                'required_by_labels' => array_map(fn(string $d) => [
                    'name' => $d,
                    'label' => $labels[$d] ?? $d,
                ], $requiredBy),
                'can_enable' => $canEnable,
                'can_disable' => $canDisable,
                'block_enable_reason' => (!$on && $missing !== [])
                    ? ('При включении также включатся: ' . implode(', ', array_map(
                        static fn(string $d) => $labels[$d] ?? $d,
                        $missing,
                    )))
                    : null,
                'block_disable_reason' => $blockDisable,
                'settings' => $this->state->getSettings($m),
                'settings_schema' => $m->settingsSchema(),
                'resources' => $m->resources(),
                'admin_nav' => $m->adminNav(),
                'blueprints' => $m->blueprints(),
                'blocks' => $m->blocks(),
                'public_routes' => $m->publicRoutes(),
                'demo_pages' => array_map(fn(array $p) => [
                    'slug' => $p['slug'] ?? '',
                    'title' => $p['title'] ?? '',
                ], $m->demoPages()),
            ];
        }, $this->modules);
    }

    /**
     * Missing hard dependencies (not enabled / not discovered).
     *
     * @return list<string>
     */
    public function missingRequires(string $name): array
    {
        $module = $this->get($name);
        if ($module === null) {
            return [];
        }
        $missing = [];
        foreach ($module->requires() as $dep) {
            if (!$this->isNameOn($dep)) {
                $missing[] = $dep;
            }
        }
        return $missing;
    }

    /**
     * Enabled plugins that list $name in requires().
     *
     * @return list<string>
     */
    public function requiredByEnabled(string $name): array
    {
        $out = [];
        foreach ($this->modules as $m) {
            if ($m->name() === $name) {
                continue;
            }
            if (!$this->isOn($m)) {
                continue;
            }
            if (in_array($name, $m->requires(), true)) {
                $out[] = $m->name();
            }
        }
        return $out;
    }

    /**
     * Enable plugin and all hard deps (depth-first). Returns list of names enabled.
     *
     * @return list<string>
     */
    public function enableWithDependencies(string $name): array
    {
        $module = $this->get($name);
        if ($module === null) {
            throw new \InvalidArgumentException("Plugin not found: {$name}");
        }
        $enabled = [];
        foreach ($module->requires() as $dep) {
            if ($this->isNameOn($dep)) {
                continue;
            }
            if ($this->get($dep) === null) {
                throw new \RuntimeException("Зависимость «{$dep}» не найдена для плагина «{$name}»");
            }
            $enabled = array_merge($enabled, $this->enableWithDependencies($dep));
        }
        if (!$this->isNameOn($name)) {
            $this->state->setEnabled($name, true);
            $enabled[] = $name;
        }
        return array_values(array_unique($enabled));
    }

    private function isNameOn(string $name): bool
    {
        $m = $this->get($name);
        return $m !== null && $this->isOn($m);
    }
}
