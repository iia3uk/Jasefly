<?php
declare(strict_types=1);

/**
 * Priority 7 — Maintainability smoke (shared helpers + error envelope).
 * Included from run.php (uses global assert_true).
 */

use App\Support\OutboundHttp;
use App\Support\SecretRedactor;
use App\Support\SsrfGuard;

// Shared helpers exist and stay wired
assert_true(class_exists(SecretRedactor::class), 'SecretRedactor class exists');
assert_true(class_exists(OutboundHttp::class), 'OutboundHttp class exists');
assert_true(class_exists(SsrfGuard::class), 'SsrfGuard class exists');

$preview = SecretRedactor::redactJson('{"token":"abc","job":"ping"}');
assert_true(is_array($preview) && ($preview['token'] ?? '') === '***', 'SecretRedactor::redactJson masks token');
assert_true(($preview['job'] ?? '') === 'ping', 'SecretRedactor::redactJson keeps job');

// OutboundHttp must refuse SSRF targets without network I/O
assert_true(OutboundHttp::postJson('http://127.0.0.1/hook', ['x' => 1]) === false, 'OutboundHttp refuses loopback');
assert_true(OutboundHttp::postJson('not-a-url', ['x' => 1]) === false, 'OutboundHttp refuses invalid URL');
$req = OutboundHttp::request('http://127.0.0.1/pay', ['method' => 'POST', 'body' => ['a' => 1], 'json' => true]);
assert_true(($req['ok'] ?? true) === false, 'OutboundHttp::request refuses loopback');
assert_true(($req['error'] ?? '') === 'unsafe_url', 'OutboundHttp::request SSRF error code');

// Response::error envelope + optional extras (inspect source contract)
$respSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Response.php');
assert_true(str_contains($respSrc, 'function error(string $message, int $status = 400, array $errors = [], array $extra = [])'), 'Response::error accepts $extra');

$sysSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/System/SystemModule.php');
assert_true(str_contains($sysSrc, "Response::error('Plugin not found', 404)"), 'SystemModule uses Response::error for missing plugin');
assert_true(!str_contains($sysSrc, "Response::json(['success' => false, 'error' => 'Plugin not found']"), 'SystemModule no longer ad-hoc plugin-not-found json');

$formsPkgDir = dirname(__DIR__, 2) . '/modules-src/forms/backend';
if (!is_dir($formsPkgDir)) {
    $formsPkgDir = __DIR__ . '/fixtures/modules/forms/backend';
}
$formsSrc = (string) file_get_contents($formsPkgDir . '/FormActionRegistry.php');
assert_true(str_contains($formsSrc, 'postJsonOutbound'), 'Forms package send_webhook uses PlatformHttp postJsonOutbound');

$autoPkgDir = dirname(__DIR__, 2) . '/modules-src/automation/backend';
if (!is_dir($autoPkgDir)) {
    $autoPkgDir = __DIR__ . '/fixtures/modules/automation/backend';
}
$autoSrc = (string) file_get_contents($autoPkgDir . '/AutomationEngine.php');
assert_true(
    str_contains($autoSrc, 'SecretRedactor::redact')
    || (str_contains($autoSrc, 'function redact') && str_contains($autoSrc, "'***'")),
    'AutomationEngine redacts secrets in step I/O'
);

$schedSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Scheduler/SchedulerModule.php');
assert_true(str_contains($schedSrc, 'SecretRedactor::redactJson'), 'SchedulerModule uses SecretRedactor');
