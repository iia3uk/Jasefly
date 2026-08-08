<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Controllers\AuthController;
use App\Database;
use App\Platform\Contracts\PlatformAuthInterface;
use App\Platform\Contracts\PlatformRequestInterface;
use App\Request;

/** Host bridge for package-auth lifecycle extensions. */
final class AuthAdapter implements PlatformAuthInterface
{
    /** @var array<string,list<callable(array<string,mixed>):?string>> */
    private static array $gates = [];

    public function __construct(private Database $db, private array $app, private string $owner) {}

    public function registerLoginGate(callable $gate): void
    {
        self::$gates[$this->owner][] = $gate;
    }

    public function clearOwner(): void
    {
        unset(self::$gates[$this->owner]);
    }

    /** @param array<string,mixed> $user */
    public static function loginBlock(array $user): ?string
    {
        foreach (self::$gates as $gates) {
            foreach ($gates as $gate) {
                $blocked = $gate($user);
                if (is_string($blocked) && $blocked !== '') {
                    return $blocked;
                }
            }
        }
        return null;
    }

    public function completeLogin(PlatformRequestInterface $request, array $user, array $extraPayload = []): never
    {
        $raw = $request->raw();
        if (!$raw instanceof Request) {
            throw new \RuntimeException('Host request is unavailable');
        }
        (new AuthController($this->db, $this->app))->completeLogin($raw, $user, $extraPayload);
    }
}
