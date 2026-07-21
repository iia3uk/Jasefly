<?php
declare(strict_types=1);

namespace App\Services;

/**
 * RFC 6238 TOTP (Authenticator apps) — no external dependencies.
 */
final class TotpService
{
    public function __construct(private int $period = 30, private int $digits = 6) {}

    public function generateSecret(int $bytes = 20): string
    {
        return $this->base32Encode(random_bytes($bytes));
    }

    public function otpAuthUrl(string $secret, string $account, string $issuer = 'Jasefly CMS'): string
    {
        $label = rawurlencode($issuer . ':' . $account);
        $q = http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => $this->digits,
            'period' => $this->period,
        ]);
        return "otpauth://totp/{$label}?{$q}";
    }

    public function verify(string $secret, string $code, int $window = 1): bool
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if (!preg_match('/^\d{' . $this->digits . '}$/', $code)) {
            return false;
        }
        $time = time();
        for ($i = -$window; $i <= $window; $i++) {
            $slot = intdiv($time, $this->period) + $i;
            if (hash_equals($this->codeAt($secret, $slot), $code)) {
                return true;
            }
        }
        return false;
    }

    public function codeAt(string $secret, int $counter): string
    {
        $key = $this->base32Decode($secret);
        $bin = pack('N*', 0, $counter); // 8-byte big-endian
        $hash = hash_hmac('sha1', $bin, $key, true);
        $offset = ord($hash[19]) & 0x0F;
        $value = (
            ((ord($hash[$offset]) & 0x7F) << 24)
            | ((ord($hash[$offset + 1]) & 0xFF) << 16)
            | ((ord($hash[$offset + 2]) & 0xFF) << 8)
            | (ord($hash[$offset + 3]) & 0xFF)
        );
        $mod = 10 ** $this->digits;
        return str_pad((string) ($value % $mod), $this->digits, '0', STR_PAD_LEFT);
    }

    private function base32Encode(string $data): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $bits = '';
        foreach (str_split($data) as $c) {
            $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            if (strlen($chunk) < 5) {
                $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            }
            $out .= $alphabet[bindec($chunk)];
        }
        return $out;
    }

    private function base32Decode(string $secret): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = strtoupper(preg_replace('/[^A-Z2-7]/', '', $secret) ?? '');
        $bits = '';
        for ($i = 0, $n = strlen($secret); $i < $n; $i++) {
            $v = strpos($alphabet, $secret[$i]);
            if ($v === false) {
                continue;
            }
            $bits .= str_pad(decbin($v), 5, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) === 8) {
                $out .= chr(bindec($chunk));
            }
        }
        return $out;
    }
}
