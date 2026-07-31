<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\ModuleRegistry;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\RouteConflictException;

/**
 * Isolates a broken / policy-violating package module so core API keeps booting.
 * Records structured error (reason / class / message / file / time).
 */
final class ModuleQuarantine
{
    public function __construct(
        private ModuleRegistryRepository $registry,
        private ModuleSafeMode $safeMode,
        private Database $db,
    ) {}

    /**
     * @return array{
     *   reason:string,
     *   class:string,
     *   error:string,
     *   file:?string,
     *   line:?int,
     *   stage:string,
     *   at:string
     * }
     */
    public static function detailFromThrowable(\Throwable $e, string $stage): array
    {
        $reason = ModuleQuarantineReason::EXCEPTION;
        if ($e instanceof ModuleQuarantineViolation) {
            $reason = $e->reason;
            if ($e->stage !== '') {
                $stage = $e->stage;
            }
        } elseif ($e instanceof RouteConflictException) {
            $reason = ModuleQuarantineReason::ROUTE_CONFLICT;
            $stage = 'register_routes';
        }

        $file = $e->getFile();
        $file = is_string($file) && $file !== '' ? $file : null;
        $msg = trim($e->getMessage());
        if ($msg === '') {
            $msg = $e::class;
        }
        return [
            'reason' => $reason,
            'class' => $e::class,
            'error' => function_exists('mb_substr') ? mb_substr($msg, 0, 2000) : substr($msg, 0, 2000),
            'file' => $file,
            'line' => $e->getLine() > 0 ? $e->getLine() : null,
            'stage' => $stage,
            'at' => gmdate(DATE_ATOM),
        ];
    }

    /**
     * @return array{reason:string,class:string,error:string,file:?string,line:?int,stage:string,at:string}
     */
    public function isolate(string $slug, \Throwable $e, string $stage, ?ModuleRegistry $modules = null): array
    {
        return $this->isolateDetail($slug, self::detailFromThrowable($e, $stage), $modules);
    }

    /**
     * Quarantine by explicit reason (no exception required).
     *
     * @return array{reason:string,class:string,error:string,file:?string,line:?int,stage:string,at:string}
     */
    public function isolateReason(
        string $slug,
        string $reason,
        string $message,
        string $stage,
        ?ModuleRegistry $modules = null,
    ): array {
        $detail = [
            'reason' => $reason,
            'class' => ModuleQuarantineViolation::class,
            'error' => function_exists('mb_substr') ? mb_substr(trim($message), 0, 2000) : substr(trim($message), 0, 2000),
            'file' => null,
            'line' => null,
            'stage' => $stage,
            'at' => gmdate(DATE_ATOM),
        ];
        return $this->isolateDetail($slug, $detail, $modules);
    }

    /**
     * @param array{reason:string,class:string,error:string,file:?string,line:?int,stage:string,at:string} $detail
     * @return array{reason:string,class:string,error:string,file:?string,line:?int,stage:string,at:string}
     */
    private function isolateDetail(string $slug, array $detail, ?ModuleRegistry $modules): array
    {
        $summary = '[' . $detail['reason'] . '] ' . $detail['class'] . ': ' . $detail['error'];
        if ($detail['file']) {
            $summary .= ' @ ' . $detail['file'] . ($detail['line'] ? ':' . $detail['line'] : '');
        }

        @error_log('ModuleQuarantine [' . $detail['stage'] . '] ' . $slug . ': ' . $summary);

        try {
            $this->safeMode->markFailed($slug, $detail);
        } catch (\Throwable $safeErr) {
            @error_log('ModuleQuarantine safeMode: ' . $safeErr->getMessage());
        }

        try {
            $this->registry->setStatus($slug, 'failed', $summary, 'quarantined');
        } catch (\Throwable $dbErr) {
            @error_log('ModuleQuarantine setStatus: ' . $dbErr->getMessage());
        }

        if ($modules !== null) {
            $modules->recordLoadFailure(
                $slug,
                $detail['stage'],
                $summary,
                $detail['class'],
                $detail['file'],
                $detail['line'],
                $detail['at'],
            );
            $modules->unregister($slug);
        }

        try {
            (new ModulePluginMirror($this->db))->mirror($slug, false);
        } catch (\Throwable $mirrorErr) {
            if ($modules !== null) {
                $modules->recordLoadFailure($slug, 'plugin_mirror', $mirrorErr->getMessage());
            }
        }

        return $detail;
    }

    public static function isPackageModule(object $module): bool
    {
        return $module instanceof PackageModuleAdapter;
    }
}
