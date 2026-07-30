<?php
declare(strict_types=1);

use App\Modules\Overload\OverloadService;

assert_true(!OverloadService::sampleExceeds([1 => 1.5, 5 => 1.0, 15 => 0.8], 2.0), 'overload under 1m');
assert_true(OverloadService::sampleExceeds([1 => 2.0, 5 => 1.0, 15 => 0.8], 2.0), 'overload at 1m');
assert_true(OverloadService::sampleExceeds([1 => 3.5, 5 => 1.0, 15 => 0.8], 2.0), 'overload over 1m');
assert_true(!OverloadService::sampleExceeds([1 => 3.0, 5 => 3.5, 15 => 2.0], 10.0, 4.0), 'overload 5m under');
assert_true(OverloadService::sampleExceeds([1 => 3.0, 5 => 4.1, 15 => 2.0], 10.0, 4.0), 'overload 5m over');
assert_true(!OverloadService::sampleExceeds(null, 1.0), 'overload null sample fail-open');

// Sustained: short 1m spike (MCP unzip) must not trip without elevated 5m.
assert_true(
    !OverloadService::sampleExceeds([1 => 22.0, 5 => 8.0, 15 => 7.0], 16.0, 0.0, true),
    'sustained: 1m spike alone ignored'
);
assert_true(
    OverloadService::sampleExceeds([1 => 22.0, 5 => 18.0, 15 => 17.0], 16.0, 0.0, true),
    'sustained: 1m+5m both high'
);

$defaults = OverloadService::defaultSettings();
assert_true(($defaults['mode'] ?? '') === 'log', 'overload default mode is observe-only');
assert_true(in_array($defaults['mode'], ['log', 'notify', 'block', 'block_notify'], true), 'overload mode enum');
assert_true(!empty($defaults['normalize_by_cpu']), 'overload default normalize by CPU');
assert_true(!empty($defaults['require_sustained']), 'overload default require sustained');
assert_true((int) ($defaults['quiet_after_update_sec'] ?? 0) >= 60, 'overload quiet window after update');
assert_true(OverloadService::cpuCount() >= 1, 'cpu count at least 1');
