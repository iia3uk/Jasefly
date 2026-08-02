<?php
declare(strict_types=1);

namespace App;

/**
 * Minimal HTTP router. Shared-hosting friendly — no external deps.
 */
final class Router
{
    /** @var list<array{method:string,path:string,handler:callable,middleware:list<callable>}> */
    private array $routes = [];
    /** @var array<string, true> METHOD\0path → claimed */
    private array $routeIndex = [];
    /** @var list<callable> */
    private array $middleware = [];

    public function middleware(callable $m): void
    {
        $this->middleware[] = $m;
    }

    public function add(string $method, string $path, callable $handler, array $middleware = []): void
    {
        $method = strtoupper($method);
        $key = $method . "\0" . $path;
        if (isset($this->routeIndex[$key])) {
            throw new RouteConflictException($method, $path);
        }
        $this->routeIndex[$key] = true;
        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'handler' => $handler,
            'middleware' => $middleware,
        ];
    }

    public function get(string $p, callable $h, array $m = []): void
    {
        $this->add('GET', $p, $h, $m);
    }

    public function post(string $p, callable $h, array $m = []): void
    {
        $this->add('POST', $p, $h, $m);
    }

    public function put(string $p, callable $h, array $m = []): void
    {
        $this->add('PUT', $p, $h, $m);
    }

    public function patch(string $p, callable $h, array $m = []): void
    {
        $this->add('PATCH', $p, $h, $m);
    }

    public function delete(string $p, callable $h, array $m = []): void
    {
        $this->add('DELETE', $p, $h, $m);
    }

    /**
     * Resolve a request without executing handlers.
     *
     * @return array{
     *   status:int,
     *   allow?:list<string>,
     *   params?:array<string,string>,
     *   handler?:callable,
     *   middleware?:list<callable>
     * }
     */
    public function match(Request $r): array
    {
        $method = strtoupper($r->method);
        $path = $r->path;
        $allowed = [];

        foreach ($this->routes as $route) {
            $re = '#^' . preg_replace('#\{([a-zA-Z_]\w*)\}#', '(?P<$1>[^/]+)', $route['path']) . '$#';
            if (!preg_match($re, $path, $matches)) {
                continue;
            }
            $allowed[$route['method']] = true;
            if ($route['method'] !== $method) {
                continue;
            }

            $params = [];
            foreach ($matches as $k => $v) {
                if (!is_string($k)) {
                    continue;
                }
                $params[$k] = rawurldecode((string) $v);
            }

            return [
                'status' => 200,
                'params' => $params,
                'handler' => $route['handler'],
                'middleware' => array_merge($this->middleware, $route['middleware']),
            ];
        }

        if ($allowed !== []) {
            $methods = array_keys($allowed);
            sort($methods);
            return ['status' => 405, 'allow' => $methods];
        }

        return ['status' => 404];
    }

    public function dispatch(Request $r): never
    {
        $matched = $this->match($r);

        if (($matched['status'] ?? 404) === 405) {
            $allow = $matched['allow'] ?? [];
            if ($allow !== [] && !headers_sent()) {
                header('Allow: ' . implode(', ', $allow));
            }
            Response::error('Method not allowed', 405);
        }

        if (($matched['status'] ?? 404) !== 200 || !isset($matched['handler'])) {
            // Still run global middleware on 404 so DemoGuard can serve sandbox
            // responses for admin paths whose production modules are disabled.
            $run = $this->middleware;
            $next = static fn () => Response::error('Not found', 404);
            foreach (array_reverse($run) as $m) {
                $old = $next;
                $next = static fn () => $m($r, $old);
            }
            $next();
            exit;
        }

        /** @var callable $handler */
        $handler = $matched['handler'];
        /** @var array<string, string> $params */
        $params = $matched['params'] ?? [];
        /** @var list<callable> $run */
        $run = $matched['middleware'] ?? [];

        $next = static fn () => $handler($r, ...array_values($params));
        foreach (array_reverse($run) as $m) {
            $old = $next;
            $next = static fn () => $m($r, $old);
        }
        $next();
        exit;
    }
}
