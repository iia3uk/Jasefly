<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Request;
use App\Response;
use App\Services\PermissionService;
use App\Services\SystemHealthService;
use App\Support\HttpsPolicy;

final class SystemController
{
    public function __construct(
        private SystemHealthService $health,
        private PermissionService $permissions,
        private array $app = [],
        private mixed $db = null,
    ) {}

    public function status(Request $r): never
    {
        $this->permissions->require($r->user ?? [], 'system.manage');
        Response::json(['data' => $this->health->status()]);
    }

    public function https(Request $r): never
    {
        $this->permissions->require($r->user ?? [], 'system.manage');
        $storage = isset($this->app['storage']) ? (string) $this->app['storage'] : null;
        $body = $r->all();

        if (isset($body['mode']) && is_string($body['mode'])) {
            HttpsPolicy::setMode($body['mode'], $storage);
        }

        $probe = !empty($body['probe']);
        $probeResult = null;
        if ($probe) {
            $db = $this->db instanceof \App\Database ? $this->db : null;
            $probeResult = HttpsPolicy::probe($db, $this->app, $storage);
        }

        $status = HttpsPolicy::status(
            $this->db instanceof \App\Database ? $this->db : null,
            $this->app,
            $storage
        );
        if ($probeResult !== null) {
            $status['last_probe'] = $probeResult;
        }

        Response::json([
            'success' => true,
            'data' => $status,
            'message' => $probe
                ? (($probeResult['ok'] ?? false)
                    ? 'Сертификат доступен — редирект на HTTPS включён'
                    : 'Проверка TLS не удалась (на shared-хостинге часто loopback; откройте https:// вручную или включите force)')
                : 'HTTPS-политика обновлена',
        ]);
    }

    public function roles(Request $r): never
    {
        Response::json(['data' => $this->permissions->roles()]);
    }

    public function permissions(Request $r): never
    {
        Response::json(['data' => $this->permissions->permissions()]);
    }
}
