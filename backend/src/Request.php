<?php
declare(strict_types=1);
namespace App;
final class Request {
    private array $body = [];
    private string $rawBody = '';
    public ?array $user = null;
    public function __construct(public string $method, public string $path) {
        $this->rawBody = file_get_contents('php://input') ?: '';
        $type = $_SERVER['CONTENT_TYPE'] ?? '';
        if (str_contains($type, 'application/json') && $this->rawBody !== '') {
            $this->body = json_decode($this->rawBody, true) ?: [];
        } elseif ($method !== 'GET') {
            $this->body = $_POST;
        }
    }
    public static function fromGlobals(): self { $u=parse_url($_SERVER['REQUEST_URI'] ?? '/',PHP_URL_PATH) ?: '/'; return new self($_SERVER['REQUEST_METHOD'] ?? 'GET',$u); }
    public function input(string $key, mixed $default=null): mixed { return $this->body[$key] ?? $default; }
    public function all(): array { return $this->body; }
    /** Raw request body (needed for HMAC webhook signature verification). */
    public function rawBody(): string { return $this->rawBody; }
    public function query(string $key,mixed $default=null): mixed { return $_GET[$key] ?? $default; }
    public function file(string $key): ?array { return $_FILES[$key] ?? null; }
    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if (!empty($_SERVER[$key])) {
            return (string) $_SERVER[$key];
        }
        // Apache CGI / FastCGI / rewrite often puts Authorization here
        if (strcasecmp($name, 'Authorization') === 0) {
            foreach (['REDIRECT_HTTP_AUTHORIZATION', 'HTTP_AUTHORIZATION', 'Authorization'] as $alt) {
                if (!empty($_SERVER[$alt])) {
                    return (string) $_SERVER[$alt];
                }
            }
            if (function_exists('getallheaders')) {
                $headers = getallheaders();
                if (is_array($headers)) {
                    foreach ($headers as $hk => $hv) {
                        if (strcasecmp((string) $hk, 'Authorization') === 0 && $hv !== '') {
                            return (string) $hv;
                        }
                    }
                }
            }
        }
        return null;
    }
    public function bearer(): ?string { $v=$this->header('Authorization') ?? ''; return preg_match('/^Bearer\s+(.+)$/i',$v,$m)?$m[1]:null; }
    /**
     * Client IP. Prefers CMS_REAL_IP set by DDoS/edge middleware after the
     * connecting peer was verified as a trusted reverse-proxy.
     */
    public function ip(): string
    {
        $trusted = $_SERVER['CMS_REAL_IP'] ?? '';
        if (is_string($trusted) && $trusted !== '' && filter_var($trusted, FILTER_VALIDATE_IP)) {
            return $trusted;
        }
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
}
