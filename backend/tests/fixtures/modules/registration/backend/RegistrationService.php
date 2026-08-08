<?php
declare(strict_types=1);

namespace App\PackageModules\Registration;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformMailInterface;
use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Contracts\PlatformSettingsInterface;

final class RegistrationService
{
    public function __construct(private PlatformDatabaseInterface $db, private PlatformSettingsInterface $settings, private PlatformMailInterface $mail, private string $baseUrl) {}
    private function s(string $key, mixed $default = null): mixed { return $this->settings->get($key, $default); }
    public function publicConfig(): array { return [
        'enabled'=>(bool)$this->s('registration_enabled', false), 'require_name'=>(bool)$this->s('require_name', true),
        'min_password_length'=>max(6,(int)$this->s('min_password_length',8)), 'require_password_confirm'=>(bool)$this->s('require_password_confirm',true),
        'require_email_verification'=>(bool)$this->s('require_email_verification',false), 'show_login_link'=>(bool)$this->s('show_login_link',true),
        'login_path'=>(string)$this->s('login_path','/admin/login'), 'terms_required'=>(bool)$this->s('terms_required',false),
        'terms_url'=>(string)$this->s('terms_url','/privacy'), 'terms_label'=>(string)$this->s('terms_label','Согласен с политикой конфиденциальности'),
        'closed_message'=>(string)$this->s('closed_message','Регистрация временно закрыта.'), 'success_message'=>$this->successMessage(),
        'captcha'=>['provider'=>'none','turnstile_site_key'=>'','smartcaptcha_site_key'=>''],
    ]; }
    public function successMessage(): string { return (string)$this->s('success_message','Аккаунт создан.'); }
    public function redirectAfterRegister(): string { return trim((string)$this->s('redirect_after_register','/')) ?: '/'; }
    public function redirectAfterVerify(): string { return trim((string)$this->s('redirect_after_verify','/admin/login')) ?: '/admin/login'; }
    public function autoLoginAfterVerify(): bool { return (bool)$this->s('auto_login_after_verify',false); }
    /** @return array{user:array<string,mixed>,needs_verification:bool,auto_login:bool} */
    public function register(PlatformRequestInterface $r): array {
        if (!(bool)$this->s('registration_enabled',false)) throw new \RuntimeException((string)$this->s('closed_message','Регистрация закрыта'),403);
        if (trim((string)($r->input('website') ?? $r->input('company_url') ?? '')) !== '') throw new \RuntimeException('Rejected',400);
        $email=strtolower(trim((string)$r->input('email'))); $name=trim((string)$r->input('name','')); $password=(string)$r->input('password',''); $confirm=(string)$r->input('password_confirm',$r->input('password_confirmation',''));
        if (!filter_var($email,FILTER_VALIDATE_EMAIL)) throw new \RuntimeException('Укажите корректный email',422);
        if ((bool)$this->s('require_name',true) && $name==='') throw new \RuntimeException('Укажите имя',422);
        $name=$name ?: (explode('@',$email)[0] ?: 'User'); $min=max(6,(int)$this->s('min_password_length',8));
        if (strlen($password)<$min) throw new \RuntimeException("Пароль не короче {$min} символов",422);
        if ((bool)$this->s('require_password_confirm',true) && $password!==$confirm) throw new \RuntimeException('Пароли не совпадают',422);
        if ((bool)$this->s('terms_required',false) && !(bool)$r->input('terms_accepted',false)) throw new \RuntimeException('Нужно принять условия',422);
        if ($this->db->one('SELECT id FROM users WHERE email=? LIMIT 1',[$email])) throw new \RuntimeException('Пользователь с таким email уже есть',409);
        $verify=(bool)$this->s('require_email_verification',false); $token=$verify?bin2hex(random_bytes(32)):null; $expiry=$verify?date('Y-m-d H:i:s',time()+max(1,(int)$this->s('verification_token_ttl_hours',48))*3600):null;
        $this->db->run('INSERT INTO users (email,password_hash,name,role,email_verified_at,email_verify_token,email_verify_expires_at,registration_source) VALUES (?,?,?,?,?,?,?,?)',[$email,password_hash($password,PASSWORD_ARGON2ID),$name,(string)$this->s('default_role','member')==='editor'?'editor':'member',$verify?null:date('Y-m-d H:i:s'),$token,$expiry,'self']);
        $user=$this->db->one('SELECT * FROM users WHERE id=?',[$this->db->lastInsertId()]); if (!$user) throw new \RuntimeException('Не удалось создать пользователя',500);
        if ($verify && $token) $this->sendVerificationMail($user,$token);
        return ['user'=>$user,'needs_verification'=>$verify,'auto_login'=>!$verify&&(bool)$this->s('auto_login_after_register',true)];
    }
    /** @return array<string,mixed> */ public function verifyEmail(string $token): array {
        $user=$this->db->one('SELECT * FROM users WHERE email_verify_token=? LIMIT 1',[trim($token)]);
        if (!$user || (!empty($user['email_verify_expires_at']) && strtotime((string)$user['email_verify_expires_at'])<time())) throw new \RuntimeException('Ссылка недействительна или уже использована',400);
        $this->db->run('UPDATE users SET email_verified_at=NOW(),email_verify_token=NULL,email_verify_expires_at=NULL WHERE id=?',[(int)$user['id']]); return $this->db->one('SELECT * FROM users WHERE id=?',[(int)$user['id']]) ?: $user;
    }
    public function resendVerification(string $email): void { $user=$this->db->one('SELECT * FROM users WHERE email=? LIMIT 1',[strtolower(trim($email))]); if (!$user || !empty($user['email_verified_at'])) return; $token=bin2hex(random_bytes(32)); $this->db->run('UPDATE users SET email_verify_token=?,email_verify_expires_at=? WHERE id=?',[$token,date('Y-m-d H:i:s',time()+max(1,(int)$this->s('verification_token_ttl_hours',48))*3600),(int)$user['id']]); $this->sendVerificationMail($user,$token); }
    /** @param array<string,mixed> $user */ public function blockLoginUntilVerified(array $user): ?string { return (bool)$this->s('block_login_until_verified',true) && (bool)$this->s('require_email_verification',false) && ($user['registration_source']??'')==='self' && empty($user['email_verified_at']) ? 'Подтвердите email перед входом. Проверьте почту или запросите письмо снова.' : null; }
    /** @param array<string,mixed> $user */ private function sendVerificationMail(array $user,string $token): void { if (!$this->mail->isAvailable()) throw new \RuntimeException('Для подтверждения email настройте плагин «Почта» (SMTP)',503); $url=rtrim($this->baseUrl?:'http://localhost','/').'/register/verify?token='.urlencode($token); $map=['{{name}}'=>(string)$user['name'],'{{email}}'=>(string)$user['email'],'{{verify_url}}'=>$url,'{{site_name}}'=>'Jasefly','{{ttl_hours}}'=>(string)$this->s('verification_token_ttl_hours',48)]; $sent=$this->mail->sendHtml((string)$user['email'],strtr((string)$this->s('verify_email_subject','Подтвердите email — {{site_name}}'),$map),strtr((string)$this->s('verify_email_html','<p><a href="{{verify_url}}">Подтвердить</a></p>'),$map)); if (!($sent['ok']??false)) throw new \RuntimeException((string)($sent['error']??'Mail send failed'),503); }
    /** @param array<string,mixed> $user @return array<string,mixed> */ public static function publicUser(array $user): array { return ['id'=>(int)$user['id'],'email'=>$user['email'],'name'=>$user['name'],'role'=>$user['role']]; }
    public static function status(\Throwable $e): int { $c=(int)$e->getCode(); return $c>=400&&$c<=599?$c:400; }
}
