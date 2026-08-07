<?php
declare(strict_types=1);

/**
 * Telegram deploy-approve gate: misconfig, webhook secret, chat allowlist, replay.
 */

use App\Request;
use App\Support\DeployTelegramApprove;
use App\Support\OriginGuard;

$tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'jasefly_tg_deploy_' . bin2hex(random_bytes(4));
@mkdir($tmp . '/updates/pending', 0750, true);

$appOff = [
    'telegram_deploy_approve' => '0',
    'telegram_deploy_bot_token' => '',
    'telegram_deploy_chat_id' => '',
    'telegram_deploy_webhook_secret' => '',
    'storage' => $tmp,
    'url' => 'https://example.test',
];

$appOn = [
    'telegram_deploy_approve' => '1',
    'telegram_deploy_bot_token' => '123456:TEST-BOT-TOKEN',
    'telegram_deploy_chat_id' => '998877',
    'telegram_deploy_webhook_secret' => 'webhook-secret-value-xyz',
    'telegram_deploy_ttl_seconds' => 3600,
    'storage' => $tmp,
    'url' => 'https://example.test',
];

assert_true(DeployTelegramApprove::enabled($appOff) === false, 'flag off → disabled');
assert_true(DeployTelegramApprove::enabled($appOn) === true, 'flag on → enabled');
assert_true(DeployTelegramApprove::configured($appOff) === false, 'empty secrets → not configured');
assert_true(DeployTelegramApprove::configured($appOn) === true, 'all secrets → configured');

$misconfigThrown = false;
try {
    DeployTelegramApprove::assertConfigured([
        'telegram_deploy_approve' => '1',
        'telegram_deploy_bot_token' => 'x',
        'telegram_deploy_chat_id' => '',
        'telegram_deploy_webhook_secret' => 'y',
    ]);
} catch (Throwable) {
    $misconfigThrown = true;
}
assert_true($misconfigThrown, 'assertConfigured throws when chat empty');

// —— Webhook: bad secret ——
$svc = new DeployTelegramApprove($appOn, null);
$_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] = 'wrong';
$reqBad = new Request('POST', '/api/v1/telegram/deploy-webhook');
// Inject body via reflection (php://input empty in CLI)
$ref = new ReflectionClass(Request::class);
$prop = $ref->getProperty('rawBody');
$prop->setAccessible(true);
$prop->setValue($reqBad, json_encode(['callback_query' => [
    'id' => '1',
    'data' => 'dapp:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'message' => ['chat' => ['id' => 998877], 'message_id' => 1],
]]));
$bad = $svc->handleWebhook($reqBad);
assert_true(($bad['ok'] ?? true) === false, 'webhook bad secret → not ok');
assert_true(($bad['error'] ?? '') === 'bad_secret', 'webhook bad_secret reason');

// —— Webhook: wrong chat ——
$_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] = 'webhook-secret-value-xyz';
$reqChat = new Request('POST', '/api/v1/telegram/deploy-webhook');
$prop->setValue($reqChat, json_encode(['callback_query' => [
    'id' => '2',
    'data' => 'dapp:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'message' => ['chat' => ['id' => 111], 'message_id' => 2],
    'from' => ['id' => 111],
]]));
$denied = $svc->handleWebhook($reqChat);
assert_true(($denied['ok'] ?? true) === false, 'wrong chat → not ok');
assert_true(($denied['error'] ?? '') === 'chat_denied', 'chat_denied reason');

// —— Replay approve ——
$id = bin2hex(random_bytes(16));
$pendingDir = $tmp . '/updates/pending';
$meta = [
    'id' => $id,
    'package' => 'test.zip',
    'sha256' => 'abc',
    'created_at' => gmdate('c'),
    'expires_at' => gmdate('c', time() + 3600),
    'status' => 'applied',
    'requested_by' => 'mcp',
    'message_id' => null,
];
file_put_contents($pendingDir . '/' . $id . '.json', json_encode($meta));
$replayThrown = false;
try {
    $svc->approve($id, 'admin');
} catch (Throwable $e) {
    $replayThrown = true;
    assert_true(str_contains($e->getMessage(), 'обработан') || (int) $e->getCode() === 409, 'replay message/code');
}
assert_true($replayThrown, 'replay approve rejected');

