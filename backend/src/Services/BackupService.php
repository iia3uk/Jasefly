<?php
declare(strict_types=1);
namespace App\Services;
use App\Database;
use Throwable;

/**
 * SQL dump of the CMS database, encrypted at rest (libsodium secretbox or OpenSSL AES-256-GCM).
 * Plaintext .sql is never written to disk — only .sql.enc.
 */
final class BackupService {
    public function __construct(private Database $db, private array $app) {}

    public function create(): string {
        $name = 'backup-' . gmdate('Ymd-His') . '.sql.enc';
        $dir = $this->app['storage'] . '/backups';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $file = $dir . '/' . $name;
        $pdo = $this->db->pdo();
        $out = "-- Jasefly CMS backup\n";
        if ($this->db->driver() === 'mysql') {
            $out .= "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n";
        }
        foreach ($this->db->inspector()->listTables() as $t) {
            $out .= "DROP TABLE IF EXISTS `$t`;\n";
            $create = $this->createTableSql($t);
            if ($create !== null) {
                $out .= $create . ";\n";
            }
            foreach ($this->db->all("SELECT * FROM `$t`") as $r) {
                $vals = array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote((string) $v), array_values($r));
                $out .= "INSERT INTO `$t` (`" . implode('`,`', array_keys($r)) . "`) VALUES (" . implode(',', $vals) . ");\n";
            }
        }
        if ($this->db->driver() === 'mysql') {
            $out .= "SET FOREIGN_KEY_CHECKS = 1;\n";
        }
        file_put_contents($file, $this->encrypt($out), LOCK_EX);
        return $name;
    }

    /** Decrypt a .sql.enc backup for restore tooling. */
    public function decryptFile(string $path): string
    {
        $raw = file_get_contents($path);
        if ($raw === false || $raw === '') {
            throw new \RuntimeException('Backup unreadable');
        }
        return $this->decrypt($raw);
    }

    private function key(): string
    {
        $configured = (string) ($this->app['backup_key'] ?? '');
        if ($configured !== '') {
            return hash('sha256', $configured, true);
        }
        $secret = (string) ($this->app['jwt_secret'] ?? '');
        if ($secret === '') {
            throw new \RuntimeException('Set backup_key or jwt_secret before creating encrypted backups');
        }
        return hash('sha256', 'backup:' . $secret, true);
    }

    private function encrypt(string $plain): string
    {
        $key = $this->key();
        if (function_exists('sodium_crypto_secretbox')) {
            $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            $cipher = sodium_crypto_secretbox($plain, $nonce, $key);
            return 'PCMS1' . $nonce . $cipher; // version tag + nonce + ciphertext
        }
        if (!function_exists('openssl_encrypt')) {
            throw new \RuntimeException('Backup encryption requires ext-sodium or ext-openssl');
        }
        $iv = random_bytes(12);
        $tag = '';
        $cipher = \openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($cipher === false) {
            throw new \RuntimeException('Backup encryption failed');
        }
        return 'PCMS2' . $iv . $tag . $cipher;
    }

    private function decrypt(string $blob): string
    {
        $key = $this->key();
        $ver = substr($blob, 0, 5);
        if ($ver === 'PCMS1' && function_exists('sodium_crypto_secretbox_open')) {
            $nonce = substr($blob, 5, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            $cipher = substr($blob, 5 + SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            $plain = sodium_crypto_secretbox_open($cipher, $nonce, $key);
            if ($plain === false) {
                throw new \RuntimeException('Backup decrypt failed');
            }
            return $plain;
        }
        if ($ver === 'PCMS2') {
            $iv = substr($blob, 5, 12);
            $tag = substr($blob, 17, 16);
            $cipher = substr($blob, 33);
            $plain = \openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
            if ($plain === false) {
                throw new \RuntimeException('Backup decrypt failed');
            }
            return $plain;
        }
        throw new \RuntimeException('Unknown backup format');
    }

    /** Driver-specific CREATE TABLE statement for the dump (or null). */
    private function createTableSql(string $table): ?string {
        try {
            return match ($this->db->driver()) {
                'sqlite' => (string) ($this->db->one("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [$table])['sql'] ?? null),
                'pgsql' => null,
                default => (string) ($this->db->one("SHOW CREATE TABLE `$table`")['Create Table'] ?? null),
            };
        } catch (Throwable) {
            return null;
        }
    }
}
