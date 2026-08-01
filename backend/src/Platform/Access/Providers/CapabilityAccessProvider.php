<?php
declare(strict_types=1);

namespace App\Platform\Access\Providers;

use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;
use App\Platform\Access\Acl\AccessContext;
use App\Platform\Access\Acl\AclEffectiveResolver;

final class CapabilityAccessProvider implements AccessProviderInterface
{
    public function __construct(private AclEffectiveResolver $resolver) {}

    public function id(): string
    {
        return 'capability';
    }

    public function label(): string
    {
        return 'Capability (ACL)';
    }

    public function asserts(): array
    {
        return [
            [
                'id' => 'has',
                'label' => 'Имеет capability',
                'params' => [
                    ['key' => 'capability', 'label' => 'Capability', 'type' => 'text', 'placeholder' => 'content.publish'],
                    ['key' => 'scope', 'label' => 'Scope', 'type' => 'text', 'placeholder' => 'site|own|any|platform'],
                    ['key' => 'resource_owner_id', 'label' => 'Owner user id', 'type' => 'number'],
                ],
            ],
            [
                'id' => 'missing',
                'label' => 'Не имеет capability',
                'params' => [
                    ['key' => 'capability', 'label' => 'Capability', 'type' => 'text'],
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
        $cap = trim((string) ($params['capability'] ?? ''));
        if ($cap === '') {
            return AccessDecision::deny('capability param required', $this->id());
        }
        $ctx = AccessContext::fromParams($userId, $cap, $params);
        $decision = $this->resolver->can($ctx);
        if ($assert === 'missing') {
            return $decision->allowed
                ? AccessDecision::deny('User has capability', $this->id())
                : AccessDecision::allow($this->id(), ['negated' => true]);
        }
        if ($assert !== 'has') {
            return AccessDecision::deny('Unknown capability assert: ' . $assert, $this->id());
        }
        return $decision;
    }
}
