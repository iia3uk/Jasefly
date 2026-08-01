<?php
declare(strict_types=1);

namespace App\Platform\Access\Providers;

use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;

final class AuthAccessProvider implements AccessProviderInterface
{
    public function id(): string
    {
        return 'auth';
    }

    public function label(): string
    {
        return 'Авторизация';
    }

    public function asserts(): array
    {
        return [
            ['id' => 'guest', 'label' => 'Только гость'],
            ['id' => 'authenticated', 'label' => 'Авторизован'],
        ];
    }

    public function isAvailable(): bool
    {
        return true;
    }

    public function evaluate(?int $userId, string $assert, array $params = []): AccessDecision
    {
        $loggedIn = $userId !== null && $userId > 0;
        return match ($assert) {
            'guest' => $loggedIn
                ? AccessDecision::deny('User is authenticated', $this->id())
                : AccessDecision::allow($this->id()),
            'authenticated' => $loggedIn
                ? AccessDecision::allow($this->id())
                : AccessDecision::deny('Authentication required', $this->id()),
            default => AccessDecision::deny('Unknown auth assert: ' . $assert, $this->id()),
        };
    }
}
