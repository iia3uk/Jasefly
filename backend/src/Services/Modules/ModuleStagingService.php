<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Modules\ModulePackagePaths;
use ZipArchive;

/**
 * Extracts packages to isolated staging with Zip Slip protection.
 */
final class ModuleStagingService
{
    public function __construct(
        private ModulePackagePaths $paths,
        private ModulePackageValidator $validator = new ModulePackageValidator(),
    ) {}

    /**
     * @return array{staging_dir:string, package_root:string}
     */
    public function extractZipToStaging(string $zipPath, int $operationId): array
    {
        if (!class_exists(ZipArchive::class)) {
            throw new \RuntimeException('ZipArchive extension required');
        }
        if (!is_file($zipPath)) {
            throw new \RuntimeException('ZIP not found');
        }

        $zipCheck = $this->validator->validateZipFile($zipPath);
        if (!$zipCheck['ok']) {
            throw new \RuntimeException('Invalid package ZIP: ' . implode('; ', $zipCheck['errors']));
        }

        $stagingDir = $this->paths->stagingRoot() . '/' . $operationId;
        if (is_dir($stagingDir)) {
            $this->removeTree($stagingDir);
        }
        if (!@mkdir($stagingDir, 0775, true) && !is_dir($stagingDir)) {
            throw new \RuntimeException('Cannot create staging directory');
        }

        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new \RuntimeException('Cannot open ZIP');
        }

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if ($stat === false) {
                $zip->close();
                throw new \RuntimeException('Unreadable ZIP entry');
            }
            $name = str_replace('\\', '/', (string) ($stat['name'] ?? ''));
            if ($name === '' || $this->validator->isDangerousPath($name)) {
                $zip->close();
                $this->cleanupStaging($operationId);
                throw new \RuntimeException('Illegal ZIP entry path: ' . $name);
            }

            $target = $stagingDir . '/' . $name;
            $targetNorm = str_replace('\\', '/', $target);
            $stagingNorm = str_replace('\\', '/', realpath($stagingDir) ?: $stagingDir);
            if (!str_starts_with(rtrim($targetNorm, '/'), rtrim($stagingNorm, '/'))) {
                $zip->close();
                $this->cleanupStaging($operationId);
                throw new \RuntimeException('Zip slip detected: ' . $name);
            }

            if (str_ends_with($name, '/')) {
                if (!is_dir($target) && !@mkdir($target, 0775, true)) {
                    $zip->close();
                    $this->cleanupStaging($operationId);
                    throw new \RuntimeException('Cannot create directory in staging');
                }
                continue;
            }

            $parent = dirname($target);
            if (!is_dir($parent)) {
                @mkdir($parent, 0775, true);
            }
            $contents = $zip->getFromIndex($i);
            if ($contents === false) {
                $zip->close();
                $this->cleanupStaging($operationId);
                throw new \RuntimeException('Cannot read ZIP entry: ' . $name);
            }
            if (@file_put_contents($target, $contents) === false) {
                $zip->close();
                $this->cleanupStaging($operationId);
                throw new \RuntimeException('Cannot write staged file: ' . $name);
            }
        }

        $zip->close();
        $packageRoot = $this->detectPackageRoot($stagingDir);
        $this->ensureDenyHtaccess($this->paths->installerRoot());
        $this->ensureDenyHtaccess($this->paths->stagingRoot());
        $this->ensureDenyHtaccess($stagingDir);

        return [
            'staging_dir' => $stagingDir,
            'package_root' => $packageRoot,
        ];
    }

    public function detectPackageRoot(string $stagingDir): string
    {
        $stagingDir = rtrim(str_replace('\\', '/', $stagingDir), '/');
        if (is_file($stagingDir . '/module.json')) {
            return $stagingDir;
        }

        $entries = array_diff(scandir($stagingDir) ?: [], ['.', '..']);
        if (count($entries) === 1) {
            $only = $stagingDir . '/' . reset($entries);
            if (is_dir($only) && is_file($only . '/module.json')) {
                return str_replace('\\', '/', $only);
            }
        }

        return $stagingDir;
    }

    public function ensureDenyHtaccess(string $dir): void
    {
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $htaccess = rtrim($dir, '/\\') . '/.htaccess';
        if (is_file($htaccess)) {
            return;
        }
        $content = "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n";
        @file_put_contents($htaccess, $content);
    }

    public function cleanupStaging(int $operationId): void
    {
        $dir = $this->paths->stagingRoot() . '/' . $operationId;
        if (is_dir($dir)) {
            $this->removeTree($dir);
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
}
