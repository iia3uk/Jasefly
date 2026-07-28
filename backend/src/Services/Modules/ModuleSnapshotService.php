<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Db\SqlTranspiler;
use App\Core\Modules\ModulePackagePaths;
use App\Database;
use App\MigrationException;
use PDO;
use Throwable;
use ZipArchive;

/**
 * File + registry snapshots for module install/update rollback.
 */
final class ModuleSnapshotService
{
    public function __construct(
        private ModulePackagePaths $paths,
        private ModuleRegistryRepository $registry,
    ) {}

    public function createSnapshot(string $slug): string
    {
        $this->paths->assertSlug($slug);
        $backupsRoot = $this->paths->backupsRoot();
        if (!is_dir($backupsRoot)) {
            @mkdir($backupsRoot, 0775, true);
        }
        $this->denyHtaccess($backupsRoot);

        $stamp = gmdate('Ymd-His');
        $zipPath = $backupsRoot . '/' . $slug . '-' . $stamp . '.zip';

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Cannot create backup ZIP');
        }

        $registryRow = $this->registry->getBySlug($slug);
        $migrations = $this->registry->listModuleMigrations($slug);
        $files = $this->registry->listModuleFiles($slug);
        $meta = [
            'slug' => $slug,
            'created_at' => gmdate(DATE_ATOM),
            'registry' => $registryRow,
            'module_migrations' => $migrations,
            'module_files' => $files,
        ];
        $zip->addFromString('snapshot.json', json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        $apiRoot = $this->paths->moduleRoot($slug);
        if (is_dir($apiRoot)) {
            $this->addDirToZip($zip, $apiRoot, 'files/api');
        }
        $publicRoot = $this->paths->publicModuleRoot($slug);
        if (is_dir($publicRoot)) {
            $this->addDirToZip($zip, $publicRoot, 'files/public');
        }

        $zip->close();
        return $zipPath;
    }

    public function restoreSnapshot(string $backupPath, string $slug): void
    {
        $this->paths->assertSlug($slug);
        if (!is_file($backupPath)) {
            throw new \RuntimeException('Backup not found');
        }
        $backupReal = realpath($backupPath);
        $backupsReal = realpath($this->paths->backupsRoot());
        if ($backupReal === false || $backupsReal === false || !str_starts_with(str_replace('\\', '/', $backupReal), str_replace('\\', '/', $backupsReal))) {
            throw new \RuntimeException('Backup path outside allowed directory');
        }

        $zip = new ZipArchive();
        if ($zip->open($backupPath) !== true) {
            throw new \RuntimeException('Cannot open backup ZIP');
        }

        $snapshotJson = $zip->getFromName('snapshot.json');
        if (!is_string($snapshotJson)) {
            $zip->close();
            throw new \RuntimeException('Invalid backup: missing snapshot.json');
        }
        $meta = json_decode($snapshotJson, true);
        if (!is_array($meta)) {
            $zip->close();
            throw new \RuntimeException('Invalid backup metadata');
        }

        $apiTarget = $this->paths->moduleRoot($slug);
        $publicTarget = $this->paths->publicModuleRoot($slug);
        $this->removeTree($apiTarget);
        $this->removeTree($publicTarget);

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if ($stat === false) {
                continue;
            }
            $name = str_replace('\\', '/', (string) ($stat['name'] ?? ''));
            if ($name === 'snapshot.json' || $name === '') {
                continue;
            }
            if ($this->isDangerousPath($name)) {
                $zip->close();
                throw new \RuntimeException('Illegal path in backup: ' . $name);
            }

            if (str_starts_with($name, 'files/api/')) {
                $rel = substr($name, strlen('files/api/'));
                $dest = $apiTarget . '/' . $rel;
            } elseif (str_starts_with($name, 'files/public/')) {
                $rel = substr($name, strlen('files/public/'));
                $dest = $publicTarget . '/' . $rel;
            } else {
                continue;
            }

            if (str_ends_with($name, '/')) {
                @mkdir($dest, 0775, true);
                continue;
            }
            $parent = dirname($dest);
            if (!is_dir($parent)) {
                @mkdir($parent, 0775, true);
            }
            $contents = $zip->getFromIndex($i);
            if ($contents === false) {
                $zip->close();
                throw new \RuntimeException('Cannot read backup entry: ' . $name);
            }
            if (@file_put_contents($dest, $contents) === false) {
                $zip->close();
                throw new \RuntimeException('Cannot restore file: ' . $name);
            }
        }
        $zip->close();

        $registry = $meta['registry'] ?? null;
        if (is_array($registry)) {
            unset($registry['id']);
            $registry['slug'] = $slug;
            $this->registry->upsert($registry);
        }

        $migrations = $meta['module_migrations'] ?? [];
        if (is_array($migrations)) {
            /** @var list<array<string, mixed>> $migrations */
            $this->registry->replaceModuleMigrations($slug, $migrations);
        }

        $files = $meta['module_files'] ?? null;
        if (is_array($files)) {
            $normalized = [];
            foreach ($files as $f) {
                if (!is_array($f)) {
                    continue;
                }
                $rel = (string) ($f['relative_path'] ?? '');
                if ($rel === '') {
                    continue;
                }
                $normalized[] = [
                    'relative_path' => $rel,
                    'sha256' => (string) ($f['sha256'] ?? ''),
                    'size_bytes' => (int) ($f['size_bytes'] ?? 0),
                ];
            }
            $this->registry->replaceModuleFiles($slug, $normalized);
        } else {
            try {
                $this->registry->clearModuleFiles($slug);
            } catch (\Throwable) {
            }
        }
    }

    private function addDirToZip(ZipArchive $zip, string $dir, string $prefix): void
    {
        $dir = rtrim(str_replace('\\', '/', $dir), '/');
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $fileInfo) {
            /** @var \SplFileInfo $fileInfo */
            $full = str_replace('\\', '/', $fileInfo->getPathname());
            $rel = ltrim(substr($full, strlen($dir)), '/');
            $zipPath = $prefix . '/' . $rel;
            if ($fileInfo->isDir()) {
                $zip->addEmptyDir(rtrim($zipPath, '/') . '/');
            } else {
                $zip->addFile($fileInfo->getPathname(), $zipPath);
            }
        }
    }

    private function removeTree(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $item) {
            /** @var \SplFileInfo $item */
            if ($item->isDir()) {
                @rmdir($item->getPathname());
            } else {
                @unlink($item->getPathname());
            }
        }
        @rmdir($dir);
    }

    private function denyHtaccess(string $dir): void
    {
        $htaccess = rtrim($dir, '/\\') . '/.htaccess';
        if (is_file($htaccess)) {
            return;
        }
        @file_put_contents($htaccess, "Require all denied\n");
    }

    private function isDangerousPath(string $name): bool
    {
        if (str_contains($name, "\0")) {
            return true;
        }
        if (str_starts_with($name, '/') || preg_match('#^[A-Za-z]:/#', $name)) {
            return true;
        }
        foreach (explode('/', $name) as $part) {
            if ($part === '..') {
                return true;
            }
        }
        return false;
    }
}
