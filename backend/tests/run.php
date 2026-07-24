<?php
declare(strict_types=1);

/**
 * Lightweight test runner (no PHPUnit dependency).
 *   php backend/tests/run.php
 */

$root = dirname(__DIR__);
require_once "$root/src/Bootstrap.php";

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

echo "Jasefly CMS tests\n" . str_repeat('-', 40) . "\n";

// —— Forms unit (no DB) ——
require_once "$root/src/Modules/Forms/ConditionalLogic.php";
require_once "$root/src/Modules/Forms/FormValidator.php";
require_once "$root/src/Modules/Forms/CsvExport.php";

use App\Modules\Forms\ConditionalLogic;
use App\Modules\Forms\CsvExport;
use App\Modules\Forms\FormValidator;

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

echo str_repeat('-', 40) . "\n";
echo "Passed: $passed  Failed: $failed\n";
exit($failed > 0 ? 1 : 0);
