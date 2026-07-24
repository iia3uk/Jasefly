<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use Throwable;
use ZipArchive;

/**
 * In-panel CMS updater (WordPress-style): upload a hosting update ZIP,
 * unpack, overwrite code (never local config / uploads), run migrations.
 *
 * Expects packages from `scripts/build-hosting.js --mode=update`
 * (flat public_html: index.html, assets/, api/, migrate.php, …).
 */
final class SiteUpdater
{
    public const MAX_ZIP_BYTES = 120 * 1024 * 1024;
    public const MAX_FILES = 15000;
    public const MAX_UNCOMPRESSED_BYTES = 450 * 1024 * 1024;

    private string $apiRoot;
    private string $webRoot;
    private string $workDir;
    private bool $hostingLayout;

    /** @var list<string> Relative to package / web root (forward slashes). */
    private const PROTECTED_PREFIXES = [
        'api/storage/uploads',
        'api/storage/thumbnails',
        'api/storage/backups',
        'api/storage/logs',
        'api/storage/updates',
        'api/storage/sqlite',
        'api/storage/.installed',
        'api/config/config.local.php',
        'api/config/.env',
        // Monorepo / api-only package paths:
        'storage/uploads',
        'storage/thumbnails',
        'storage/backups',
        'storage/logs',
        'storage/updates',
        'storage/sqlite',
        'storage/.installed',
        'config/config.local.php',
        'config/.env',
    ];

    public function __construct(
        private array $app,
        private ?Database $db = null,
    ) {
        $resolved = realpath(dirname(__DIR__, 2));
        $this->apiRoot = $resolved !== false ? $resolved : dirname(__DIR__, 2);
        $parent = dirname($this->apiRoot);
        $this->hostingLayout = basename($this->apiRoot) === 'api'
            || is_file($parent . DIRECTORY_SEPARATOR . 'index.html')
            || is_file($parent . DIRECTORY_SEPARATOR . 'spa.html')
            || is_file($parent . DIRECTORY_SEPARATOR . 'index.php');
        $this->webRoot = $this->hostingLayout ? $parent : $this->apiRoot;

        $storage = (string) ($this->app['storage'] ?? ($this->apiRoot . '/storage'));
        $this->workDir = rtrim($storage, '/\\') . '/updates';
    }

    /** @return array<string, mixed> */
    public function status(): array
    {
        $last = $this->readLastResult();
        $uploadMax = self::parseIniBytes((string) ini_get('upload_max_filesize'));
        $postMax = self::parseIniBytes((string) ini_get('post_max_size'));
        $effective = min(self::MAX_ZIP_BYTES, $uploadMax > 0 ? $uploadMax : self::MAX_ZIP_BYTES, $postMax > 0 ? $postMax : self::MAX_ZIP_BYTES);

        return [
            'version' => (string) ($this->app['version'] ?? '1.0.0'),
            'zip_available' => class_exists(ZipArchive::class),
            'hosting_layout' => $this->hostingLayout,
            'web_root' => $this->webRoot,
            'api_root' => $this->apiRoot,
            'max_zip_mb' => (int) floor($effective / 1048576),
            'php_upload_max' => (string) ini_get('upload_max_filesize'),
            'php_post_max' => (string) ini_get('post_max_size'),
            'last' => $last,
        ];
    }

    /**
     * @param array{name?:string,type?:string,tmp_name?:string,error?:int,size?:int} $file
     * @return array<string, mixed>
     */
    public function applyUpload(array $file): array
    {
        @set_time_limit(300);
        @ini_set('max_execution_time', '300');
        ignore_user_abort(true);

        if (!class_exists(ZipArchive::class)) {
            throw new \RuntimeException('PHP-расширение ZipArchive недоступно на хостинге. Включите zip в php.ini.');
        }

        $err = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($err !== UPLOAD_ERR_OK) {
            throw new \RuntimeException($this->uploadErrorMessage($err));
        }

        $tmp = (string) ($file['tmp_name'] ?? '');
        $size = (int) ($file['size'] ?? 0);
        $name = (string) ($file['name'] ?? 'update.zip');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new \RuntimeException('Файл обновления не получен.');
        }
        if ($size <= 0 || $size > self::MAX_ZIP_BYTES) {
            throw new \RuntimeException('ZIP слишком большой (лимит ' . (int) (self::MAX_ZIP_BYTES / 1048576) . ' МБ) или пустой.');
        }
        if (!preg_match('/\.zip$/i', $name)) {
            throw new \RuntimeException('Нужен файл .zip (пакет update с локальной сборки).');
        }

