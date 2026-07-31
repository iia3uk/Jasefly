<?php
declare(strict_types=1);

/**
 * ModuleQuarantinePolicy criteria (SDK / deps / budgets) — no DB required.
 */

use App\Core\Modules\ModuleManifest;
use App\Services\Modules\ModuleQuarantinePolicy;
use App\Services\Modules\ModuleQuarantineReason;
use App\Services\Modules\ModuleQuarantineViolation;

$app = [
    'version' => '1.0.0',
    'module_quarantine' => [
        'bootstrap_timeout_sec' => 5.0,
        'memory_delta_bytes' => 64 * 1024 * 1024,
        'memory_headroom_bytes' => 8 * 1024 * 1024,
    ],
];
$policy = new ModuleQuarantinePolicy($app);

$okManifest = ModuleManifest::fromArray([
    'slug' => 'policy-ok',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
    'entrypoints' => ['backend' => 'backend/X.php'],
]);
$policy->assertPreload($okManifest, 'policy-ok');
assert_true(true, 'compatible manifest passes preload');

$badSdk = ModuleManifest::fromArray([
    'slug' => 'policy-sdk',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 99, 'min_version' => '1.0.0'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
    'entrypoints' => ['backend' => 'backend/X.php'],
]);
$sdkHit = false;
try {
    $policy->assertPreload($badSdk, 'policy-sdk');
} catch (ModuleQuarantineViolation $e) {
    $sdkHit = $e->reason === ModuleQuarantineReason::SDK_INCOMPATIBLE;
}
assert_true($sdkHit, 'unsupported SDK quarantines with sdk_incompatible');

$missingDep = ModuleManifest::fromArray([
    'slug' => 'policy-dep',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'dependencies' => ['required' => ['does-not-exist-mod' => '>=1.0.0']],
    'entrypoints' => ['backend' => 'backend/X.php'],
]);
$depHit = false;
try {
    $policy->assertPreload($missingDep, 'policy-dep');
} catch (ModuleQuarantineViolation $e) {
    $depHit = $e->reason === ModuleQuarantineReason::MISSING_DEPENDENCY;
}
assert_true($depHit, 'missing required dependency quarantines');

$budgetHit = false;
try {
    $policy->assertBudget(microtime(true) - 6.0, memory_get_usage(true), 'slow-mod');
} catch (ModuleQuarantineViolation $e) {
    $budgetHit = $e->reason === ModuleQuarantineReason::BOOTSTRAP_TIMEOUT;
}
assert_true($budgetHit, 'bootstrap timeout quarantines');

assert_true(
    in_array(ModuleQuarantineReason::MIGRATION_FAILED, ModuleQuarantineReason::all(), true),
    'migration_failed is a registered reason',
);
assert_true(
    in_array(ModuleQuarantineReason::ROUTE_CONFLICT, ModuleQuarantineReason::all(), true),
    'route_conflict is a registered reason',
);
assert_true(
    in_array(ModuleQuarantineReason::MEMORY_LIMIT, ModuleQuarantineReason::all(), true),
    'memory_limit is a registered reason',
);

echo "  ModuleQuarantinePolicy OK\n";
