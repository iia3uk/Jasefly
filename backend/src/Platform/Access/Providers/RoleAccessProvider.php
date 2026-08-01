<?php
declare(strict_types=1);

namespace App\Platform\Access\Providers;

use App\Database;
use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;

final class RoleAccessProvider implements AccessProviderInterface
{
    public function __construct(private Database $db) {}

    public function id(): string
    {
        return 'role';
    }

    public function label(): string
    {
        return 'Роль';
    }

    public function asserts(): array
    {
        return [
            [
                'id' => 'in',
                'label' => 'Одна из ролей',
                'params' => [
                    ['key' => 'roles', 'label' => 'Роли', 'type' => 'string_list', 'placeholder' => 'member, admin'],
                ],
            ],
            [
                'id' => 'not_in',
                'label' => 'Не эти роли',
                'params' => [
                    ['key' => 'roles', 'label' => 'Роли', 'type' => 'string_list'],
                ],
            ],
        ];
    }

    public function isAvailable(): bool
    {
        return true;
    }

    public function evaluate(?int $userId, string $assert, array $params = []): AccessDecision
    {
        if ($userId === null || $userId <= 0) {
            return AccessDecision::deny('Authentication required', $this->id());
        }
        $wanted = $this->normalizeRoles($params['roles'] ?? []);
        if ($wanted === []) {
            return AccessDecision::deny('No roles configured', $this->id());
        }
        $userRoles = $this->userRoles($userId);
        $overlap = array_values(array_intersect($userRoles, $wanted));
        $in = $overlap !== [];
        return match ($assert) {
            'in' => $in
                ? AccessDecision::allow($this->id(), ['roles' => $userRoles, 'matched' => $overlap])
                : AccessDecision::deny('Role not allowed', $this->id(), ['roles' => $userRoles]),
            'not_in' => !$in
                ? AccessDecision::allow($this->id(), ['roles' => $userRoles])
                : AccessDecision::deny('Role excluded', $this->id(), ['roles' => $userRoles, 'matched' => $overlap]),
            default => AccessDecision::deny('Unknown role assert: ' . $assert, $this->id()),
        };
    }

    /** @param mixed $raw @return list<string> */
    private function normalizeRoles(mixed $raw): array
    {
        if (is_string($raw)) {
            $raw = preg_split('/[\s,]+/', $raw) ?: [];
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $r) {
            $s = strtolower(trim((string) $r));
            if ($s !== '') {
                $out[] = $s;
            }
        }
        return array_values(array_unique($out));
    }

    /** @return list<string> */
    private function userRoles(int $userId): array
    {
        try {
            $rows = $this->db->all(
                'SELECT r.slug FROM user_roles ur
                 INNER JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = ?',
                [$userId]
            );
            $slugs = array_map(static fn(array $r): string => strtolower(trim((string) $r['slug'])), $rows);
            if ($slugs !== []) {
                return array_values(array_unique($slugs));
            }
        } catch (\Throwable) {
            // legacy
        }
        try {
            $row = $this->db->one('SELECT role FROM users WHERE id=? LIMIT 1', [$userId]);
            $role = strtolower(trim((string) ($row['role'] ?? '')));
            return $role !== '' ? [$role] : [];
        } catch (\Throwable) {
            return [];
        }
    }
}
