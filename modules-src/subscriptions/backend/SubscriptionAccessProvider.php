<?php
declare(strict_types=1);

namespace App\PackageModules\Subscriptions;

use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;
use App\Platform\Contracts\PlatformDatabaseInterface;

/** Access provider `subscription` — active plan check. */
final class SubscriptionAccessProvider implements AccessProviderInterface
{
    private ?bool $available = null;

    public function __construct(private PlatformDatabaseInterface $db) {}

    public function id(): string
    {
        return 'subscription';
    }

    public function label(): string
    {
        return 'Подписка';
    }

    public function asserts(): array
    {
        return [
            [
                'id' => 'active',
                'label' => 'Активная подписка',
                'params' => [
                    ['key' => 'plan', 'label' => 'Код плана', 'type' => 'text', 'placeholder' => 'pro'],
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
            $plan = $this->db->one('SELECT id FROM sub_plans LIMIT 1');
            // Without at least one plan row, provider stays unavailable (fail-closed for billing).
            return $this->available = $plan !== null;
        } catch (\Throwable) {
            return $this->available = false;
        }
    }

    public function evaluate(?int $userId, string $assert, array $params = []): AccessDecision
    {
        if (!$this->isAvailable()) {
            return AccessDecision::deny('Subscription provider unavailable (no plans)', $this->id());
        }
        if ($assert !== 'active') {
            return AccessDecision::deny('Unknown subscription assert: ' . $assert, $this->id());
        }
        if ($userId === null || $userId <= 0) {
            return AccessDecision::deny('Authentication required', $this->id());
        }
        $plan = trim((string) ($params['plan'] ?? ''));
        if ($plan === '') {
            return AccessDecision::deny('plan required', $this->id());
        }
        try {
            $row = $this->db->one(
                'SELECT s.id FROM sub_subscriptions s
                 INNER JOIN sub_plans p ON p.id = s.plan_id
                 WHERE s.user_id = ? AND p.code = ? AND s.status = ?
                   AND (s.ends_at IS NULL OR s.ends_at > CURRENT_TIMESTAMP)
                 LIMIT 1',
                [$userId, $plan, 'active']
            );
            return $row
                ? AccessDecision::allow($this->id(), ['plan' => $plan])
                : AccessDecision::deny('No active subscription', $this->id(), ['plan' => $plan]);
        } catch (\Throwable) {
            return AccessDecision::deny('Subscription check failed', $this->id());
        }
    }
}
