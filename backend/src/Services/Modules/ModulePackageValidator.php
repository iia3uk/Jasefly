<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Modules\ModuleDependencyResolver;
use App\Core\Modules\ModuleManifest;
use ZipArchive;

/**
 * Strict validation of *.jasefly-module.zip / .zip packages before install.
 */
final class ModulePackageValidator
{
    public const MAX_ZIP_BYTES = 40 * 1024 * 1024;
    public const MAX_FILES = 5000;
    public const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
    public const MAX_RATIO = 100.0;

    public function __construct(
        private ModuleDependencyResolver $deps = new ModuleDependencyResolver(),
        private ModuleSignatureService $signatures = new ModuleSignatureService(),
    ) {}

    /**
     * Validate ZIP path without extracting (structure + slip + bomb).
     *
     * @return array{ok:bool, errors:list<string>, warnings:list<string>, entries:list<string>}
     */
    public function validateZipFile(string $zipPath): array
    {
        $errors = [];
        $warnings = [];
        $entries = [];

        if (!class_exists(ZipArchive::class)) {
            return ['ok' => false, 'errors' => ['ZipArchive extension required'], 'warnings' => [], 'entries' => []];
        }
        if (!is_file($zipPath)) {
            return ['ok' => false, 'errors' => ['ZIP not found'], 'warnings' => [], 'entries' => []];
        }
        $size = filesize($zipPath);
        if ($size === false || $size <= 0 || $size > self::MAX_ZIP_BYTES) {
            $errors[] = 'ZIP empty or exceeds size limit (' . (int) (self::MAX_ZIP_BYTES / 1048576) . ' MB)';
        }

        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            return ['ok' => false, 'errors' => ['Cannot open ZIP'], 'warnings' => [], 'entries' => []];
        }

        $uncompressed = 0;
        $fileCount = 0;
        $hasManifest = false;
        $hasChecksums = false;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if ($stat === false) {
                $errors[] = 'Unreadable ZIP entry';
                continue;
            }
            $name = str_replace('\\', '/', (string) ($stat['name'] ?? ''));
            $entries[] = $name;
            if ($name === '' || str_contains($name, "\0")) {
                $errors[] = 'Illegal entry name (null byte or empty)';
                continue;
            }
            if ($this->isDangerousPath($name)) {
                $errors[] = 'Path traversal or absolute path: ' . $name;
                continue;
            }
            // Symlink / special: ZipArchive external attributes (Unix)
            $opsys = $zip->getExternalAttributesIndex($i, $opsysOut, $attr);
            if ($opsys && $opsysOut === ZipArchive::OPSYS_UNIX) {
                $type = ($attr >> 16) & 0170000;
                if ($type === 0120000 || $type === 0100000 && (($attr >> 16) & 0xA000) === 0xA000) {
                    // S_IFLNK = 0120000
                }
                if ((($attr >> 16) & 0170000) === 0120000) {
                    $errors[] = 'Symlinks are not allowed: ' . $name;
                }
            }

