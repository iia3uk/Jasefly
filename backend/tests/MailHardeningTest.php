<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Mail hardening: SoT, isAvailable semantics, secrets redaction, Platform consumers.
 * Included from run.php (uses global assert_true).
 */

use App\Core\AbstractModule;
use App\Platform\Adapters\MailAdapter;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Contracts\PlatformMailInterface;
use App\Services\PluginStateService;
use App\Support\SecretRedactor;

$repoRoot = dirname(__DIR__, 2);

$iface = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Contracts/PlatformMailInterface.php');
assert_true(str_contains($iface, 'isAvailable'), 'PlatformMailInterface has isAvailable');
assert_true(str_contains($iface, 'sendHtml'), 'PlatformMailInterface has sendHtml');

$adapterSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Adapters/MailAdapter.php');
assert_true(str_contains($adapterSrc, "modules WHERE name=?"), 'MailAdapter reads modules.settings SoT');
assert_true(str_contains($adapterSrc, 'email_settings'), 'MailAdapter keeps legacy email_settings read fallback');
assert_true(!str_contains($adapterSrc, "settings WHERE `key`='mail'"), 'MailAdapter no longer uses settings.key=mail');

$registrationPkg = is_dir($repoRoot . '/modules-src/registration')
    ? $repoRoot . '/modules-src/registration'
    : dirname(__DIR__) . '/tests/fixtures/modules/registration';
$regSrc = (string) file_get_contents($registrationPkg . '/backend/RegistrationService.php');
assert_true(str_contains($regSrc, 'PlatformMailInterface'), 'Registration uses Platform Mail');
assert_true(!str_contains($regSrc, 'use App\\Modules\\Mail\\Mailer'), 'Registration has no Mailer import');

$supportPkg = is_dir($repoRoot . '/modules-src/support')
    ? $repoRoot . '/modules-src/support'
    : dirname(__DIR__) . '/tests/fixtures/modules/support';
$supportSrc = (string) file_get_contents($supportPkg . '/backend/SupportNotifier.php');
assert_true(str_contains($supportSrc, 'PlatformMailInterface'), 'SupportNotifier uses Platform Mail');
assert_true(!str_contains($supportSrc, 'use App\\Modules\\Mail\\Mailer'), 'SupportNotifier has no Mailer import');
assert_true(!str_contains($supportSrc, 'TelegramNotifier'), 'Support has no concrete Telegram coupling');

$overloadSrc = (string) file_get_contents($repoRoot . '/backend/src/Modules/Overload/OverloadService.php');
assert_true(str_contains($overloadSrc, 'MailAdapter'), 'Overload uses MailAdapter');
assert_true(!str_contains($overloadSrc, 'Modules\\Mail\\Mailer'), 'Overload has no concrete Mailer');

$contactSrc = (string) file_get_contents($repoRoot . '/backend/src/Modules/Mail/ContactFormService.php');
assert_true(str_contains($contactSrc, 'new Mailer'), 'ContactForm keeps Mailer (Mail transport internals)');

$mailSvcSrc = (string) file_get_contents($repoRoot . '/backend/src/Services/MailService.php');
assert_true(str_contains($mailSvcSrc, 'MailAdapter'), 'legacy MailService sends via MailAdapter');
assert_true(!str_contains($mailSvcSrc, 'use App\\Modules\\Mail\\Mailer'), 'legacy MailService has no Mailer import');

$mailModSrc = (string) file_get_contents($repoRoot . '/backend/src/Modules/Mail/MailModule.php');
assert_true(str_contains($mailModSrc, "'type' => 'password'"), 'Mail schema marks secret fields as password');
assert_true(str_contains($mailModSrc, 'TelegramNotifier') || str_contains($mailModSrc, 'telegram'), 'Mail Telegram coupling preserved');

$pluginStateSrc = (string) file_get_contents($repoRoot . '/backend/src/Services/PluginStateService.php');
assert_true(str_contains($pluginStateSrc, 'getPublicSettings'), 'PluginStateService exposes getPublicSettings');
assert_true(str_contains($pluginStateSrc, 'isMaskedOrEmptySecret') || str_contains($pluginStateSrc, 'MASK'), 'setSettings preserves masked secrets');

