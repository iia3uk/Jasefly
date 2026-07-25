<?php
declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\EventDispatcher;
use App\Database;
use App\Services\Modules\ModuleMigrationService;

/**
 * Restricted context for install/update/uninstall hooks.
 * No shell, no Core file writes, no registry mutation outside APIs.
 */
final class ModuleInstallContext
{
    /** @var list<string> */
    private array $log = [];

    public function __construct(
        public readonly Database $db,
        public readonly array $app,
        public readonly ModuleManifest $manifest,
        public readonly string $moduleRoot,
        public readonly string $storageRoot,
        public readonly string $operation,
        public readonly ?EventDispatcher $events = null,
        public readonly ?ModuleMigrationService $migrations = null,
    ) {}

    public function log(string $message): void
    {
        $msg = trim($message);
        if ($msg === '') {
            return;
        }
        // Never log secrets-looking lines
        if (preg_match('/(password|secret|token|api[_-]?key|private[_-]?key)\s*[:=]/i', $msg)) {
            $msg = '[redacted log line]';
        }
        $this->log[] = $msg;
    }

    /** @return list<string> */
    public function logs(): array
    {
        return $this->log;
    }

    public function storagePath(string $relative = ''): string
    {
        $rel = ltrim(str_replace('\\', '/', $relative), '/');
        if ($rel !== '' && (str_contains($rel, '..') || str_starts_with($rel, '/'))) {
            throw new \InvalidArgumentException('Invalid storage path');
        }
        $base = rtrim($this->storageRoot, '/\\');
        return $rel === '' ? $base : $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    }
}
