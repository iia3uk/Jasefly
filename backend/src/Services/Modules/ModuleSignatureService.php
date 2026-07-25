<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Database;

/**
 * Optional ed25519 package signatures (libsodium). Never claims verified without crypto check.
 */
final class ModuleSignatureService
{
    public function __construct(private ?Database $db = null) {}

    /**
     * @return array{status:string, key_id:?string, message:string}
     */
    public function verifyPackageRoot(string $extractedRoot): array
    {
        $sigFile = rtrim($extractedRoot, '/\\') . DIRECTORY_SEPARATOR . 'signature.json';
        if (!is_file($sigFile)) {
            return ['status' => 'unsigned', 'key_id' => null, 'message' => 'No signature.json'];
        }

        $raw = file_get_contents($sigFile);
        $sig = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($sig)) {
            return ['status' => 'invalid', 'key_id' => null, 'message' => 'Invalid signature.json'];
        }

        $algo = (string) ($sig['algorithm'] ?? '');
        $keyId = (string) ($sig['key_id'] ?? '');
        $manifestHash = (string) ($sig['manifest_hash'] ?? '');
        $checksumsHash = (string) ($sig['checksums_hash'] ?? '');
        $signature = (string) ($sig['signature'] ?? '');

        if ($algo !== 'ed25519' || $keyId === '' || $signature === '') {
            return ['status' => 'invalid', 'key_id' => $keyId ?: null, 'message' => 'Unsupported or incomplete signature'];
        }

        $manifestPath = rtrim($extractedRoot, '/\\') . DIRECTORY_SEPARATOR . 'module.json';
        $checksumsPath = rtrim($extractedRoot, '/\\') . DIRECTORY_SEPARATOR . 'checksums.json';
        if (!is_file($manifestPath) || !is_file($checksumsPath)) {
            return ['status' => 'invalid', 'key_id' => $keyId, 'message' => 'Missing files for signature check'];
        }

        $mh = 'sha256:' . hash_file('sha256', $manifestPath);
        $ch = 'sha256:' . hash_file('sha256', $checksumsPath);
        if (!hash_equals($mh, $manifestHash) || !hash_equals($ch, $checksumsHash)) {
            return ['status' => 'mismatch', 'key_id' => $keyId, 'message' => 'signature hashes do not match files'];
        }

        if (!function_exists('sodium_crypto_sign_verify_detached')) {
            return [
                'status' => 'unverifiable',
                'key_id' => $keyId,
                'message' => 'libsodium unavailable — signature present but not verified',
            ];
        }

        $publicKey = $this->lookupPublicKey($keyId);
        if ($publicKey === null) {
            return [
                'status' => 'unknown_key',
                'key_id' => $keyId,
                'message' => 'No trusted public key for key_id',
            ];
        }

        $payload = $manifestHash . "\n" . $checksumsHash;
        $sigBin = base64_decode($signature, true);
        $pubBin = base64_decode($publicKey, true);
        if ($sigBin === false || $pubBin === false) {
            return ['status' => 'invalid', 'key_id' => $keyId, 'message' => 'Malformed signature or key encoding'];
        }

        try {
            $ok = sodium_crypto_sign_verify_detached($sigBin, $payload, $pubBin);
        } catch (\Throwable) {
            return ['status' => 'invalid', 'key_id' => $keyId, 'message' => 'Signature verification error'];
        }

        return $ok
            ? ['status' => 'verified', 'key_id' => $keyId, 'message' => 'Signature verified']
            : ['status' => 'failed', 'key_id' => $keyId, 'message' => 'Signature verification failed'];
    }

    private function lookupPublicKey(string $keyId): ?string
    {
        if ($this->db === null) {
            return null;
        }
        try {
            if (!$this->db->one("SHOW TABLES LIKE 'module_trusted_keys'")) {
                return null;
            }
            $row = $this->db->one(
                'SELECT public_key FROM module_trusted_keys WHERE key_id=? AND is_active=1 LIMIT 1',
                [$keyId]
            );
            return is_array($row) ? (string) ($row['public_key'] ?? '') ?: null : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
