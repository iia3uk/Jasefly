<?php
declare(strict_types=1);
namespace App\Middleware;

use App\Core\Container;
use App\Jwt;
use App\Request;
use App\Response;

final class AuthMiddleware
{
    public function __construct(
        private string $secret,
        private ?string $mcpApiToken = null,
    ) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        $bearer = $r->bearer() ?? '';

        $mcpToken = $this->mcpApiToken;
        if ($mcpToken === null) {
            $mcpToken = $this->resolveMcpToken();
        }

        // Long-lived machine token for MCP / automation (config.local.php → mcp_api_token)
        if ($mcpToken !== '' && $bearer !== '' && hash_equals($mcpToken, $bearer)) {
            $r->user = [
                'sub' => null,
                'email' => 'mcp@cms.local',
                'name' => 'MCP Agent',
                'role' => 'super_admin',
                'type' => 'access',
                'auth' => 'mcp_token',
            ];
            return $next();
        }

        try {
            $r->user = Jwt::decode($bearer, $this->secret);
            if (($r->user['type'] ?? '') !== 'access') {
                throw new \RuntimeException('Invalid token type');
            }
            if (!isset($r->user['name']) && isset($r->user['sub'])) {
                $r->user['name'] = $r->user['email'] ?? 'Admin';
            }
        } catch (\Throwable) {
            Response::error('Unauthorized', 401);
        }
        return $next();
    }

    private function resolveMcpToken(): string
    {
        try {
            if (!Container::getInstance()->has('app')) {
                return '';
            }
            $app = Container::getInstance()->get('app');
            if (!is_array($app)) {
                return '';
            }
            return (string) ($app['mcp_api_token'] ?? '');
        } catch (\Throwable) {
            return '';
        }
    }
}