        if (!is_dir($this->workDir) && !@mkdir($this->workDir, 0775, true)) {
            throw new \RuntimeException('Не удалось создать каталог storage/updates.');
        }
        $ht = $this->workDir . '/.htaccess';
        if (!is_file($ht)) {
            @file_put_contents($ht, "Require all denied\nOptions -Indexes\n");
        }

        $token = bin2hex(random_bytes(8));
        $zipPath = $this->workDir . '/incoming-' . $token . '.zip';
        $extractDir = $this->workDir . '/extract-' . $token;

        if (!@move_uploaded_file($tmp, $zipPath)) {
            throw new \RuntimeException('Не удалось сохранить ZIP во временную папку.');
        }

        $copied = 0;
        $skipped = [];
        $warnings = [];
        $packageRoot = '';

        try {
            $this->extractZip($zipPath, $extractDir);
            $packageRoot = $this->detectPackageRoot($extractDir);
            $this->assertValidPackage($packageRoot);

            $files = $this->listFiles($packageRoot);
            if (count($files) > self::MAX_FILES) {
                throw new \RuntimeException('В архиве слишком много файлов.');
            }

            foreach ($files as $rel) {
                $src = $packageRoot . '/' . $rel;
                if (!is_file($src)) {
                    continue;
                }
                if ($this->isProtected($rel)) {
                    $skipped[] = $rel;
                    continue;
                }
                $dest = $this->mapDestination($rel);
                if ($dest === null) {
                    $warnings[] = "Пропущен (некуда положить): {$rel}";
                    continue;
                }
                $destDir = dirname($dest);
                if (!is_dir($destDir) && !@mkdir($destDir, 0775, true)) {
                    throw new \RuntimeException("Не удалось создать каталог: {$destDir}");
                }
                if (!@copy($src, $dest)) {
                    throw new \RuntimeException("Не удалось записать файл: {$rel}");
                }
                $copied++;
            }

            // Drop legacy Vite shell so nginx cannot serve empty #root instead of index.php
            if ($this->hostingLayout && is_file($this->webRoot . '/spa.html')) {
                $legacy = $this->webRoot . '/index.html';
                if (is_file($legacy)) {
                    @unlink($legacy);
                }
            }

            $migrations = $this->runMigrations();

            $result = [
                'ok' => true,
                'files_copied' => $copied,
                'files_skipped_protected' => count($skipped),
                'skipped_sample' => array_slice($skipped, 0, 20),
                'warnings' => array_slice($warnings, 0, 30),
                'migrations' => $migrations,
                'package' => $name,
                'hosting_layout' => $this->hostingLayout,
                'at' => gmdate('c'),
                'message' => 'Обновление установлено. Обновите админку (Ctrl+F5).',
            ];
            $this->writeLastResult($result);
            return $result;
        } catch (Throwable $e) {
            $fail = [
                'ok' => false,
                'error' => $e->getMessage(),
                'files_copied' => $copied,
                'at' => gmdate('c'),
            ];
            $this->writeLastResult($fail);
            throw $e;
        } finally {
            $this->rmTree($extractDir);
            @unlink($zipPath);
        }
    }

    private function extractZip(string $zipPath, string $dest): void
    {
        if (is_dir($dest)) {
            $this->rmTree($dest);
        }
        if (!@mkdir($dest, 0775, true)) {
            throw new \RuntimeException('Не удалось создать папку распаковки.');
        }

        $zip = new ZipArchive();
        $open = $zip->open($zipPath);
        if ($open !== true) {
            throw new \RuntimeException('Не удалось открыть ZIP (код ' . (string) $open . ').');
        }

        $uncompressed = 0;
        $count = $zip->numFiles;
        if ($count > self::MAX_FILES) {
            $zip->close();
            throw new \RuntimeException('В архиве слишком много файлов.');
        }

        for ($i = 0; $i < $count; $i++) {
            $stat = $zip->statIndex($i);
            if ($stat === false) {
                continue;
            }
            $entry = str_replace('\\', '/', (string) ($stat['name'] ?? ''));
            if ($entry === '' || str_ends_with($entry, '/')) {
                continue;
            }
            if (str_contains($entry, '..') || str_starts_with($entry, '/') || preg_match('#^[A-Za-z]:#', $entry)) {
                $zip->close();
                throw new \RuntimeException('Подозрительный путь в ZIP (path traversal): ' . $entry);
            }
            $uncompressed += (int) ($stat['size'] ?? 0);
            if ($uncompressed > self::MAX_UNCOMPRESSED_BYTES) {
                $zip->close();
                throw new \RuntimeException('Распакованный размер архива слишком большой (zip bomb?).');
            }
        }

        if (!$zip->extractTo($dest)) {
            $zip->close();
            throw new \RuntimeException('Ошибка распаковки ZIP.');
        }
        $zip->close();
    }

    private function detectPackageRoot(string $extractDir): string
    {
        $extractDir = rtrim(str_replace('\\', '/', $extractDir), '/');
        $markers = [
            'api/public/index.php',
            'api/src/Bootstrap.php',
            'public/index.php',
            'src/Bootstrap.php',
        ];

        foreach ($markers as $m) {
            if (is_file($extractDir . '/' . $m)) {
                return $extractDir;
            }
        }

        // Nested public_html/ or single top-level folder
        $entries = @scandir($extractDir) ?: [];
        $dirs = [];
        foreach ($entries as $e) {
            if ($e === '.' || $e === '..') {
                continue;
            }
            $full = $extractDir . '/' . $e;
            if (is_dir($full)) {
                $dirs[] = $full;
            }
        }

        foreach ([$extractDir . '/public_html', ...$dirs] as $candidate) {
            if (!is_dir($candidate)) {
                continue;
            }
            foreach ($markers as $m) {
                if (is_file($candidate . '/' . $m)) {
                    return $candidate;
                }
            }
        }

        throw new \RuntimeException(
            'В ZIP не найден пакет Jasefly CMS (ожидаются api/public/index.php или api/src/Bootstrap.php). '
            . 'Соберите архив: node scripts/build-hosting.js --mode=update'
        );
    }

    private function assertValidPackage(string $root): void
    {
        $hasApi = is_file($root . '/api/src/Bootstrap.php') || is_file($root . '/src/Bootstrap.php');
        if (!$hasApi) {
            throw new \RuntimeException('Пакет повреждён: нет Bootstrap.php.');
        }
        // Frontend optional for api-only patches, but update packages normally include it
        $hasFront = is_file($root . '/index.html')
            || is_file($root . '/spa.html')
            || is_file($root . '/index.php')
            || is_dir($root . '/assets');
        if (!$hasFront && $this->hostingLayout) {
            // Allow api-only updates on hosting
            return;
        }
    }

    /** @return list<string> relative paths with / */
    private function listFiles(string $root): array
    {
        $root = rtrim(str_replace('\\', '/', $root), '/');
        $out = [];
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            /** @var \SplFileInfo $file */
            if (!$file->isFile()) {
                continue;
            }
            $full = str_replace('\\', '/', $file->getPathname());
            $rel = ltrim(substr($full, strlen($root)), '/');
            if ($rel !== '') {
                $out[] = $rel;
            }
        }
        return $out;
    }

    private function isProtected(string $rel): bool
    {
        $rel = ltrim(str_replace('\\', '/', $rel), '/');
        foreach (self::PROTECTED_PREFIXES as $prefix) {
            if ($rel === $prefix || str_starts_with($rel, $prefix . '/')) {
                return true;
            }
        }
        if (preg_match('#(^|/)config\.local\.php$#', $rel)) {
            return true;
        }
        if (preg_match('#(^|/)\.env$#', $rel)) {
            return true;
        }
        if (preg_match('#\.local\.php$#', $rel)) {
            return true;
        }
        // Never replace the live update work dir contents via package
        if (str_contains($rel, '/storage/updates/') || str_starts_with($rel, 'storage/updates/')) {
            return true;
        }
        return false;
    }

    /** Absolute destination path, or null to skip. */
    private function mapDestination(string $rel): ?string
    {
        $rel = ltrim(str_replace('\\', '/', $rel), '/');

        if ($this->hostingLayout) {
            return $this->webRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        }

        // Local monorepo: api/* → backend/*, SPA → frontend/dist if present
        if (str_starts_with($rel, 'api/')) {
            $inner = substr($rel, 4);
            return $this->apiRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $inner);
        }

        // Bare API package (no api/ prefix)
        if (str_starts_with($rel, 'src/') || str_starts_with($rel, 'config/') || str_starts_with($rel, 'migrations/')
            || str_starts_with($rel, 'public/') || str_starts_with($rel, 'routes/') || $rel === 'migrate.php'
            || $rel === 'composer.json' || str_starts_with($rel, 'vendor/')) {
            return $this->apiRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        }

        $repoRoot = dirname($this->apiRoot);
        $dist = $repoRoot . DIRECTORY_SEPARATOR . 'frontend' . DIRECTORY_SEPARATOR . 'dist';
        if (is_dir($dist) && (
            $rel === 'index.html'
            || $rel === 'spa.html'
            || $rel === 'index.php'
            || $rel === '.htaccess'
            || str_starts_with($rel, 'assets/')
            || preg_match('/\.(js|css|map|svg|png|jpg|webp|ico|woff2?)$/i', $rel)
        )) {
            return $dist . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function runMigrations(): array
    {
        if ($this->db === null) {
            return ['ok' => true, 'skipped' => true, 'message' => 'DB not available'];
        }
        $migrationsDir = $this->apiRoot . '/migrations';
        $storage = (string) ($this->app['storage'] ?? ($this->apiRoot . '/storage'));
        $modulesDir = $this->apiRoot . '/src/Modules';
        $svc = new MigrationService($this->db, $migrationsDir, $storage, $modulesDir);
        return $svc->status(true);
    }

    /** @return array<string, mixed>|null */
    private function readLastResult(): ?array
    {
        $path = $this->workDir . '/last-result.json';
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    /** @param array<string, mixed> $data */
    private function writeLastResult(array $data): void
    {
        if (!is_dir($this->workDir)) {
            @mkdir($this->workDir, 0775, true);
        }
        @file_put_contents(
            $this->workDir . '/last-result.json',
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }

    private function rmTree(string $dir): void
    {
        if ($dir === '' || !is_dir($dir)) {
            return;
        }
        $real = realpath($dir);
        $workReal = realpath($this->workDir);
        if ($real === false || $workReal === false || !str_starts_with($real, $workReal)) {
            return; // safety: only delete under storage/updates
        }
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($real, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $item) {
            /** @var \SplFileInfo $item */
            $path = $item->getPathname();
            if ($item->isDir()) {
                @rmdir($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($real);
    }

    private function uploadErrorMessage(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'ZIP больше лимита PHP (upload_max_filesize / post_max_size). Увеличьте в php.ini или панели хостинга.',
            UPLOAD_ERR_PARTIAL => 'Файл загружен частично — попробуйте ещё раз.',
            UPLOAD_ERR_NO_FILE => 'Файл не выбран.',
            UPLOAD_ERR_NO_TMP_DIR => 'На сервере нет временной папки для загрузок.',
            UPLOAD_ERR_CANT_WRITE => 'Сервер не смог записать временный файл.',
            UPLOAD_ERR_EXTENSION => 'Загрузка заблокирована расширением PHP.',
            default => "Ошибка загрузки (код {$code}).",
        };
    }

    private static function parseIniBytes(string $val): int
    {
        $val = trim($val);
        if ($val === '') {
            return 0;
        }
        $unit = strtolower(substr($val, -1));
        $num = (float) $val;
        return (int) match ($unit) {
            'g' => $num * 1024 * 1024 * 1024,
            'm' => $num * 1024 * 1024,
            'k' => $num * 1024,
            default => (float) $val,
        };
    }
}