// —— Reject pending without Telegram network ——
$id2 = bin2hex(random_bytes(16));
file_put_contents($pendingDir . '/' . $id2 . '.zip', 'PK fake');
file_put_contents($pendingDir . '/' . $id2 . '.json', json_encode([
    'id' => $id2,
    'package' => 'reject-me.zip',
    'sha256' => 'x',
    'created_at' => gmdate('c'),
    'expires_at' => gmdate('c', time() + 3600),
    'status' => 'pending',
    'requested_by' => 'admin',
    'message_id' => null,
]));
$rej = $svc->reject($id2, 'admin');
assert_true(($rej['status'] ?? '') === 'rejected', 'reject marks rejected');
assert_true(!is_file($pendingDir . '/' . $id2 . '.zip'), 'reject deletes zip');

// —— OriginGuard skips webhook path ——
$reqWh = new Request('POST', '/api/v1/telegram/deploy-webhook');
assert_true(OriginGuard::requiresCheck($reqWh, $appOn) === false, 'OriginGuard skips telegram deploy webhook');

// —— Source contracts ——
$sysSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/System/SystemModule.php');
assert_true(str_contains($sysSrc, '/telegram/deploy-webhook'), 'SystemModule registers deploy webhook');
assert_true(str_contains($sysSrc, 'pending/{id}/approve'), 'SystemModule registers admin approve escape hatch');
assert_true(str_contains($sysSrc, 'DeployTelegramApprove'), 'SystemModule uses DeployTelegramApprove');

$updSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Services/SiteUpdater.php');
assert_true(str_contains($updSrc, 'function applyStagedZip'), 'SiteUpdater::applyStagedZip exists');

$mcpIdx = (string) file_get_contents(dirname(__DIR__, 2) . '/mcp-cms/src/index.js');
assert_true(str_contains($mcpIdx, 'pending_approval'), 'mcp-cms handles pending_approval');
assert_true(str_contains($mcpIdx, 'markPendingTelegram'), 'mcp-cms markPendingTelegram');
assert_true(str_contains($mcpIdx, 'ensureVpsTelegramGate'), 'mcp-cms VPS telegram gate before SSH');
$tgGate = (string) file_get_contents(dirname(__DIR__, 2) . '/mcp-cms/src/deploy/telegramGate.js');
assert_true(str_contains($tgGate, 'admin/deploy/telegram/request'), 'telegramGate requests Node approve');
$nodeTg = (string) file_get_contents(dirname(__DIR__, 2) . '/runtime-node/src/support/DeployTelegramApprove.ts');
assert_true(str_contains($nodeTg, 'redeem'), 'Node DeployTelegramApprove has redeem for SSH');

$envEx = (string) file_get_contents(dirname(__DIR__) . '/config/.env.example');
assert_true(str_contains($envEx, 'TELEGRAM_DEPLOY_APPROVE'), '.env.example documents TELEGRAM_DEPLOY_APPROVE');
assert_true(str_contains($envEx, 'TELEGRAM_DEPLOY_WEBHOOK_SECRET'), '.env.example documents webhook secret');

// Public status never leaks secrets
$pub = $svc->statusPublic();
$pubJson = json_encode($pub);
assert_true($pub['enabled'] === true, 'statusPublic enabled');
assert_true($pub['configured'] === true, 'statusPublic configured');
assert_true(!str_contains((string) $pubJson, 'TEST-BOT-TOKEN'), 'statusPublic has no bot token');
assert_true(!str_contains((string) $pubJson, 'webhook-secret-value'), 'statusPublic has no webhook secret');

unset($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN']);

// Cleanup
foreach (glob($pendingDir . '/*') ?: [] as $f) {
    @unlink($f);
}
@rmdir($pendingDir);
@rmdir($tmp . '/updates');
@rmdir($tmp);
