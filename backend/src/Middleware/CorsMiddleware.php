<?php
declare(strict_types=1);
namespace App\Middleware;
use App\{Request,Response};
final class CorsMiddleware {
    public function __construct(private array $origins) {}
    public function __invoke(Request $r, callable $next): mixed {
        $origin=$r->header('Origin'); if($origin && (in_array($origin,$this->origins,true) || in_array('*',$this->origins,true))) { header("Access-Control-Allow-Origin: $origin"); header('Vary: Origin'); header('Access-Control-Allow-Credentials: true'); }
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-CSRF-Token'); header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        if($r->method==='OPTIONS') Response::json(['ok'=>true],204); return $next();
    }
}
