<?php
declare(strict_types=1);

namespace App\Platform\Access;

use App\Database;
use App\Platform\Access\Acl\AccessContext;
use App\Platform\Access\Acl\AclCapabilityCatalog;
use App\Platform\Access\Acl\AclEffectiveResolver;
use App\Platform\Access\Providers\AuthAccessProvider;
use App\Platform\Access\Providers\CapabilityAccessProvider;
use App\Platform\Access\Providers\RoleAccessProvider;
use App\Platform\Contracts\PlatformAccessInterface;

final class AccessService implements PlatformAccessInterface
{
    private ?AclCapabilityCatalog $catalog = null;
    private ?AclEffectiveResolver $resolver = null;
    private AdminNavRegistry $navRegistry;

    public function __construct(
        private AccessProviderRegistry $registry,
        private ?Database $db = null,
    ) {
        $this->navRegistry = new AdminNavRegistry();
    }

    public function registerBuiltins(): void
    {
        if (!$this->registry->has('auth')) {
            $this->registry->register(new AuthAccessProvider());
        }
        if ($this->db !== null && !$this->registry->has('role')) {
            $this->registry->register(new RoleAccessProvider($this->db));
        }
        if ($this->db !== null && !$this->registry->has('capability')) {
            $this->registry->register(new CapabilityAccessProvider($this->resolver()));
        }
    }

    public function catalog(): AclCapabilityCatalog
    {
        return $this->catalog ??= new AclCapabilityCatalog($this->db);
    }

    public function resolver(): AclEffectiveResolver
    {
        if ($this->resolver === null) {
            if ($this->db === null) {
                throw new \RuntimeException('AccessService ACL requires Database');
            }
            $this->resolver = new AclEffectiveResolver($this->db, $this->catalog());
        }
        return $this->resolver;
    }

    public function navRegistry(): AdminNavRegistry
    {
        return $this->navRegistry;
    }

    public function registerProvider(AccessProviderInterface $provider): void
    {
        $this->registry->register($provider);
    }

    public function can(?int $userId, ?array $rule): AccessDecision
    {
        $normalized = AccessRule::normalize($rule);
        if ($normalized === null) {
            return AccessDecision::allow(null, ['empty_rule' => true]);
        }
        return $this->evaluateNode($userId, $normalized);
    }

    public function canCapability(AccessContext $ctx): AccessDecision
    {
        if ($this->db === null) {
            return AccessDecision::deny('ACL unavailable', 'capability');
        }
        return $this->resolver()->can($ctx);
    }

    public function batchCan(?int $userId, array $capabilities): array
    {
        $out = [];
        foreach ($capabilities as $cap) {
            $cap = trim((string) $cap);
            if ($cap === '') {
                continue;
            }
            $out[$cap] = $this->canCapability(new AccessContext($userId, $cap))->allowed;
        }
        return $out;
    }

    public function explain(?int $userId, string $capability): array
    {
        if ($userId === null || $userId <= 0 || $this->db === null) {
            return [
                'capability' => $capability,
                'allowed' => false,
                'reason' => 'Authentication required',
                'sources' => [],
            ];
        }
        return $this->resolver()->explain($userId, $capability);
    }

    public function effectiveCapabilities(?int $userId): array
    {
        return $this->effectiveBundle($userId)['caps'];
    }

    public function effectiveBundle(?int $userId): array
    {
        if ($userId === null || $userId <= 0 || $this->db === null) {
            return ['caps' => [], 'is_super' => false, 'roles' => [], 'version' => '0'];
        }
        return $this->resolver()->resolve($userId);
    }

    public function registerCapability(array $def): void
    {
        $this->catalog()->register($def);
    }

    public function registerAdminNavItem(array $item): void
    {
        $this->navRegistry->register($item);
    }

    public function capabilityCatalog(): array
    {
        return $this->catalog()->list();
    }

    public function providers(): array
    {
        $out = [];
        foreach ($this->registry->all() as $provider) {
            $out[] = [
                'id' => $provider->id(),
                'label' => $provider->label(),
                'available' => $provider->isAvailable(),
                'asserts' => $provider->asserts(),
            ];
        }
        usort($out, static fn(array $a, array $b): int => strcmp((string) $a['id'], (string) $b['id']));
        return $out;
    }

