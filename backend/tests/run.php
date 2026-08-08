<?php
declare(strict_types=1);

/**
 * Lightweight test runner (no PHPUnit dependency).
 *   php backend/tests/run.php
 */

$root = dirname(__DIR__);
require_once "$root/src/Bootstrap.php";
\App\Bootstrap::registerAutoload();

$failed = 0;
$passed = 0;

function assert_true(bool $cond, string $msg): void
{
    global $failed, $passed;
    if ($cond) {
        $passed++;
        echo "  OK  $msg\n";
    } else {
        $failed++;
        echo "  FAIL $msg\n";
    }
}

echo "Jasefly tests\n" . str_repeat('-', 40) . "\n";

// —— Forms unit (no DB) — package / Support ——
$formsPkg = dirname(__DIR__, 2) . '/modules-src/forms/backend';
if (!is_dir($formsPkg)) {
    $formsPkg = "$root/tests/fixtures/modules/forms/backend";
}
require_once "$formsPkg/ConditionalLogic.php";
require_once "$formsPkg/FormValidator.php";
require_once "$root/src/Support/CsvExport.php";

use App\PackageModules\Forms\ConditionalLogic;
use App\PackageModules\Forms\FormValidator;
use App\Support\CsvExport;

$vis = ['op' => 'AND', 'rules' => [['field' => 'x', 'operator' => 'equals', 'value' => '1']]];
assert_true(ConditionalLogic::isVisible($vis, ['x' => '1']) === true, 'conditional equals true');
assert_true(ConditionalLogic::isVisible($vis, ['x' => '2']) === false, 'conditional equals false');

$fields = [
    ['name' => 'email', 'type' => 'email', 'required' => 1, 'validation' => ['email' => true]],
    ['name' => 'extra', 'type' => 'text', 'required' => 1, 'visibility' => ['op' => 'AND', 'rules' => [['field' => 'email', 'operator' => 'equals', 'value' => 'a@b.c']]]],
];
$r1 = FormValidator::validate($fields, ['email' => 'bad']);
assert_true($r1['ok'] === false, 'invalid email fails');
$r2 = FormValidator::validate($fields, ['email' => 'a@b.c']);
assert_true($r2['ok'] === false && isset($r2['errors']['extra']), 'visible required extra fails when empty');
$r3 = FormValidator::validate($fields, ['email' => 'other@x.com']);
assert_true($r3['ok'] === true, 'hidden required field skipped');

assert_true(CsvExport::cell('=cmd') === "'=cmd", 'csv formula escape =');
assert_true(CsvExport::cell('+1') === "'+1", 'csv formula escape +');
$csv = CsvExport::build(['a'], [['=1', 'ok']]);
assert_true(str_contains($csv, "'=1") || str_contains($csv, "'=1"), 'csv build escapes');

// —— Scheduler backoff math ——
require_once "$root/src/Modules/Scheduler/JobHandlerRegistry.php";
\App\Modules\Scheduler\JobHandlerRegistry::register('test.ping', static function (): void {});
assert_true(\App\Modules\Scheduler\JobHandlerRegistry::has('test.ping'), 'job handler registry');

// —— Automation conditions (if present) ——
$condFile = "$root/src/Modules/Automation/ConditionEngine.php";
if (is_file($condFile)) {
    require_once $condFile;
    $engine = new \App\Modules\Automation\ConditionEngine();
    $ctx = ['submission' => ['form_id' => 7, 'email' => 'a@b.c'], 'order' => ['total' => 100]];
    assert_true($engine->matches([
        'path' => 'submission.form_id', 'operator' => 'equals', 'value' => 7,
    ], $ctx) === true, 'automation condition equals path');
    assert_true($engine->matches([
        'path' => 'order.total', 'operator' => 'greater_than', 'value' => 50,
    ], $ctx) === true, 'automation condition greater_than');
    assert_true($engine->matches([
        'path' => 'order.total', 'operator' => 'less_than', 'value' => 10,
    ], $ctx) === false, 'automation condition less_than false');
}

// —— Module package validator (no DB) ——
echo "Module package validator\n";
require_once "$root/tests/ModulePackageValidatorTest.php";

// —— Module package paths (path jail) ——
echo "Module package paths\n";
require_once "$root/tests/ModulePackagePathsTest.php";

// —— SqlTranspiler ——
echo "SqlTranspiler\n";
require_once "$root/tests/SqlTranspilerTest.php";

// —— Package quarantine isolation (broken ZIP must not kill API) ——
echo "Module quarantine isolation\n";
require_once "$root/tests/ModuleQuarantineIsolationTest.php";

echo "Module quarantine policy\n";
require_once "$root/tests/ModuleQuarantinePolicyTest.php";

// —— Diagnostics (safe-mode / loadFailures) ——
echo "Diagnostics\n";
require_once "$root/tests/DiagnosticsTest.php";

// —— Access control (DSL + layout filter) ——
echo "AccessService\n";
require_once "$root/tests/AccessServiceTest.php";

// —— Admin ACL (capabilities / overrides / multi-role) ——
echo "AclAccess\n";
require_once "$root/tests/AclAccessTest.php";

// —— Platform SDK ——
echo "Platform SDK\n";
require_once "$root/tests/PlatformSdkTest.php";

// —— Platform package lifecycle (offline) ——
echo "Platform package lifecycle\n";
require_once "$root/tests/PlatformPackageLifecycleTest.php";

// —— Core migration smoke (SQLite) ——
echo "Migration smoke (SQLite)\n";
require_once "$root/tests/MigrationSmokeTest.php";

// —— SQLite migration compat regressions (rowid triggers / MODIFY / mirror bootstrap) ——
echo "Migration SQLite compat\n";
require_once "$root/tests/MigrationSqliteCompatTest.php";

