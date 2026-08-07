<?php
declare(strict_types=1);
namespace App\Middleware;

use App\Core\Container;
use App\Database;
use App\Jwt;
use App\Modules\Demo\DemoCookie;
use App\Request;
use App\Response;
use App\Support\AuthCookie;
use App\Support\McpRequestAuth;

final class AuthMiddleware
{
    public function __construct(
        private string $secret,
        private ?string $mcpApiToken = null,
    ) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        $bearer = $r->bearer() ?? '';
        if ($bearer === '') {
            // Prefer production media cookie over demo cookie when both exist.
            $bearer = AuthCookie::token() ?? DemoCookie::token() ?? '';
        }

        $app = $this->resolveApp();
        if ($this->mcpApiToken !== null && $this->mcpApiToken !== '') {
            $app['mcp_api_token'] = $this->mcpApiToken;
        }

        $mcp = McpRequestAuth::authenticate($r, $app, $this->resolveDb());
        if ($mcp['status'] === 'authenticated') {
            $r->user = $mcp['user'] ?? McpRequestAuth::mcpUser();
            return $next();
        }
        if ($mcp['status'] === 'rejected') {
            Response::error('Unauthorized', 401);
        }

        try {
            $r->user = Jwt::decode($bearer, $this->secret);
            $type = (string) ($r->user['type'] ?? '');
            // Production sessions: type=access. Demo sandbox: type=demo_access (never super / mcp).
            if ($type === 'demo_access' && !empty($r->user['is_demo'])) {
                $r->user['role'] = 'demo_explorer';
                $r->user['auth'] = 'demo';
                $r->user['is_demo'] = true;
                unset($r->user['is_super']);
            } elseif ($type !== 'access') {
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

    /** @return array<string, mixed> */
    private function resolveApp(): array
    {
        try {
            if (!Container::getInstance()->has('app')) {
                return ['mcp_api_token' => $this->mcpApiToken ?? ''];
            }
            $app = Container::getInstance()->get('app');
            return is_array($app) ? $app : ['mcp_api_token' => $this->mcpApiToken ?? ''];
        } catch (\Throwable) {
            return ['mcp_api_token' => $this->mcpApiToken ?? ''];
        }
    }

    private function resolveDb(): ?Database
    {
        try {
            if (!Container::getInstance()->has('db')) {
                return null;
            }
            $db = Container::getInstance()->get('db');
            return $db instanceof Database ? $db : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
