<?php
declare(strict_types=1);

namespace App\PackageModules\Registration;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class RegistrationModule extends AbstractPackageModule
{
    public function name(): string { return 'registration'; }
    public function label(): string { return 'Регистрация'; }
    public function priority(): int { return 45; }
    public function blocks(): array { return [['type' => 'auth-register', 'label' => 'Форма регистрации', 'category' => 'system']]; }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);
        foreach (['api.routes', 'settings.module', 'mail.send'] as $cap) $ctx->capabilities()->require($cap);
        $http = $ctx->http(); $db = $ctx->database(); $settings = $ctx->settings(); $mail = $ctx->mail(); $auth = $ctx->auth();
        $svc = static fn(): RegistrationService => new RegistrationService($db, $settings, $mail, (string) ($ctx->config()->get('url') ?? ''));
        $auth->registerLoginGate(static fn(array $user): ?string => $svc()->blockLoginUntilVerified($user));
        $rate = $http->rateLimitMiddleware(max(1, (int) $settings->get('rate_limit_per_minute', 3)), 60);
        $http->get('/registration/config', static function () use ($svc) { PlatformResponse::json(['data' => $svc()->publicConfig()]); });
        $http->post('/auth/register', static function (PlatformRequestInterface $r) use ($svc, $auth) {
            try {
                $result = $svc()->register($r); $user = $result['user'];
                $payload = ['needs_verification' => $result['needs_verification'], 'message' => $svc()->successMessage(), 'redirect' => $svc()->redirectAfterRegister(), 'user' => RegistrationService::publicUser($user)];
                if ($result['auto_login']) $auth->completeLogin($r, $user, $payload);
                PlatformResponse::json(['data' => $payload], 201);
            } catch (\Throwable $e) { PlatformResponse::error($e->getMessage(), RegistrationService::status($e)); }
        }, [$rate]);
        $http->post('/registration/register', static function (PlatformRequestInterface $r) use ($svc, $auth) {
            try {
                $result = $svc()->register($r); $user = $result['user'];
                $payload = ['needs_verification' => $result['needs_verification'], 'message' => $svc()->successMessage(), 'redirect' => $svc()->redirectAfterRegister(), 'user' => RegistrationService::publicUser($user)];
                if ($result['auto_login']) $auth->completeLogin($r, $user, $payload);
                PlatformResponse::json(['data' => $payload], 201);
            } catch (\Throwable $e) { PlatformResponse::error($e->getMessage(), RegistrationService::status($e)); }
        }, [$rate]);
        $verify = static function (PlatformRequestInterface $r) use ($svc, $auth) {
            try {
                $user = $svc()->verifyEmail((string) ($r->input('token') ?? $r->query()['token'] ?? ''));
                $payload = ['verified' => true, 'message' => 'Email подтверждён.', 'redirect' => $svc()->redirectAfterVerify(), 'user' => RegistrationService::publicUser($user)];
                if ($svc()->autoLoginAfterVerify()) $auth->completeLogin($r, $user, $payload);
                PlatformResponse::json(['data' => $payload]);
            } catch (\Throwable $e) { PlatformResponse::error($e->getMessage(), RegistrationService::status($e)); }
        };
        $http->get('/auth/verify-email', $verify); $http->post('/auth/verify-email', $verify);
        $http->post('/auth/resend-verification', static function (PlatformRequestInterface $r) use ($svc) {
            $svc()->resendVerification((string) $r->input('email')); PlatformResponse::json(['data' => ['ok' => true]]);
        }, [$rate]);
    }
}
