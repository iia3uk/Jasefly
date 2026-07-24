<?php
declare(strict_types=1);

namespace App\Modules\Support;

/**
 * Validate visitor contact email: format + MX + disposable blocklist.
 */
final class SupportEmailGuard
{
    /** @var list<string> */
    private const BUILTIN_DISPOSABLE = [
        'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
        'grr.la', 'guerrillamailblock.com', 'pokemail.net', 'spam4.me', 'yopmail.com',
        'yopmail.fr', 'trashmail.com', 'trashmail.me', 'tempmail.com', 'temp-mail.org',
        'temp-mail.io', '10minutemail.com', '10minutemail.net', 'throwaway.email',
        'fakeinbox.com', 'getnada.com', 'maildrop.cc', 'dispostable.com', 'mailnesia.com',
        'mintemail.com', 'tempail.com', 'emailondeck.com', 'moakt.com', 'tmpmail.org',
        'tmpmail.net', 'discard.email', 'mailcatch.com', 'mytemp.email', 'tempr.email',
    ];

    /**
     * @param list<string> $extraDisposableDomains
     * @return array{ok: bool, error?: string}
     */
    public function validate(string $email, array $extraDisposableDomains = []): array
    {
        $email = trim(mb_strtolower($email));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Укажите корректный email'];
        }

        $domain = substr(strrchr($email, '@') ?: '', 1);
        if ($domain === '' || !preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/i', $domain)) {
            return ['ok' => false, 'error' => 'Некорректный домен email'];
        }

        $blocked = array_unique(array_merge(
            self::BUILTIN_DISPOSABLE,
            array_map(static fn(string $d): string => mb_strtolower(trim($d)), $extraDisposableDomains)
        ));
        if (in_array($domain, $blocked, true)) {
            return ['ok' => false, 'error' => 'Временные (одноразовые) email не принимаются'];
        }

        if (!$this->hasMxOrA($domain)) {
            return ['ok' => false, 'error' => 'Домен email не принимает почту (нет MX)'];
        }

        return ['ok' => true];
    }

    private function hasMxOrA(string $domain): bool
    {
        if (function_exists('checkdnsrr')) {
            if (@checkdnsrr($domain, 'MX') || @checkdnsrr($domain, 'A') || @checkdnsrr($domain, 'AAAA')) {
                return true;
            }
        }
        // Shared hosting without DNS functions — don't hard-fail format-valid emails.
        return !function_exists('checkdnsrr');
    }

    /**
     * Parse comma/newline-separated extra disposable domains from settings.
     *
     * @return list<string>
     */
    public static function parseExtraDomains(string $raw): array
    {
        $parts = preg_split('/[\s,;]+/', mb_strtolower($raw)) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = trim($p, " \t\n\r\0\x0B.");
            if ($p !== '' && str_contains($p, '.')) {
                $out[] = $p;
            }
        }
        return array_values(array_unique($out));
    }
}