$sysSrc = (string) file_get_contents($repoRoot . '/backend/src/Modules/System/SystemModule.php');
assert_true(str_contains($sysSrc, 'getPublicSettings'), 'plugins settings PUT returns public settings');

// Remaining concrete Mailer outside Mail implementation / analyzer / adapter
$hostMailerHits = [];
foreach ([
    $repoRoot . '/backend/src/Modules',
    $repoRoot . '/backend/src/Services',
    $repoRoot . '/backend/src/Controllers',
] as $scanRoot) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($scanRoot, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        if (!$file->isFile() || $file->getExtension() !== 'php') {
            continue;
        }
        $path = $file->getPathname();
        $norm = str_replace('\\', '/', $path);
        if (str_contains($norm, '/Modules/Mail/')) {
            continue; // Mail transport internals
        }
        if (str_ends_with($norm, '/Platform/Adapters/MailAdapter.php')) {
            continue; // Platform boundary в†’ Mailer
        }
        $src = (string) file_get_contents($path);
        if (preg_match('/new\\s+\\\\?App\\\\Modules\\\\Mail\\\\Mailer\\b|new\\s+Mailer\\b|use\\s+App\\\\Modules\\\\Mail\\\\Mailer\\b/', $src)) {
            $hostMailerHits[] = str_replace('\\', '/', substr($path, strlen($repoRoot) + 1));
        }
    }
}
assert_true($hostMailerHits === [], 'no concrete Mailer callers outside Mail implementation: ' . implode(', ', $hostMailerHits));

$caps = new CapabilityRegistry(null);
assert_true($caps->has('mail.send'), 'mail.send remains core/platform capability');

// вЂ”вЂ” Runtime SQLite вЂ”вЂ”
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP MailHardening runtime (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$ctx = jasefly_test_sqlite_boot();
$db = $ctx['db'];
$pdo = $ctx['pdo'];
$app = array_merge($ctx['app'] ?? [], [
    'storage' => sys_get_temp_dir() . '/jasefly-mail-hardening-' . getmypid(),
    'paths' => ['storage' => sys_get_temp_dir() . '/jasefly-mail-hardening-' . getmypid()],
]);
@mkdir($app['storage'], 0775, true);

$pdo->exec(
    "CREATE TABLE IF NOT EXISTS modules (
        name TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 0,
        settings TEXT NULL
    )"
);
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS email_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        from_email TEXT NULL,
        from_name TEXT NULL,
        to_email TEXT NULL,
        smtp_host TEXT NULL,
        smtp_port INTEGER DEFAULT 587,
        smtp_username TEXT NULL,
        smtp_password TEXT NULL,
        smtp_encryption TEXT DEFAULT 'tls'
    )"
);

$mail = new MailAdapter($db, $app);
assert_true($mail instanceof PlatformMailInterface, 'MailAdapter implements PlatformMailInterface');
assert_true(!$mail->isAvailable(), 'unconfigured mail в†’ isAvailable false');

$secret = 'super-secret-smtp-pass';
$pdo->exec(
    "INSERT INTO modules (name, is_enabled, settings) VALUES (
        'mail', 1,
        " . $pdo->quote(json_encode([
            'from_email' => 'ops@example.com',
            'from_name' => 'Ops',
            'to_email' => 'ops@example.com',
            'smtp_host' => 'smtp.example.com',
            'smtp_port' => 587,
            'smtp_encryption' => 'tls',
            'smtp_username' => 'ops@example.com',
            'smtp_password' => $secret,
            'telegram_bot_token' => 'bot-secret-token',
        ], JSON_UNESCAPED_UNICODE)) . "
    )"
);

$mailReady = new MailAdapter($db, $app);
assert_true($mailReady->isAvailable(), 'configured SMTP in modules.settings в†’ isAvailable true');

