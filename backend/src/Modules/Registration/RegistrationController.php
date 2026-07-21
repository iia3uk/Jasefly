<?php
declare(strict_types=1);

namespace App\Modules\Registration;

use App\Controllers\AuthController;
use App\Database;
use App\Request;
use App\Response;
use Throwable;

final class RegistrationController
{
    public function __construct(
        private Database $db,
        private array $app,
        private RegistrationService $svc,
    ) {}

    public function config(Request $r): never
    {
        $this->svc->ensureSchema();
        Response::json(['data' => $this->svc->publicConfig()]);
    }

    public function register(Request $r): never
    {
        try {
            $this->svc->ensureSchema();
            $result = $this->svc->register($r);
            $user = $result['user'];
            $payload = [
                'needs_verification' => $result['needs_verification'],
                'message' => $this->svc->successMessage(),
                'redirect' => $this->svc->redirectAfterRegister(),
                'user' => [
                    'id' => (int) $user['id'],
                    'email' => $user['email'],
                    'name' => $user['name'],
                    'role' => $user['role'],
                ],
            ];

            if ($result['auto_login']) {
                (new AuthController($this->db, $this->app))->completeLogin($r, $user, $payload);
            }

            Response::json(['data' => $payload], 201);
        } catch (Throwable $e) {
            $code = (int) $e->getCode();
            if ($code < 400 || $code > 599) {
                $code = 400;
            }
            Response::error($e->getMessage(), $code);
        }
    }

    public function verify(Request $r): never
    {
        try {
            $token = (string) ($r->input('token') ?? $r->query('token') ?? '');
            $user = $this->svc->verifyEmail($token);
            $payload = [
                'verified' => true,
                'message' => 'Email подтверждён.',
                'redirect' => $this->svc->redirectAfterVerify(),
                'user' => [
                    'id' => (int) $user['id'],
                    'email' => $user['email'],
                    'name' => $user['name'],
                    'role' => $user['role'],
                ],
            ];
            if ($this->svc->autoLoginAfterVerify()) {
                (new AuthController($this->db, $this->app))->completeLogin($r, $user, $payload);
            }
            Response::json(['data' => $payload]);
        } catch (Throwable $e) {
            $code = (int) $e->getCode();
            if ($code < 400 || $code > 599) {
                $code = 400;
            }
            Response::error($e->getMessage(), $code);
        }
    }

    public function resend(Request $r): never
    {
        try {
            $email = (string) ($r->input('email') ?? '');
            $this->svc->resendVerification($email);
            Response::json(['data' => [
                'ok' => true,
                'message' => 'Если аккаунт ждёт подтверждения — письмо отправлено.',
            ]]);
        } catch (Throwable $e) {
            $code = (int) $e->getCode();
            if ($code < 400 || $code > 599) {
                $code = 400;
            }
            Response::error($e->getMessage(), $code);
        }
    }
}
