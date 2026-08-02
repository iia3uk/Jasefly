<?php
declare(strict_types=1);

namespace App\Core\Modules;

/**
 * Resolve hosting / monorepo paths for the package manager.
 */
final class ModulePackagePaths
{
    public function __construct(
        private string $apiRoot,
        private ?string $webRoot = null,
    ) {
        $this->apiRoot = rtrim(str_replace('\\', '/', $apiRoot), '/');
        if ($webRoot === null) {
            $parent = dirname($this->apiRoot);
            $hosting = basename($this->apiRoot) === 'api'
                || is_file($parent . '/index.html')
                || is_file($parent . '/spa.html')
                || is_file($parent . '/index.php');
            $this->webRoot = $hosting ? rtrim(str_replace('\\', '/', $parent), '/') : $this->apiRoot;
        } else {
            $this->webRoot = rtrim(str_replace('\\', '/', $webRoot), '/');
        }
    }

    public static function fromApp(array $app): self
    {
        $paths = is_array($app['paths'] ?? null) ? $app['paths'] : [];
        $configuredApi = $paths['api_root'] ?? null;
        $configuredWeb = $paths['web_root'] ?? null;
        if (is_string($configuredApi) && trim($configuredApi) !== '') {
            $web = is_string($configuredWeb) && trim($configuredWeb) !== '' ? $configuredWeb : null;
            return new self($configuredApi, $web);
        }

        $api = realpath(dirname(__DIR__, 3));
        $apiRoot = $api !== false ? $api : dirname(__DIR__, 3);
        return new self($apiRoot);
    }

    public function apiRoot(): string
    {
        return $this->apiRoot;
    }

    public function webRoot(): string
    {
        return $this->webRoot;
    }

    public function modulesRoot(): string
    {
        return $this->apiRoot . '/modules';
    }

    public function moduleRoot(string $slug): string
    {
        $this->assertSlug($slug);
        return $this->modulesRoot() . '/' . $slug;
    }

    public function publicModulesRoot(): string
    {
        return $this->webRoot . '/modules';
    }

    public function publicModuleRoot(string $slug): string
    {
        $this->assertSlug($slug);
        return $this->publicModulesRoot() . '/' . $slug;
    }

    public function storageRoot(): string
    {
        return $this->apiRoot . '/storage/modules';
    }

    public function moduleStorage(string $slug): string
    {
        $this->assertSlug($slug);
        return $this->storageRoot() . '/' . $slug;
    }

    public function installerRoot(): string
    {
        return $this->apiRoot . '/storage/module-installer';
    }

    public function stagingRoot(): string
    {
        return $this->installerRoot() . '/staging';
    }

    public function backupsRoot(): string
    {
        return $this->installerRoot() . '/backups';
    }

    public function uploadsRoot(): string
    {
        return $this->installerRoot() . '/uploads';
    }

    public function safeModeFile(): string
    {
        return $this->apiRoot . '/storage/module-safe-mode.json';
    }

    public function assertSlug(string $slug): void
    {
        if (!preg_match('/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/', $slug)) {
            throw new \InvalidArgumentException('Invalid module slug');
        }
    }

    /** Ensure $path is inside $root (realpath). */
    public function assertContained(string $root, string $path): string
    {
        $rootReal = realpath($root);
        if ($rootReal === false) {
            throw new \RuntimeException('Root does not exist: ' . $root);
        }
        $pathReal = realpath($path);
        if ($pathReal === false) {
            // For not-yet-existing paths, normalize parent
            $parent = realpath(dirname($path));
            if ($parent === false || !str_starts_with($parent, $rootReal)) {
                throw new \RuntimeException('Path escapes module root');
            }
            return $path;
        }
        $rootN = str_replace('\\', '/', $rootReal);
        $pathN = str_replace('\\', '/', $pathReal);
        if ($pathN !== $rootN && !str_starts_with($pathN, $rootN . '/')) {
            throw new \RuntimeException('Path escapes allowed root');
        }
        return $pathReal;
    }
}
