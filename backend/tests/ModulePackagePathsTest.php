<?php
declare(strict_types=1);

/**
 * Path-jail unit tests for ModulePackagePaths (no DB).
 * Run via: php backend/tests/run.php
 */

use App\Core\Modules\ModulePackagePaths;

$tmpRoot = sys_get_temp_dir() . '/jasefly-paths-' . bin2hex(random_bytes(4));
@mkdir($tmpRoot . '/safe', 0775, true);
@mkdir($tmpRoot . '/outside', 0775, true);
file_put_contents($tmpRoot . '/safe/inside.txt', 'ok');
file_put_contents($tmpRoot . '/outside/escape.txt', 'nope');

$paths = new ModulePackagePaths($tmpRoot, $tmpRoot);

$inside = $paths->assertContained($tmpRoot . '/safe', $tmpRoot . '/safe/inside.txt');
assert_true(is_string($inside) && str_contains(str_replace('\\', '/', $inside), 'inside.txt'), 'assertContained allows path inside root');

$escaped = false;
try {
    $paths->assertContained($tmpRoot . '/safe', $tmpRoot . '/outside/escape.txt');
} catch (Throwable $e) {
    $escaped = str_contains($e->getMessage(), 'escapes') || str_contains($e->getMessage(), 'Path');
}
assert_true($escaped, 'assertContained rejects path outside root');

$slip = false;
try {
    $paths->assertContained($tmpRoot . '/safe', $tmpRoot . '/safe/../outside/escape.txt');
} catch (Throwable $e) {
    $slip = true;
}
assert_true($slip, 'assertContained rejects ../ traversal out of root');

$slugOk = true;
try {
    $paths->assertSlug('demo-kit');
} catch (Throwable) {
    $slugOk = false;
}
assert_true($slugOk, 'valid slug accepted');

$slugBad = false;
try {
    $paths->assertSlug('../evil');
} catch (Throwable) {
    $slugBad = true;
}
assert_true($slugBad, 'invalid slug rejected');

// cleanup
@unlink($tmpRoot . '/safe/inside.txt');
@unlink($tmpRoot . '/outside/escape.txt');
@rmdir($tmpRoot . '/safe');
@rmdir($tmpRoot . '/outside');
@rmdir($tmpRoot);