    public function filterLayout(?array $layout, ?int $userId, bool $staffBypass = false): ?array
    {
        if ($layout === null || $staffBypass) {
            return $layout;
        }
        if (!isset($layout['elements']) || !is_array($layout['elements'])) {
            return $layout;
        }
        $layout['elements'] = $this->filterElements($layout['elements'], $userId);
        return $layout;
    }

    /** @param list<mixed> $elements @return list<array<string, mixed>> */
    private function filterElements(array $elements, ?int $userId): array
    {
        $out = [];
        foreach ($elements as $el) {
            if (!is_array($el)) {
                continue;
            }
            $filtered = $this->filterElement($el, $userId);
            if ($filtered !== null) {
                $out[] = $filtered;
            }
        }
        return $out;
    }

    /** @param array<string, mixed> $el @return array<string, mixed>|null */
    private function filterElement(array $el, ?int $userId): ?array
    {
        $type = (string) ($el['type'] ?? '');
        $settings = is_array($el['settings'] ?? null) ? $el['settings'] : [];
        $isAccessContainer = $type === 'access-container';
        $inlineRule = $settings['access'] ?? $settings['rule'] ?? null;
        if ($isAccessContainer) {
            $inlineRule = $settings['rule'] ?? $settings['access'] ?? null;
        }

        $hasRule = AccessRule::normalize($inlineRule) !== null;
        if (($isAccessContainer || $hasRule) && $hasRule) {
            $decision = $this->can($userId, is_array($inlineRule) ? $inlineRule : null);
            if (!$decision->allowed) {
                $denyMode = (string) ($settings['deny_mode'] ?? 'hide');
                if ($denyMode === 'hide' || $denyMode === '') {
                    return null;
                }
                $el['settings'] = $settings;
                $el['settings']['_access_denied'] = true;
                $el['settings']['_access_reason'] = $decision->reason;
                $el['elements'] = [];
                return $el;
            }
        }

        if (isset($el['elements']) && is_array($el['elements'])) {
            $el['elements'] = $this->filterElements($el['elements'], $userId);
        }
        return $el;
    }

    /** @param array<string, mixed> $node */
    private function evaluateNode(?int $userId, array $node): AccessDecision
    {
        $op = (string) ($node['op'] ?? 'all');
        $rules = is_array($node['rules'] ?? null) ? $node['rules'] : [];
        if ($rules === []) {
            return AccessDecision::allow(null, ['empty_rules' => true]);
        }

        if ($op === 'not') {
            $first = $rules[0];
            $inner = is_array($first) && isset($first['op'])
                ? $this->evaluateNode($userId, $first)
                : $this->evaluateLeaf($userId, is_array($first) ? $first : []);
            return $inner->allowed
                ? AccessDecision::deny('Negated rule matched', $inner->provider)
                : AccessDecision::allow($inner->provider, ['negated' => true]);
        }

        $lastDeny = AccessDecision::deny('Access denied');
        foreach ($rules as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            $decision = isset($rule['op'], $rule['rules'])
                ? $this->evaluateNode($userId, $rule)
                : $this->evaluateLeaf($userId, $rule);
            if ($op === 'any' && $decision->allowed) {
                return $decision;
            }
            if ($op === 'all' && !$decision->allowed) {
                return $decision;
            }
            if (!$decision->allowed) {
                $lastDeny = $decision;
            }
        }
        if ($op === 'any') {
            return $lastDeny;
        }
        return AccessDecision::allow();
    }

    /** @param array<string, mixed> $leaf */
    private function evaluateLeaf(?int $userId, array $leaf): AccessDecision
    {
        $providerId = trim((string) ($leaf['provider'] ?? ''));
        $assert = trim((string) ($leaf['assert'] ?? ''));
        $params = is_array($leaf['params'] ?? null) ? $leaf['params'] : [];
        if ($providerId === '' || $assert === '') {
            return AccessDecision::deny('Invalid rule leaf');
        }
        $provider = $this->registry->get($providerId);
        if ($provider === null) {
            return AccessDecision::deny('Unknown provider: ' . $providerId, $providerId);
        }
        if (!$provider->isAvailable()) {
            return AccessDecision::deny('Provider unavailable: ' . $providerId, $providerId);
        }
        return $provider->evaluate($userId, $assert, $params);
    }
}
