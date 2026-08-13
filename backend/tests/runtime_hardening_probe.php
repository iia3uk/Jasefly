<?php
declare(strict_types=1);

/**
 * Isolated CLI probe: empty/re-set X-Powered-By must not survive RuntimeHardening.
 * Invoked from PlatformFingerprintTest (subprocess so headers_sent is false).
 */
require dirname(__DIR__) . '/src/Support/RuntimeHardening.php';

header('X-Powered-By: PHP/8.2.28');
\App\Support\RuntimeHardening::hidePhpFingerprint();

foreach (headers_list() as $h) {
    if (stripos($h, 'X-Powered-By:') === 0) {
        fwrite(STDERR, $h . "\n");
        exit(2);
    }
}

echo "ok\n";
exit(0);