$pdo->exec("UPDATE modules SET is_enabled=0 WHERE name='mail'");
assert_true(!(new MailAdapter($db, $app))->isAvailable(), 'disabled mail plugin в†’ isAvailable false');
$pdo->exec("UPDATE modules SET is_enabled=1 WHERE name='mail'");
assert_true((new MailAdapter($db, $app))->isAvailable(), 're-enabled mail в†’ isAvailable true');

// UI/runtime same SoT: PluginStateService getSettings matches adapter readiness source
$mailModule = new class extends AbstractModule {
    public function name(): string { return 'mail'; }
    public function label(): string { return 'Mail'; }
    public function settingsSchema(): array
    {
        return [
            ['key' => 'from_email', 'type' => 'text', 'default' => ''],
            ['key' => 'smtp_host', 'type' => 'text', 'default' => ''],
            ['key' => 'smtp_password', 'type' => 'password', 'secret' => true, 'default' => ''],
            ['key' => 'telegram_bot_token', 'type' => 'password', 'secret' => true, 'default' => ''],
        ];
    }
    public function settings(): array
    {
        return ['from_email' => '', 'smtp_host' => '', 'smtp_password' => '', 'telegram_bot_token' => ''];
    }
    public function registerRoutes(\App\Router $router, \App\Database $db, array $app, string $apiPrefix): void {}
};

$state = new PluginStateService($db, $app);
$full = $state->getSettings($mailModule);
assert_true(($full['smtp_password'] ?? '') === $secret, 'internal getSettings keeps real SMTP password');
$public = $state->getPublicSettings($mailModule);
assert_true(($public['smtp_password'] ?? '') === SecretRedactor::MASK, 'public settings mask smtp_password');
assert_true(($public['telegram_bot_token'] ?? '') === SecretRedactor::MASK, 'public settings mask telegram_bot_token');
assert_true(($public['from_email'] ?? '') === 'ops@example.com', 'public settings keep non-secret fields');

// Masked save preserves secret
$state->setSettings($mailModule, [
    'from_email' => 'ops@example.com',
    'smtp_host' => 'smtp.example.com',
    'smtp_password' => SecretRedactor::MASK,
    'telegram_bot_token' => SecretRedactor::MASK,
]);
$afterMask = $state->getSettings($mailModule);
assert_true(($afterMask['smtp_password'] ?? '') === $secret, 'masked smtp_password preserve on save');
assert_true(($afterMask['telegram_bot_token'] ?? '') === 'bot-secret-token', 'masked bot token preserve on save');

// Empty secret also preserves (do not wipe)
$state->setSettings($mailModule, [
    'from_email' => 'ops@example.com',
    'smtp_host' => 'smtp.example.com',
    'smtp_password' => '',
    'telegram_bot_token' => '',
]);
$afterEmpty = $state->getSettings($mailModule);
assert_true(($afterEmpty['smtp_password'] ?? '') === $secret, 'empty smtp_password preserve on save');

// Real password change works
$state->setSettings($mailModule, [
    'from_email' => 'ops@example.com',
    'smtp_host' => 'smtp.example.com',
    'smtp_password' => 'new-pass-123',
    'telegram_bot_token' => 'bot-secret-token',
]);
assert_true(($state->getSettings($mailModule)['smtp_password'] ?? '') === 'new-pass-123', 'new smtp_password stored');

// Legacy email_settings adoption when modules.settings empty
$pdo->exec("DELETE FROM modules WHERE name='mail'");
$pdo->exec(
    "INSERT INTO email_settings (id, from_email, from_name, smtp_host, smtp_password)
     VALUES (1, 'legacy@example.com', 'Legacy', 'smtp.legacy.test', 'legacy-secret')"
);
$legacyMail = new MailAdapter($db, $app);
assert_true($legacyMail->isAvailable(), 'legacy email_settings adoption в†’ isAvailable true');

// Capability still present while transport may be unavailable
$pdo->exec("DELETE FROM email_settings");
assert_true($caps->has('mail.send'), 'has(mail.send) still true without transport');
assert_true(!(new MailAdapter($db, $app))->isAvailable(), 'isAvailable false without config despite capability');

($ctx['cleanup'])();
