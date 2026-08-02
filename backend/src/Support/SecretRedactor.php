<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Mask secret-looking keys in arrays/JSON for admin logs and step dumps.
 */
final class SecretRedactor
{
    /** @var list<string> */
    public const DEFAULT_KEYS = [
        'password',
        'token',
        'secret',
        'api_key',
        'authorization',
        'bot_token',
    ];

    /** Extended key set for Demo Sandbox response pipeline. */
    public const DEMO_KEYS = [
        'password',
        'password_hash',
        'token',
        'secret',
        'api_key',
        'authorization',
        'bot_token',
        'private_key',
        'cookie',
        'session',
        'smtp_password',
        'database_password',
        'db_password',
        'webhook_secret',
        'oauth_client_secret',
        'client_secret',
        'refresh_token',
        // Note: do NOT include access_token — Demo start must return a usable JWT.
        'mcp_api_token',
        'jwt_secret',
        'backup_key',
        'totp_secret',
    ];

    /**
     * @param list<string>|null $keys lowercase key names to mask
     */
    public static function redact(mixed $value, ?array $keys = null): mixed
    {
        $keys ??= self::DEFAULT_KEYS;
        if (!is_array($value)) {
            return $value;
        }
        $out = [];
        foreach ($value as $key => $item) {
            $out[$key] = in_array(strtolower((string) $key), $keys, true)
                ? '***'
                : self::redact($item, $keys);
        }
        return $out;
    }

    /**
     * @param list<string>|null $keys
     */
    public static function redactJson(string $json, ?array $keys = null): mixed
    {
        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }
        return self::redact($data, $keys);
    }
}
