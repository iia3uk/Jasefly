<?php
declare(strict_types=1);

/**
 * ModuleSafeMode persistence + ModuleRegistry loadFailures visibility.
 */

use App\Core\Modules\ModulePackagePaths;
use App\Services\Modules\ModuleSafeMode;

$tmp = sys_get_temp_dir() . '/jasefly-safemode-' . bin2hex(random_bytes(4));
@mkdir($tmp . '/storage', 0775, true);
$paths = new ModulePackagePaths($tmp, $tmp);
$safe = new ModuleSafeMode($paths);

assert_true($safe->read() === [], 'safe-mode starts empty');
assert_true($safe->isSkipped('demo-kit') === false, 'demo-kit not skipped initially');

$safe->markFailed('demo-kit', 'boot exploded');
assert_true($safe->isSkipped('demo-kit') === true, 'demo-kit marked skipped');
$read = $safe->read();
assert_true(isset($read['demo-kit']['error']), 'safe-mode stores error');
assert_true(str_contains($read['demo-kit']['error'], 'boot exploded'), 'safe-mode error text preserved');

$safe->clear('demo-kit');
assert_true($safe->isSkipped('demo-kit') === false, 'safe-mode clear removes skip');

// cleanup
@unlink($paths->safeModeFile());
@rmdir($tmp . '/storage');
@rmdir($tmp);

// loadFailures API exists on ModuleRegistry
assert_true(method_exists(\App\Core\ModuleRegistry::class, 'loadFailures'), 'ModuleRegistry::loadFailures exists');
