<?php
declare(strict_types=1);

namespace App\Platform\Access;

/** Normalize / validate Access rule DSL (version 1). */
final class AccessRule
{
    /**
     * @param mixed $raw
     * @return array<string, mixed>|null Normalized rule or null if empty/absent
     */
    public static function normalize(mixed $raw): ?array
    {
        if ($raw === null || $raw === '' || $raw === []) {
            return null;
        }
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : null;
        }
        if (!is_array($raw)) {
            return null;
        }

        // Leaf shortcut: { provider, assert, params }
        if (isset($raw['provider'], $raw['assert']) && !isset($raw['rules'])) {
            return [
                'version' => 1,
                'op' => 'all',
                'rules' => [[
                    'provider' => (string) $raw['provider'],
                    'assert' => (string) $raw['assert'],
                    'params' => is_array($raw['params'] ?? null) ? $raw['params'] : [],
                ]],
            ];
        }

        $op = strtolower((string) ($raw['op'] ?? 'all'));
        if (!in_array($op, ['all', 'any', 'not'], true)) {
            $op = 'all';
        }
        $rules = $raw['rules'] ?? [];
        if (!is_array($rules)) {
            $rules = [];
        }
        $normalized = [];
        foreach ($rules as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            if (isset($rule['op'], $rule['rules'])) {
                $child = self::normalize($rule);
                if ($child !== null) {
                    $normalized[] = $child;
                }
                continue;
            }
            $provider = trim((string) ($rule['provider'] ?? ''));
            $assert = trim((string) ($rule['assert'] ?? ''));
            if ($provider === '' || $assert === '') {
                continue;
            }
            $normalized[] = [
                'provider' => $provider,
                'assert' => $assert,
                'params' => is_array($rule['params'] ?? null) ? $rule['params'] : [],
            ];
        }
        if ($normalized === []) {
            return null;
        }
        return [
            'version' => 1,
            'op' => $op,
            'rules' => $normalized,
        ];
    }
}
