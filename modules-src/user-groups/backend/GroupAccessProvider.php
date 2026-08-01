<?php
declare(strict_types=1);

namespace App\PackageModules\UserGroups;

use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;
use App\Platform\Contracts\PlatformDatabaseInterface;

/** Access provider `group` — member_of by group_id. */
final class GroupAccessProvider implements AccessProviderInterface
{
    private ?bool $available = null;

    public function __construct(private PlatformDatabaseInterface $db) {}

    public function id(): string
    {
        return 'group';
    }

    public function label(): string
    {
        return 'Группа';
    }

    public function asserts(): array
    {
        return [
            [
                'id' => 'member_of',
                'label' => 'Участник группы',
                'params' => [
                    ['key' => 'group_id', 'label' => 'ID группы', 'type' => 'number', 'placeholder' => '3'],
                ],
            ],
        ];
    }

    public function isAvailable(): bool
    {
        if ($this->available !== null) {
            return $this->available;
        }
        try {
            $this->db->one('SELECT id FROM ug_groups LIMIT 1');
            return $this->available = true;
        } catch (\Throwable) {
            return $this->available = false;
        }
    }

    public function evaluate(?int $userId, string $assert, array $params = []): AccessDecision
    {
        if (!$this->isAvailable()) {
            return AccessDecision::deny('Group provider unavailable', $this->id());
        }
        if ($assert !== 'member_of') {
            return AccessDecision::deny('Unknown group assert: ' . $assert, $this->id());
        }
        if ($userId === null || $userId <= 0) {
            return AccessDecision::deny('Authentication required', $this->id());
        }
        $groupId = (int) ($params['group_id'] ?? 0);
        if ($groupId <= 0) {
            return AccessDecision::deny('group_id required', $this->id());
        }
        try {
            $row = $this->db->one(
                'SELECT id FROM ug_memberships WHERE user_id = ? AND group_id = ? LIMIT 1',
                [$userId, $groupId]
            );
            return $row
                ? AccessDecision::allow($this->id(), ['group_id' => $groupId])
                : AccessDecision::deny('Not a group member', $this->id(), ['group_id' => $groupId]);
        } catch (\Throwable $e) {
            return AccessDecision::deny('Group check failed', $this->id());
        }
    }
}
