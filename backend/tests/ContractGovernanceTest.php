<?php
declare(strict_types=1);

/**
 * Priority 5 — Contract governance freezes (API / caps / services / perms / events / MCP / content-pack).
 * Included from run.php (uses global assert_true).
 */

use App\Platform\Analysis\ApiSnapshot;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Capabilities\ServiceRegistry;

$repoRoot = dirname(__DIR__, 2);
$manifestDir = dirname(__DIR__) . '/src/Platform/Manifest';
$analysisDir = dirname(__DIR__) . '/src/Platform/Analysis';

// —— Public API snapshot diff ——
$api = new ApiSnapshot();
$diff = $api->diff();
assert_true($diff['ok'] === true, 'api-diff ok (no breaking public contract changes)');
if ($diff['ok'] !== true) {
    foreach (array_slice($diff['breaking'] ?? [], 0, 5) as $b) {
        echo "    · {$b}\n";
    }
}

// —— Core capabilities freeze ——
$capsSnapPath = $manifestDir . '/capabilities.v1.json';
assert_true(is_file($capsSnapPath), 'capabilities.v1.json exists');
$capsSnap = json_decode((string) file_get_contents($capsSnapPath), true);
$frozenCaps = is_array($capsSnap['capabilities'] ?? null) ? $capsSnap['capabilities'] : [];
assert_true($frozenCaps !== [], 'capabilities snapshot non-empty');

$liveCaps = new CapabilityRegistry(null);
$missingCaps = [];
foreach ($frozenCaps as $cap) {
    if (!$liveCaps->has((string) $cap)) {
        $missingCaps[] = $cap;
    }
}
assert_true($missingCaps === [], 'all frozen core capabilities present in CapabilityRegistry');
if ($missingCaps !== []) {
    echo '    missing: ' . implode(', ', $missingCaps) . "\n";
}

$liveList = $liveCaps->list();
sort($liveList);
$frozenSorted = $frozenCaps;
sort($frozenSorted);
$extraCoreGone = array_values(array_diff($frozenSorted, $liveList));
assert_true($extraCoreGone === [], 'no frozen capability removed from registry list');

// —— Service catalog ↔ sdk-policy ——
$policyPath = $analysisDir . '/sdk-policy.json';
assert_true(is_file($policyPath), 'sdk-policy.json exists');
$policy = json_decode((string) file_get_contents($policyPath), true);
$allowed = is_array($policy['allowed_service_ids'] ?? null) ? $policy['allowed_service_ids'] : [];
$catalog = array_keys(ServiceRegistry::PUBLIC_CATALOG);
sort($allowed);
sort($catalog);
assert_true($allowed === $catalog, 'ServiceRegistry::PUBLIC_CATALOG matches sdk-policy allowed_service_ids');
if ($allowed !== $catalog) {
    echo '    only_in_policy: ' . implode(', ', array_diff($allowed, $catalog)) . "\n";
    echo '    only_in_catalog: ' . implode(', ', array_diff($catalog, $allowed)) . "\n";
}

// —— Core permissions freeze (migrations + FE mirror) ——
$permSnapPath = $manifestDir . '/permissions-core.v1.json';
assert_true(is_file($permSnapPath), 'permissions-core.v1.json exists');
$permSnap = json_decode((string) file_get_contents($permSnapPath), true);
$frozenPerms = is_array($permSnap['permissions'] ?? null) ? $permSnap['permissions'] : [];
assert_true($frozenPerms !== [], 'permissions-core snapshot non-empty');

$migrationBlob = '';
foreach (glob($repoRoot . '/backend/migrations/*.sql') ?: [] as $sqlFile) {
    $migrationBlob .= (string) file_get_contents($sqlFile) . "\n";
}
$missingInMigrations = [];
foreach ($frozenPerms as $perm) {
    if (!str_contains($migrationBlob, "'" . $perm . "'") && !str_contains($migrationBlob, '"' . $perm . '"')) {
        $missingInMigrations[] = $perm;
    }
}
assert_true($missingInMigrations === [], 'core permissions still declared in migrations');