// —— API route contracts (SQLite for controller ctor) ——
echo "API route contracts\n";
require_once "$root/tests/ApiRouteContractTest.php";

// —— Permission matrix (SQLite) ——
echo "PermissionService\n";
require_once "$root/tests/PermissionServiceTest.php";

// —— Clean install + upgrade-from-previous (SQLite) ——
echo "Clean install / upgrade\n";
require_once "$root/tests/CleanInstallSmokeTest.php";

// —— Package enable sync (installed_modules ↔ modules mirror) ——
echo "Package enable sync\n";
require_once "$root/tests/PackageEnableSyncTest.php";

echo "Package install lifecycle\n";
require_once "$root/tests/PackageInstallLifecycleTest.php";

echo "Blog package boundary\n";
require_once "$root/tests/BlogPackageBoundaryTest.php";

echo "Projects package boundary\n";
require_once "$root/tests/ProjectsPackageBoundaryTest.php";

// —— Webhooks extracted package boundary ——
echo "Webhooks package boundary\n";
require_once "$root/tests/WebhooksPackageBoundaryTest.php";

// —— Comments extracted package boundary ——
echo "Comments package boundary\n";
require_once "$root/tests/CommentsPackageBoundaryTest.php";

// —— Products extracted package boundary ——
echo "Products package boundary\n";
require_once "$root/tests/ProductsPackageBoundaryTest.php";

// —— Orders extracted package boundary ——
echo "Orders package boundary\n";
require_once "$root/tests/OrdersPackageBoundaryTest.php";

// —— Payments extracted package boundary ——
echo "Payments package boundary\n";
require_once "$root/tests/PaymentsPackageBoundaryTest.php";

// —— Forms extracted package boundary ——
echo "Forms package boundary\n";
require_once "$root/tests/FormsPackageBoundaryTest.php";

// —— Analytics extracted package boundary ——
echo "Analytics package boundary\n";
require_once "$root/tests/AnalyticsPackageBoundaryTest.php";

// —— Newsletter extracted package boundary ——
echo "Newsletter package boundary\n";
require_once "$root/tests/NewsletterPackageBoundaryTest.php";

// —— Automation extracted package boundary ——
echo "Automation package boundary\n";
require_once "$root/tests/AutomationPackageBoundaryTest.php";

// —— Notifications extracted package boundary ——
echo "Notifications package boundary\n";
require_once "$root/tests/NotificationsPackageBoundaryTest.php";

// —— Support extracted package boundary ——
echo "Support package boundary\n";
require_once "$root/tests/SupportPackageBoundaryTest.php";

echo "Translate package boundary\n";
require_once "$root/tests/TranslatePackageBoundaryTest.php";

// —— Registration extracted package boundary ——
echo "Registration package boundary\n";
require_once "$root/tests/RegistrationPackageBoundaryTest.php";

// —— Synthetic unknown-slug SDK boundary probe ——
echo "SDK boundary probe\n";
require_once "$root/tests/SdkBoundaryProbeTest.php";
require_once "$root/tests/DualRuntimeZedTest.php";
require_once "$root/tests/PackageSurfaceRegistryTest.php";
require_once "$root/tests/PackageLifecycleParityTest.php";

// —— Synthetic unknown-slug Content Resources probe ——
echo "Zed content resources probe\n";
require_once "$root/tests/ZedContentResourcesProbeTest.php";

require_once "$root/tests/InstalledModuleLoaderHealthPreloadTest.php";

// —— Platform Scheduler package API probe ——
echo "SDK scheduler probe\n";
require_once "$root/tests/SdkSchedulerProbeTest.php";

// —— Projects soft API (Design B) ——
echo "Projects soft API\n";
require_once "$root/tests/ProjectsSoftApiTest.php";

// —— Soft delete empty-all (tables without deleted_at) ——
echo "SoftDelete empty trash\n";
require_once "$root/tests/SoftDeleteEmptyTrashTest.php";

// —— Operation / schedule / snapshot integrity ——
echo "Operation integrity\n";
require_once "$root/tests/OperationIntegrityTest.php";

// —— Router / core hardening ——
echo "Router / core\n";
require_once "$root/tests/RouterTest.php";

// —— Contract governance (API / caps / services / perms / events / MCP) ——
echo "Contract governance\n";
require_once "$root/tests/ContractGovernanceTest.php";

// —— Security verification ——
echo "Security verification\n";
require_once "$root/tests/SecurityVerificationTest.php";

echo "Content ACL security\n";
require_once "$root/tests/ContentAclSecurityTest.php";

echo "Pentest hardening\n";
require_once "$root/tests/PentestHardeningTest.php";

echo "Mail hardening\n";
require_once "$root/tests/MailHardeningTest.php";

echo "MCP dual-secret auth\n";
require_once "$root/tests/McpRequestAuthTest.php";

echo "Telegram deploy approve\n";
require_once "$root/tests/DeployTelegramApproveTest.php";

echo "Demo sandbox\n";
require_once "$root/tests/DemoSandboxTest.php";

// —— Maintainability (shared helpers / error envelope) ——
echo "Maintainability\n";
require_once "$root/tests/MaintainabilityTest.php";

// —— SiteUpdater Vite assets prune ——
echo "SiteUpdater assets prune\n";
require_once "$root/tests/SiteUpdaterAssetsPruneTest.php";

echo "Overload\n";
require_once "$root/tests/OverloadServiceTest.php";

echo str_repeat('-', 40) . "\n";
echo "Passed: $passed  Failed: $failed\n";
exit($failed > 0 ? 1 : 0);
