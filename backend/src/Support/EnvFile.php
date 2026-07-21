<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Load KEY=VALUE pairs from a .env file into $_ENV / putenv (no external deps).
 * Never logs or exposes values.
 */
final class EnvFile
{
    public static function load(string $path): bool
    {
        if (!is_file($path) || !is_readable($path)) {
            return false;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return false;
        }
        foreach (preg_split("/\r\n|\n|\r/", $raw) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            if (!str_contains($line, '=')) {
                continue;
            }
            [$key, $val] = explode('=', $line, 2);
            $key = trim($key);
            if ($key === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key)) {
                continue;
            }
            $val = trim($val);
            if (
                (str_starts_with($val, '"') && str_ends_with($val, '"'))
                || (str_starts_with($val, "'") && str_ends_with($val, "'"))
            ) {
                $val = substr($val, 1, -1);
            }
            // Do not override real process env
            if (getenv($key) !== false || array_key_exists($key, $_ENV)) {
                continue;
            }
            $_ENV[$key] = $val;
            @putenv("$key=$val");
        }
        return true;
    }
}