$fePermsPath = $repoRoot . '/frontend/src/admin/rolePermissions.ts';
assert_true(is_file($fePermsPath), 'rolePermissions.ts exists');
$feSrc = (string) file_get_contents($fePermsPath);
$missingInFe = [];
foreach ($frozenPerms as $perm) {
    if (!str_contains($feSrc, "'" . $perm . "'")) {
        $missingInFe[] = $perm;
    }
}
assert_true($missingInFe === [], 'core permissions still mirrored in FE rolePermissions');

// —— Core events freeze (identifiers still dispatched somewhere) ——
$eventsSnapPath = $manifestDir . '/events-core.v1.json';
assert_true(is_file($eventsSnapPath), 'events-core.v1.json exists');
$eventsSnap = json_decode((string) file_get_contents($eventsSnapPath), true);
$frozenEvents = is_array($eventsSnap['events'] ?? null) ? $eventsSnap['events'] : [];
assert_true($frozenEvents !== [], 'events-core snapshot non-empty');

$phpBlob = '';
$scanRoots = [
    $repoRoot . '/backend/src/Controllers',
    $repoRoot . '/backend/src/Core',
    $repoRoot . '/backend/src/Modules',
    // Extracted ZIP packages (CI SoT) may own frozen event identifiers via PlatformEvents::publish
    $repoRoot . '/backend/tests/fixtures/modules',
];
foreach ($scanRoots as $dir) {
    if (!is_dir($dir)) {
        continue;
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        /** @var SplFileInfo $file */
        if ($file->isFile() && str_ends_with($file->getFilename(), '.php')) {
            $phpBlob .= (string) file_get_contents($file->getPathname()) . "\n";
        }
    }
}
$missingEvents = [];
foreach ($frozenEvents as $event) {
    $needles = [
        "dispatch('" . $event . "'",
        'dispatch("' . $event . '"',
        "publish('" . $event . "'",
        'publish("' . $event . '"',
    ];
    $found = false;
    foreach ($needles as $needle) {
        if (str_contains($phpBlob, $needle)) {
            $found = true;
            break;
        }
    }
    if (!$found) {
        $missingEvents[] = $event;
    }
}
assert_true($missingEvents === [], 'core event identifiers still dispatched in backend');
if ($missingEvents !== []) {
    echo '    missing events: ' . implode(', ', $missingEvents) . "\n";
}

// —— MCP tools freeze ——
$mcpSnapPath = $repoRoot . '/mcp-cms/manifest/mcp-tools.v1.json';
$mcpIndex = $repoRoot . '/mcp-cms/src/index.js';
assert_true(is_file($mcpSnapPath), 'mcp-tools.v1.json exists');
assert_true(is_file($mcpIndex), 'mcp-cms index.js exists');
$mcpSnap = json_decode((string) file_get_contents($mcpSnapPath), true);
$frozenTools = is_array($mcpSnap['tools'] ?? null) ? $mcpSnap['tools'] : [];
$mcpSrc = (string) file_get_contents($mcpIndex);
preg_match_all("/server\\.tool\\(\\s*['\"]([^'\"]+)['\"]/", $mcpSrc, $m);
$liveTools = array_values(array_unique($m[1] ?? []));
sort($frozenTools);
sort($liveTools);
$removedTools = array_values(array_diff($frozenTools, $liveTools));
assert_true($removedTools === [], 'no MCP tools removed vs mcp-tools.v1.json');
if ($removedTools !== []) {
    echo '    removed: ' . implode(', ', $removedTools) . "\n";
}
// Additive tools are allowed; warn via count only when equal or greater
assert_true(count($liveTools) >= count($frozenTools), 'MCP tool count not below snapshot');

// —— Content pack schema smoke ——
$schemaPath = $repoRoot . '/content/content-pack.schema.json';
assert_true(is_file($schemaPath), 'content-pack.schema.json exists');
$schema = json_decode((string) file_get_contents($schemaPath), true);
assert_true(is_array($schema), 'content-pack.schema.json is valid JSON');
assert_true(($schema['title'] ?? '') !== '', 'content-pack schema has title');
assert_true(in_array('version', $schema['required'] ?? [], true), 'content-pack schema requires version');
assert_true(($schema['properties']['version']['const'] ?? null) === 1, 'content-pack schema version const=1');
assert_true(($schema['additionalProperties'] ?? true) === false, 'content-pack schema forbids unknown top-level keys');
