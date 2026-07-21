<?php
declare(strict_types=1);

/**
 * CMS plugin scaffolder — vibe-code generator.
 *
 * Usage (from the backend/ directory, with php):
 *   php scripts/make.php make:plugin Blog2
 *   php scripts/make.php make:resource Blog2 posts "title:string,slug:string,content:longtext"
 *   php scripts/make.php make:integration Webhooks
 *
 * Generates a self-contained module under src/Modules/{Name}/ with:
 *   - {Name}Module.php implementing ModuleInterface
 *   - a blueprint for the resource (make:resource)
 *   - admin CRUD routes + admin nav
 *   - a migration SQL file
 *   - a frontend manifest stub
 *
 * The generated plugin is auto-discovered by ModuleRegistry on next request.
 */

function out(string $msg): void { echo $msg . "\n"; }
function err(string $msg): void { fwrite(STDERR, "Error: $msg\n"); exit(1); }

function pascalCase(string $s): string {
    return str_replace(' ', '', ucwords(preg_replace('/[^a-zA-Z0-9]+/', ' ', $s)));
}
function snakeCase(string $s): string {
    return strtolower(preg_replace('/[^a-zA-Z0-9]+/', '_', $s));
}

function modulePath(string $name): string {
    return dirname(__DIR__) . '/src/Modules/' . pascalCase($name);
}

function makePlugin(string $name): void {
    $pc = pascalCase($name);
    $dir = modulePath($name);
    if (is_dir($dir)) {
        err("Module $pc already exists at $dir");
    }
    @mkdir($dir, 0775, true);
    $slug = snakeCase($name);

    $modulePhp = <<<PHP
<?php
declare(strict_types=1);

namespace App\\Modules\\$pc;

use App\\Core\\AbstractModule;
use App\\Controllers\\AdminController;
use App\\Database;
use App\\Middleware\\AuthMiddleware;
use App\\Middleware\\PermissionMiddleware;
use App\\Request;
use App\\Router;
use App\\Services\\PermissionService;

final class {$pc}Module extends AbstractModule
{
    public function name(): string { return '$slug'; }
    public function label(): string { return '$pc'; }
    public function priority(): int { return 50; }

    public function registerRoutes(Router \$router, Database \$db, array \$app, string \$apiPrefix): void
    {
        \$p = fn(string \$path) => rtrim(\$apiPrefix, '/') . \$path;
        \$admin = new AdminController(\$db, \$app);
        \$protected = [new AuthMiddleware(\$app['jwt_secret']), new PermissionMiddleware(new PermissionService(\$db))];

        // TODO: register public + admin routes for your resources.
    }

    public function adminNav(): array
    {
        return [
            // ['group' => 'Content', 'path' => '/admin/$slug', 'label' => '$pc'],
        ];
    }

    public function blueprints(): array
    {
        return [
            // TODO: declare blueprints to get auto-migrations + generic CRUD UI.
        ];
    }
}
PHP;

    file_put_contents("$dir/{$pc}Module.php", $modulePhp);
    @mkdir("$dir/migrations", 0775, true);
    out("Created plugin $pc at $dir");
    out("Next: php scripts/make.php make:resource $name <resource> <fields>");
}

