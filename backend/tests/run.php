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

require_once __DIR__ . '/_package_dir.php';

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

// вЂ”вЂ” Forms unit (no DB) вЂ” package / Support вЂ”вЂ”
$repoRoot = dirname(__DIR__, 2);
$formsPkg = null;
foreach ([
    $repoRoot . '/Jasefly-Modules/modules-src/forms/backend',
    $repoRoot . '/modules-src/forms/backend',
    "$root/tests/fixtures/modules/forms/backend",
] as $cand) {
    if (is_dir($cand)) {
        $formsPkg = $cand;
        break;
    }
}
if ($formsPkg === null) {
    throw new RuntimeException('forms package backend not found (Jasefly-Modules / fixtures)');
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

// вЂ”вЂ” Scheduler backoff math вЂ”вЂ”
require_once "$root/src/Modules/Scheduler/JobHandlerRegistry.php";
\App\Modules\Scheduler\JobHandlerRegistry::register('test.ping', static function (): void {});
assert_true(\App\Modules\Scheduler\JobHandlerRegistry::has('test.ping'), 'job handler registry');

// вЂ”вЂ” Automation conditions (if present) вЂ”вЂ”
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

// вЂ”вЂ” Module package validator (no DB) вЂ”вЂ”
echo "Module package validator\n";
require_once "$root/tests/ModulePackageValidatorTest.php";

// вЂ”вЂ” Module package paths (path jail) вЂ”вЂ”
echo "Module package paths\n";
require_once "$root/tests/ModulePackagePathsTest.php";

// вЂ”вЂ” SqlTranspiler вЂ”вЂ”
echo "SqlTranspiler\n";
require_once "$root/tests/SqlTranspilerTest.php";

// вЂ”вЂ” Package quarantine isolation (broken ZIP must not kill API) вЂ”вЂ”
echo "Module quarantine isolation\n";
require_once "$root/tests/ModuleQuarantineIsolationTest.php";

echo "Module quarantine policy\n";
require_once "$root/tests/ModuleQuarantinePolicyTest.php";

// вЂ”вЂ” Diagnostics (safe-mode / loadFailures) вЂ”вЂ”
echo "Diagnostics\n";
require_once "$root/tests/DiagnosticsTest.php";

// вЂ”вЂ” Access control (DSL + layout filter) вЂ”вЂ”
echo "AccessService\n";
require_once "$root/tests/AccessServiceTest.php";

// вЂ”вЂ” Admin ACL (capabilities / overrides / multi-role) вЂ”вЂ”
echo "AclAccess\n";
require_once "$root/tests/AclAccessTest.php";

// вЂ”вЂ” Platform SDK вЂ”вЂ”
echo "Platform SDK\n";
require_once "$root/tests/PlatformSdkTest.php";

// вЂ”вЂ” Platform package lifecycle (offline) вЂ”вЂ”
echo "Platform package lifecycle\n";
require_once "$root/tests/PlatformPackageLifecycleTest.php";

// вЂ”вЂ” Core migration smoke (SQLite) вЂ”вЂ”
echo "Migration smoke (SQLite)\n";
require_once "$root/tests/MigrationSmokeTest.php";

// вЂ”вЂ” SQLite migration compat regressions (rowid triggers / MODIFY / mirror bootstrap) вЂ”вЂ”
echo "Migration SQLite compat\n";
require_once "$root/tests/MigrationSqliteCompatTest.php";

// вЂ”вЂ” API route contracts (SQLite for controller ctor) вЂ”вЂ”
echo "API route contracts\n";
require_once "$root/tests/ApiRouteContractTest.php";

// вЂ”вЂ” Permission matrix (SQLite) вЂ”вЂ”
echo "PermissionService\n";
require_once "$root/tests/PermissionServiceTest.php";

// вЂ”вЂ” Clean install + upgrade-from-previous (SQLite) вЂ”вЂ”
echo "Clean install / upgrade\n";
require_once "$root/tests/CleanInstallSmokeTest.php";

// вЂ”вЂ” Package enable sync (installed_modules в†” modules mirror) вЂ”вЂ”
echo "Package enable sync\n";
require_once "$root/tests/PackageEnableSyncTest.php";

echo "Package install lifecycle\n";
require_once "$root/tests/PackageInstallLifecycleTest.php";

echo "Blog package boundary\n";
require_once "$root/tests/BlogPackageBoundaryTest.php";

echo "Projects package boundary\n";
require_once "$root/tests/ProjectsPackageBoundaryTest.php";

// вЂ”вЂ” Webhooks extracted package boundary вЂ”вЂ”
echo "Webhooks package boundary\n";
require_once "$root/tests/WebhooksPackageBoundaryTest.php";

// вЂ”вЂ” Comments extracted package boundary вЂ”вЂ”
echo "Comments package boundary\n";
require_once "$root/tests/CommentsPackageBoundaryTest.php";

// вЂ”вЂ” Products extracted package boundary вЂ”вЂ”
echo "Products package boundary\n";
require_once "$root/tests/ProductsPackageBoundaryTest.php";

// вЂ”вЂ” Orders extracted package boundary вЂ”вЂ”
echo "Orders package boundary\n";
require_once "$root/tests/OrdersPackageBoundaryTest.php";

// вЂ”вЂ” Payments extracted package boundary вЂ”вЂ”
echo "Payments package boundary\n";
require_once "$root/tests/PaymentsPackageBoundaryTest.php";

// вЂ”вЂ” Forms extracted package boundary вЂ”вЂ”
echo "Forms package boundary\n";
require_once "$root/tests/FormsPackageBoundaryTest.php";

// вЂ”вЂ” Analytics extracted package boundary вЂ”вЂ”
echo "Analytics package boundary\n";
require_once "$root/tests/AnalyticsPackageBoundaryTest.php";

// вЂ”вЂ” Newsletter extracted package boundary вЂ”вЂ”
echo "Newsletter package boundary\n";
require_once "$root/tests/NewsletterPackageBoundaryTest.php";

// вЂ”вЂ” Automation extracted package boundary вЂ”вЂ”
echo "Automation package boundary\n";
require_once "$root/tests/AutomationPackageBoundaryTest.php";

// вЂ”вЂ” Notifications extracted package boundary вЂ”вЂ”
echo "Notifications package boundary\n";
require_once "$root/tests/NotificationsPackageBoundaryTest.php";

// вЂ”вЂ” Support extracted package boundary вЂ”вЂ”
echo "Support package boundary\n";
require_once "$root/tests/SupportPackageBoundaryTest.php";

echo "Translate package boundary\n";
require_once "$root/tests/TranslatePackageBoundaryTest.php";

// вЂ”вЂ” Registration extracted package boundary вЂ”вЂ”
echo "Registration package boundary\n";
require_once "$root/tests/RegistrationPackageBoundaryTest.php";

// вЂ”вЂ” Synthetic unknown-slug SDK boundary probe вЂ”вЂ”
echo "SDK boundary probe\n";
require_once "$root/tests/SdkBoundaryProbeTest.php";
require_once "$root/tests/DualRuntimeZedTest.php";
require_once "$root/tests/PackageSurfaceRegistryTest.php";
require_once "$root/tests/PackageLifecycleParityTest.php";

// вЂ”вЂ” Synthetic unknown-slug Content Resources probe вЂ”вЂ”
echo "Zed content resources probe\n";
require_once "$root/tests/ZedContentResourcesProbeTest.php";

require_once "$root/tests/InstalledModuleLoaderHealthPreloadTest.php";

// вЂ”вЂ” Platform Scheduler package API probe вЂ”вЂ”
echo "SDK scheduler probe\n";
require_once "$root/tests/SdkSchedulerProbeTest.php";

// вЂ”вЂ” Projects soft API (Design B) вЂ”вЂ”
echo "Projects soft API\n";
require_once "$root/tests/ProjectsSoftApiTest.php";

// вЂ”вЂ” Soft delete empty-all (tables without deleted_at) вЂ”вЂ”
echo "SoftDelete empty trash\n";
require_once "$root/tests/SoftDeleteEmptyTrashTest.php";

// вЂ”вЂ” Operation / schedule / snapshot integrity вЂ”вЂ”
echo "Operation integrity\n";
require_once "$root/tests/OperationIntegrityTest.php";

// вЂ”вЂ” Router / core hardening вЂ”вЂ”
echo "Router / core\n";
require_once "$root/tests/RouterTest.php";

// вЂ”вЂ” Contract governance (API / caps / services / perms / events / MCP) вЂ”вЂ”
echo "Contract governance\n";
require_once "$root/tests/ContractGovernanceTest.php";

// вЂ”вЂ” Security verification вЂ”вЂ”
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

// вЂ”вЂ” Maintainability (shared helpers / error envelope) вЂ”вЂ”
echo "Maintainability\n";
require_once "$root/tests/MaintainabilityTest.php";

echo "HttpsPolicy\n";
require_once "$root/tests/HttpsPolicyTest.php";

// вЂ”вЂ” SiteUpdater Vite assets prune вЂ”вЂ”
echo "SiteUpdater assets prune\n";
require_once "$root/tests/SiteUpdaterAssetsPruneTest.php";

echo "Overload\n";
require_once "$root/tests/OverloadServiceTest.php";

echo str_repeat('-', 40) . "\n";
echo "Passed: $passed  Failed: $failed\n";
exit($failed > 0 ? 1 : 0);
