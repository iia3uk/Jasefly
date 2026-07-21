<?php
declare(strict_types=1);
namespace App;
final class Router {
    private array $routes=[]; private array $middleware=[];
    public function middleware(callable $m): void { $this->middleware[]=$m; }
    public function add(string $method,string $path,callable $handler,array $middleware=[]): void { $this->routes[]=compact('method','path','handler','middleware'); }
    public function get(string $p,callable $h,array $m=[]): void {$this->add('GET',$p,$h,$m);} public function post(string $p,callable $h,array $m=[]): void {$this->add('POST',$p,$h,$m);}
    public function put(string $p,callable $h,array $m=[]): void {$this->add('PUT',$p,$h,$m);} public function delete(string $p,callable $h,array $m=[]): void {$this->add('DELETE',$p,$h,$m);}
    public function dispatch(Request $r): never {
        foreach($this->routes as $route) { $re='#^'.preg_replace('#\{([a-zA-Z_]\w*)\}#','(?P<$1>[^/]+)',$route['path']).'$#';
            if ($route['method']===$r->method && preg_match($re,$r->path,$matches)) {
                $params=array_filter($matches,'is_string',ARRAY_FILTER_USE_KEY); $run=array_merge($this->middleware,$route['middleware']);
                $next=fn() => ($route['handler'])($r,...array_values($params));
                foreach(array_reverse($run) as $m) { $old=$next; $next=fn()=>$m($r,$old); } $next(); exit;
            }
        } Response::error('Not found',404);
    }
}