            $isDir = str_ends_with($name, '/');
            if (!$isDir) {
                $fileCount++;
                $uncompressed += (int) ($stat['size'] ?? 0);
            }
            $base = $this->stripSingleRoot($name);
            if ($base === 'module.json') {
                $hasManifest = true;
            }
            if ($base === 'checksums.json') {
                $hasChecksums = true;
            }
        }

        if ($fileCount > self::MAX_FILES) {
            $errors[] = 'Too many files in ZIP';
        }
        if ($uncompressed > self::MAX_UNCOMPRESSED_BYTES) {
            $errors[] = 'Uncompressed size exceeds limit';
        }
        if ($size > 0 && $uncompressed / max(1, $size) > self::MAX_RATIO) {
            $errors[] = 'Suspicious compression ratio (possible ZIP bomb)';
        }
        if (!$hasManifest) {
            $errors[] = 'module.json missing';
        }
        if (!$hasChecksums) {
            $errors[] = 'checksums.json missing';
        }

        $zip->close();
        return ['ok' => $errors === [], 'errors' => $errors, 'warnings' => $warnings, 'entries' => $entries];
    }

    /**
     * Validate extracted package directory.
     *
     * @param array<string, string> $installedMap
     * @return array{ok:bool, errors:list<string>, warnings:list<string>, manifest:?ModuleManifest, signature:array<string,mixed>, checksum_ok:bool}
     */
    public function validateExtracted(string $root, string $cmsVersion, array $installedMap = []): array
    {
        $errors = [];
        $warnings = [];
        $root = rtrim(str_replace('\\', '/', $root), '/');

        $manifestPath = $root . '/module.json';
        $checksumsPath = $root . '/checksums.json';
        if (!is_file($manifestPath)) {
            $errors[] = 'module.json missing after extract';
        }
        if (!is_file($checksumsPath)) {
            $errors[] = 'checksums.json missing after extract';
        }

        $manifest = null;
        if (is_file($manifestPath)) {
            $raw = file_get_contents($manifestPath);
            $data = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($data)) {
                $errors[] = 'module.json is not valid JSON';
            } else {
                $schemaErrors = $this->validateManifestShape($data);
                $errors = array_merge($errors, $schemaErrors);
                if ($schemaErrors === []) {
                    $manifest = ModuleManifest::fromArray($data);
                }
            }
        }

        $checksumOk = false;
        if (is_file($checksumsPath) && $manifest !== null) {
            $ck = $this->verifyChecksums($root, $checksumsPath);
            $checksumOk = $ck['ok'];
            $errors = array_merge($errors, $ck['errors']);
        }

        $signature = $this->signatures->verifyPackageRoot($root);

        if ($manifest !== null) {
            if ($manifest->apiVersion() !== ModuleManifest::API_VERSION) {
                $errors[] = 'Incompatible module api_version';
            }
            if (!$this->deps->satisfies($cmsVersion, '>=' . $manifest->minJaseflyVersion())) {
                $errors[] = 'CMS version ' . $cmsVersion . ' < required ' . $manifest->minJaseflyVersion();
            }
            $max = $manifest->maxJaseflyVersion();
            if ($max !== null && !$this->deps->satisfies($cmsVersion, '<=' . $max)) {
                $errors[] = 'CMS version ' . $cmsVersion . ' > max ' . $max;
            }
            if (version_compare(PHP_VERSION, $manifest->minPhpVersion(), '<')) {
                $errors[] = 'PHP ' . PHP_VERSION . ' < required ' . $manifest->minPhpVersion();
            }
            foreach ($manifest->phpExtensions() as $ext) {
                if ($ext !== '' && !extension_loaded($ext)) {
                    $errors[] = 'Missing PHP extension: ' . $ext;
                }
            }
            $backend = $root . '/' . $manifest->backendEntrypoint();
            if (!is_file($backend)) {
                $errors[] = 'Backend entrypoint missing: ' . $manifest->backendEntrypoint();
            } elseif (!$this->pathInside($root, $backend)) {
                $errors[] = 'Backend entrypoint escapes package root';
            }

            $depPlan = $this->deps->plan($manifest, $installedMap);
            if (!$depPlan['ok']) {
                foreach ($depPlan['missing'] as $m) {
                    $errors[] = 'Missing dependency: ' . $m['slug'] . ' ' . $m['constraint'];
                }
                foreach ($depPlan['conflicts'] as $c) {
                    $errors[] = 'Conflicts with installed: ' . $c['slug'] . ' ' . $c['installed'];
                }
            }
            foreach ($depPlan['optional'] as $o) {
                if ($o['installed'] === null) {
                    $warnings[] = 'Optional dependency not installed: ' . $o['slug'];
                }
            }

            // Forbidden path segments in tree
            $forbidden = $this->scanForbiddenFiles($root);
            $errors = array_merge($errors, $forbidden);
        }

        return [
            'ok' => $errors === [],
            'errors' => $errors,
            'warnings' => $warnings,
            'manifest' => $manifest,
            'signature' => $signature,
            'checksum_ok' => $checksumOk,
            'dependency_plan' => $manifest ? $this->deps->plan($manifest, $installedMap) : null,
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return list<string>
     */
    public function validateManifestShape(array $data): array
    {
        $errors = [];
        if (($data['schema_version'] ?? null) !== 1) {
            $errors[] = 'schema_version must be 1';
        }
        if (($data['type'] ?? null) !== 'jasefly-module') {
            $errors[] = 'type must be jasefly-module';
        }
        $slug = (string) ($data['slug'] ?? '');
        if (!preg_match('/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/', $slug)) {
            $errors[] = 'Invalid slug';
        }
        $version = (string) ($data['version'] ?? '');
        if (!preg_match('/^\d+\.\d+\.\d+([-+][A-Za-z0-9.-]+)?$/', $version)) {
            $errors[] = 'Invalid semver version';
        }
        if (!is_string($data['name'] ?? null) || trim((string) $data['name']) === '') {
            $errors[] = 'name required';
        }
        $j = $data['jasefly'] ?? null;
        if (!is_array($j) || !isset($j['min_version'], $j['api_version'])) {
            $errors[] = 'jasefly.min_version and api_version required';
        } elseif ((int) $j['api_version'] !== 1) {
            $errors[] = 'jasefly.api_version must be 1';
        }
        $ep = $data['entrypoints'] ?? null;
        if (!is_array($ep) || !is_string($ep['backend'] ?? null)) {
            $errors[] = 'entrypoints.backend required';
        } elseif (!preg_match('#^backend/[A-Za-z0-9_./-]+\.php$#', (string) $ep['backend'])) {
            $errors[] = 'entrypoints.backend must be under backend/*.php';
        }
        if (isset($ep['frontend_manifest']) && $ep['frontend_manifest'] !== 'frontend-dist/manifest.json') {
            $errors[] = 'entrypoints.frontend_manifest must be frontend-dist/manifest.json';
        }
        return $errors;
    }

    /**
     * @return array{ok:bool, errors:list<string>}
     */
    public function verifyChecksums(string $root, string $checksumsPath): array
    {
        $errors = [];
        $raw = file_get_contents($checksumsPath);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data) || !isset($data['files']) || !is_array($data['files'])) {
            return ['ok' => false, 'errors' => ['checksums.json must contain files map']];
        }

        $files = $data['files'];
        foreach ($files as $rel => $hash) {
            if (!is_string($rel) || !is_string($hash)) {
                $errors[] = 'Invalid checksums entry';
                continue;
            }
            $relN = str_replace('\\', '/', $rel);
            if ($this->isDangerousPath($relN) || str_starts_with($relN, '/')) {
                $errors[] = 'Illegal path in checksums: ' . $relN;
                continue;
            }
            $abs = $root . '/' . $relN;
            if (!is_file($abs)) {
                $errors[] = 'Missing file from checksums: ' . $relN;
                continue;
            }
            $actual = 'sha256:' . hash_file('sha256', $abs);
            $expected = str_starts_with($hash, 'sha256:') ? $hash : 'sha256:' . $hash;
            if (!hash_equals($expected, $actual)) {
                $errors[] = 'Checksum mismatch: ' . $relN;
            }
        }

        // Ensure every non-meta file is listed (except signature.json)
        $listed = array_map(static fn($k) => str_replace('\\', '/', (string) $k), array_keys($files));
        $listedSet = array_fill_keys($listed, true);
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $fileInfo) {
            /** @var \SplFileInfo $fileInfo */
            if (!$fileInfo->isFile()) {
                continue;
            }
            $full = str_replace('\\', '/', $fileInfo->getPathname());
            $rel = ltrim(substr($full, strlen($root)), '/');
            if (in_array($rel, ['checksums.json', 'signature.json'], true)) {
                continue;
            }
            if (!isset($listedSet[$rel])) {
                $errors[] = 'File not listed in checksums.json: ' . $rel;
            }
        }

        return ['ok' => $errors === [], 'errors' => $errors];
    }

    public function isDangerousPath(string $name): bool
    {
        $n = str_replace('\\', '/', $name);
        if ($n === '' || str_contains($n, "\0")) {
            return true;
        }
        if (str_starts_with($n, '/') || preg_match('#^[A-Za-z]:/#', $n)) {
            return true;
        }
        foreach (explode('/', $n) as $part) {
            if ($part === '..') {
                return true;
            }
        }
        return false;
    }

    /** @return list<string> */
    private function scanForbiddenFiles(string $root): array
    {
        $errors = [];
        $bannedNames = ['.env', 'config.local.php', 'id_rsa', 'id_ed25519'];
        $bannedDirs = ['node_modules', '.git', 'vendor'];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $fileInfo) {
            /** @var \SplFileInfo $fileInfo */
            $full = str_replace('\\', '/', $fileInfo->getPathname());
            $rel = ltrim(substr($full, strlen(str_replace('\\', '/', $root))), '/');
            foreach ($bannedDirs as $bd) {
                if ($rel === $bd || str_contains($rel, '/' . $bd . '/')) {
                    $errors[] = 'Forbidden path in package: ' . $rel;
                    break;
                }
            }
            $base = basename($rel);
            if (in_array($base, $bannedNames, true)) {
                $errors[] = 'Forbidden file in package: ' . $rel;
            }
        }
        return array_values(array_unique($errors));
    }

    private function stripSingleRoot(string $name): string
    {
        $n = str_replace('\\', '/', $name);
        // allow optional single top folder
        if (preg_match('#^[^/]+/(module\.json|checksums\.json)$#', $n, $m)) {
            return $m[1];
        }
        return ltrim($n, './');
    }

    private function pathInside(string $root, string $path): bool
    {
        $rootReal = realpath($root);
        $pathReal = realpath($path);
        if ($rootReal === false || $pathReal === false) {
            return false;
        }
        $rootN = str_replace('\\', '/', $rootReal);
        $pathN = str_replace('\\', '/', $pathReal);
        return $pathN === $rootN || str_starts_with($pathN, $rootN . '/');
    }
}