function makeResource(string $pluginName, string $resource, string $fieldsSpec): void
{
    $pc = pascalCase($pluginName);
    $dir = modulePath($pluginName);
    if (!is_dir($dir)) {
        err("Plugin $pc not found. Run make:plugin $pluginName first.");
    }
    $resKey = snakeCase($resource);
    $table = $resKey;

    $fields = array_filter(array_map('trim', explode(',', $fieldsSpec)));
    $columns = [];
    foreach ($fields as $f) {
        [$name, $type] = array_pad(explode(':', $f, 2), 2, 'string');
        $name = snakeCase($name);
        $widget = match ($type) {
            'longtext', 'text' => 'textarea',
            'bool' => 'toggle',
            'int', 'bigint', 'decimal' => 'number',
            'date' => 'date',
            'datetime' => 'datetime',
            'json' => 'json',
            default => 'text',
        };
        $columns[$name] = ['type' => $type, 'widget' => $widget, 'label' => ucfirst(str_replace('_', ' ', $name))];
    }

    // Append blueprint to the module
    $moduleFile = "$dir/{$pc}Module.php";
    $content = file_get_contents($moduleFile);
    $blueprintArray = "            [\n                'key' => '$resKey',\n                'table' => '$table',\n                'label' => '$resKey',\n                'group' => 'Content',\n";
    foreach ($columns as $name => $col) {
        $opts = var_export($col, true);
        $blueprintArray .= "                'columns' => ['$name' => $opts],\n";
    }
    $blueprintArray .= "                'permissions' => ['content.view', 'content.edit'],\n            ],\n";
    $content = str_replace(
        "        // TODO: declare blueprints to get auto-migrations + generic CRUD UI.\n        ];",
        "        return [\n$blueprintArray        ];",
        $content
    );

    // Add admin routes
    $routes = <<<PHP

        \$base = \$p('/admin/$resKey');
        \$router->get(\$base, fn(Request \$r) => \$admin->index(\$r, '$resKey'), \$protected);
        \$router->post(\$base, fn(Request \$r) => \$admin->create(\$r, '$resKey'), \$protected);
        \$router->get("\$base/{id}", fn(Request \$r, \$id) => \$admin->show(\$r, '$resKey', \$id), \$protected);
        \$router->put("\$base/{id}", fn(Request \$r, \$id) => \$admin->update(\$r, '$resKey', \$id), \$protected);
        \$router->delete("\$base/{id}", fn(Request \$r, \$id) => \$admin->delete(\$r, '$resKey', \$id), \$protected);
PHP;
    $content = str_replace(
        "        // TODO: register public + admin routes for your resources.\n    }",
        $routes . "\n    }",
        $content
    );

    // Add admin nav
    $content = str_replace(
        "        // ['group' => 'Content', 'path' => '/admin/$slug', 'label' => '$pc'],",
        "        ['group' => 'Content', 'path' => '/admin/$resKey', 'label' => '$resKey'],",
        $content
    );
    // Fix $slug reference
    $slug = snakeCase($pluginName);
    $content = str_replace("'/admin/$slug'", "'/admin/$resKey'", $content);

    file_put_contents($moduleFile, $content);

    // Generate migration
    $migDir = "$dir/migrations";
    @mkdir($migDir, 0775, true);
    $migNum = count(glob("$migDir/*.sql") ?: []) + 1;
    $colDefs = array_map(fn($n) => "`$n` " . mysqlType($columns[$n]['type']), array_keys($columns));
    $sql = "CREATE TABLE IF NOT EXISTS `$table` (\n  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  " . implode(",\n  ", $colDefs) . "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n";
    file_put_contents("$migDir/" . sprintf('%03d', $migNum) . "_create_$table.sql", $sql);

    out("Added resource $resKey to plugin $pc with migration.");
    out("The migration auto-applies on next admin load (plugin migrations are namespaced).");
}

function mysqlType(string $type): string {
    return match ($type) {
        'string' => 'VARCHAR(255) NULL',
        'text' => 'TEXT NULL',
        'longtext' => 'LONGTEXT NULL',
        'int' => 'INT NULL',
        'bigint' => 'BIGINT NULL',
        'decimal' => 'DECIMAL(12,2) NULL',
        'bool' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'date' => 'DATE NULL',
        'datetime' => 'DATETIME NULL',
        'json' => 'JSON NULL',
        default => 'VARCHAR(255) NULL',
    };
}

function makeIntegration(string $name): void {
    $pc = pascalCase($name);
    makePlugin($name);
    $dir = modulePath($name);
    $slug = snakeCase($name);

    // Add a webhook endpoint + event subscription scaffold to the module.
    $moduleFile = "$dir/{$pc}Module.php";
    $content = file_get_contents($moduleFile);
    $webhookRoute = <<<PHP

        // Webhook receiver endpoint for the integration.
        \$router->post(\$p('/$slug/webhook'), function (Request \$r): void {
            \$payload = \$r->all();
            // TODO: verify signature / authenticate the incoming webhook.
            \$events = Container::getInstance()->get(\\App\\Core\\EventDispatcher::class);
            \$events->dispatch('$slug.webhook', \$payload);
            Response::json(['ok' => true]);
        });
PHP;
    $content = str_replace(
        "        // TODO: register public + admin routes for your resources.\n    }",
        $webhookRoute . "\n    }",
        $content
    );
    $content = str_replace(
        "use App\\Router;",
        "use App\\Core\\Container;\nuse App\\Core\\EventDispatcher;\nuse App\\Response;\nuse App\\Router;",
        $content
    );
    file_put_contents($moduleFile, $content);
    out("Added webhook receiver to integration $pc at POST /api/v1/$slug/webhook");
}

// ── CLI ──────────────────────────────────────────────────────────────────

$argv = $_SERVER['argv'] ?? [];
$cmd = $argv[1] ?? '';
$arg2 = $argv[2] ?? '';
$arg3 = $argv[3] ?? '';
$arg4 = $argv[4] ?? '';

match ($cmd) {
    'make:plugin' => $arg2 === '' ? err('Usage: make:plugin <Name>') : makePlugin($arg2),
    'make:resource' => $arg2 === '' || $arg3 === '' || $arg4 === ''
        ? err('Usage: make:resource <Plugin> <resource> <fields>')
        : makeResource($arg2, $arg3, $arg4),
    'make:integration' => $arg2 === '' ? err('Usage: make:integration <Name>') : makeIntegration($arg2),
    default => err("Unknown command: $cmd\nAvailable: make:plugin, make:resource, make:integration"),
};
