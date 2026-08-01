<?php
declare(strict_types=1);

namespace App\Platform\Access\Acl;

/** Context for capability checks (admin ACL + future tenant scopes). */
final class AccessContext
{
    public function __construct(
        public readonly ?int $userId,
        public readonly string $capability,
        public readonly string $scope = 'site',
        public readonly ?int $resourceOwnerId = null,
        public readonly ?int $siteId = 1,
        /** @var array<string, mixed> */
        public readonly array $meta = [],
    ) {}

    /** @param array<string, mixed> $params */
    public static function fromParams(?int $userId, string $capability, array $params = []): self
    {
        $scope = strtolower(trim((string) ($params['scope'] ?? 'site')));
        if (!in_array($scope, ['platform', 'site', 'own', 'any'], true)) {
            $scope = 'site';
        }
        $owner = $params['resource_owner_id'] ?? $params['owner_id'] ?? null;
        $site = $params['site_id'] ?? 1;
        return new self(
            $userId,
            trim($capability),
            $scope,
            $owner !== null && $owner !== '' ? (int) $owner : null,
            $site !== null && $site !== '' ? (int) $site : 1,
            is_array($params['meta'] ?? null) ? $params['meta'] : [],
        );
    }
}
