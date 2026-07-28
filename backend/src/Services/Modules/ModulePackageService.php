<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\EventDispatcher;
use App\Core\Modules\ModuleDependencyResolver;
use App\Core\Modules\ModuleInstallContext;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\ModulePackagePaths;
use App\Database;

/**
 * Orchestrates upload, inspect, install, update, enable/disable, uninstall and rollback.
 */
final class ModulePackageService
{
    private const META_FILES = ['module.json', 'checksums.json', 'signature.json'];
    private const COPY_DIRS = ['migrations', 'hooks', 'content', 'translations', 'docs'];

    public function __construct(
        private Database $db,
        private array $app,
        private ModulePackagePaths $paths,
        private ModuleRegistryRepository $registry,
        private ModuleStagingService $staging,
        private ModuleSnapshotService $snapshots,
        private ModuleMigrationService $migrations,
        private ModuleHookRunner $hooks,
        private ModuleHealthService $health,
        private ?ModulePackageValidator $validator = null,
        private ModuleDependencyResolver $deps = new ModuleDependencyResolver(),
    ) {}

    private function validator(): ModulePackageValidator
    {
        return $this->validator ??= new ModulePackageValidator(db: $this->db);
    }

    /**
     * @param array<string, mixed> $file PHP upload array (tmp_name, name, size, error)
     * @return array{package_id:string, path:string, size:int, original_name:string}
     */
    public function upload(array $file): array
    {
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            throw new \RuntimeException('Upload failed (code ' . $error . ')');
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        $allowLocal = !empty($file['allow_local_path']);
        if ($tmp === '' || (!$allowLocal && !is_uploaded_file($tmp)) || ($allowLocal && !is_file($tmp))) {
            throw new \RuntimeException('Invalid upload temp file');
        }
        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0 || $size > ModulePackageValidator::MAX_ZIP_BYTES) {
            throw new \RuntimeException('Package exceeds size limit');
        }

        $uploads = $this->paths->uploadsRoot();
        if (!is_dir($uploads)) {
            @mkdir($uploads, 0775, true);
        }
        $this->staging->ensureDenyHtaccess($this->paths->installerRoot());
        $this->staging->ensureDenyHtaccess($uploads);

        $packageId = bin2hex(random_bytes(16));
        $dest = $uploads . '/' . $packageId . '.zip';
        $moved = $allowLocal ? @copy($tmp, $dest) : @move_uploaded_file($tmp, $dest);
        if (!$moved) {
            throw new \RuntimeException('Cannot store uploaded package');
        }

        $zipCheck = $this->validator()->validateZipFile($dest);
        if (!$zipCheck['ok']) {
            @unlink($dest);
            throw new \RuntimeException('Invalid package: ' . implode('; ', $zipCheck['errors']));
        }

        return [
            'package_id' => $packageId,
            'path' => $dest,
            'size' => $size,
            'original_name' => (string) ($file['name'] ?? $packageId . '.zip'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function inspect(string $packageIdOrPath, ?string $targetSlug = null): array
    {
        $zipPath = $this->resolvePackagePath($packageIdOrPath);
        $zipCheck = $this->validator()->validateZipFile($zipPath);
        if (!$zipCheck['ok']) {
            return [
                'ok' => false,
                'errors' => $zipCheck['errors'],
                'warnings' => $zipCheck['warnings'],
            ];
        }

        $opId = 0;
        $staging = $this->staging->extractZipToStaging($zipPath, $this->tempOperationId());
        $opId = (int) basename($staging['staging_dir']);
        try {
            $root = $staging['package_root'];
            $cmsVersion = (string) ($this->app['version'] ?? '1.0.0');
            $installedMap = $this->installedVersionMap();
            $validation = $this->validator()->validateExtracted($root, $cmsVersion, $installedMap);
            $manifest = $validation['manifest'];
            $slug = $manifest?->slug() ?? '';
            if ($targetSlug !== null && $slug !== '' && $targetSlug !== $slug) {
                $validation['errors'][] = 'Package slug mismatch';
                $validation['ok'] = false;
            }

            $existing = $slug !== '' ? $this->registry->getBySlug($slug) : null;
            $existingStatus = is_array($existing) ? (string) ($existing['status'] ?? '') : '';
            // Failed / wiped installs must reinstall, not "update" from an empty snapshot.
            $operation = ($existing === null || in_array($existingStatus, ['failed', 'uninstalled'], true))
                ? 'install'
                : 'update';
            $fromVersion = ($operation === 'update' && $existing !== null)
                ? (string) ($existing['installed_version'] ?? '0.0.0')
                : null;
            $toVersion = $manifest?->version();

            $planWarnings = $validation['warnings'];
            if ($operation === 'update' && $manifest !== null && $fromVersion !== null) {
                if (!$this->deps->isNewer($manifest->version(), $fromVersion)
                    && version_compare($manifest->version(), $fromVersion, '<')
                    && !$manifest->allowDowngrade()) {
                    $validation['errors'][] = 'Downgrade not allowed by manifest';
                    $validation['ok'] = false;
                } elseif (version_compare($manifest->version(), $fromVersion, '=')) {
                    $planWarnings[] = 'Same version already installed';
                }
            }

            return [
                'ok' => $validation['ok'],
                'errors' => $validation['errors'],
                'warnings' => array_merge($planWarnings, $zipCheck['warnings']),
                'manifest' => $manifest?->toArray(),
                'signature' => $validation['signature'],
                'checksum_ok' => $validation['checksum_ok'],
                'dependency_plan' => $validation['dependency_plan'],
                'operation' => $operation,
                'slug' => $slug,
                'from_version' => $fromVersion,
                'to_version' => $toVersion,
                'package_path' => $zipPath,
                'package_checksum' => 'sha256:' . hash_file('sha256', $zipPath),
            ];
        } finally {
            if ($opId > 0) {
                $this->staging->cleanupStaging($opId);
            }
        }
    }

    /**
     * @param array{content_mode?:string, preserve_existing_data?:bool, initiated_by?:?int} $opts
     * @return array<string, mixed>
     */
    public function install(string $packageId, array $opts = []): array
    {
        $zipPath = $this->resolvePackagePath($packageId);
        $inspect = $this->inspect($packageId);
        if (!$inspect['ok']) {
            throw new \RuntimeException('Package inspection failed: ' . implode('; ', $inspect['errors']));
        }
        if (($inspect['operation'] ?? '') !== 'install') {
            throw new \RuntimeException('Module already installed — use update()');
        }

        /** @var array<string, mixed> $manifestData */
        $manifestData = $inspect['manifest'];
        $manifest = ModuleManifest::fromArray($manifestData);
        $slug = $manifest->slug();

        $existing = $this->registry->getBySlug($slug);
        if ($existing !== null) {
            $st = (string) ($existing['status'] ?? '');
            $allowReplace = in_array($st, ['failed', 'uninstalled'], true)
                || ($opts['preserve_existing_data'] ?? false);
            if (!$allowReplace) {
                throw new \RuntimeException('Module slug already registered');
            }
        }

        return $this->runPipeline(
            $zipPath,
            $manifest,
            'install',
            null,
            $manifest->version(),
            (int) ($opts['initiated_by'] ?? 0) ?: null,
            (string) ($opts['content_mode'] ?? 'merge'),
            $existing,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function update(string $packageId, string $slug, ?int $initiatedBy = null): array
    {
        $zipPath = $this->resolvePackagePath($packageId);
        $inspect = $this->inspect($packageId, $slug);
        if (!$inspect['ok']) {
            throw new \RuntimeException('Package inspection failed: ' . implode('; ', $inspect['errors']));
        }
        if (($inspect['slug'] ?? '') !== $slug) {
            throw new \RuntimeException('Package slug mismatch');
        }

        $existing = $this->registry->getBySlug($slug);
        if ($existing === null) {
            throw new \RuntimeException('Module not installed');
        }

        /** @var array<string, mixed> $manifestData */
        $manifestData = $inspect['manifest'];
        $manifest = ModuleManifest::fromArray($manifestData);
        $fromVersion = (string) ($existing['installed_version'] ?? '0.0.0');

        if (version_compare($manifest->version(), $fromVersion, '<') && !$manifest->allowDowngrade()) {
            throw new \RuntimeException('Downgrade blocked — manifest.allow_downgrade is false');
        }

        return $this->runPipeline(
            $zipPath,
            $manifest,
            'update',
            $fromVersion,
            $manifest->version(),
            $initiatedBy,
            'merge',
            $existing,
        );
    }

    /** @return array<string, mixed> */
    public function enable(string $slug, ?int $initiatedBy = null): array
    {
        $row = $this->requireInstalled($slug);
        if (($row['status'] ?? '') === 'enabled') {
            // Idempotent: skip lifecycle hooks, but always repair plugins mirror (B).
            $this->syncPluginState($slug, true);
            return ['ok' => true, 'slug' => $slug, 'status' => 'enabled'];
        }

        $opId = $this->registry->startOperation($slug, 'enable', (string) $row['installed_version'], null, $initiatedBy);
        try {
            $manifest = $this->rowManifest($row);
            $this->runLifecycleHook('before_enable', $manifest, $slug, 'enable', $opId);
            $this->registry->setStatus($slug, 'enabled', null, 'unknown');
            $this->syncPluginState($slug, true);
            (new ModuleSafeMode($this->paths))->clear($slug);
            $this->runLifecycleHook('after_enable', $manifest, $slug, 'enable', $opId);
            $health = $this->health->check($slug);
            $this->registry->finishOperation($opId, 'success');
            return ['ok' => true, 'slug' => $slug, 'status' => 'enabled', 'health' => $health];
        } catch (\Throwable $e) {
            $this->registry->finishOperation($opId, 'failed', $e->getMessage());
            $this->registry->setStatus($slug, 'failed', $e->getMessage(), 'failed');
            $this->syncPluginState($slug, false);
            throw $e;
        }
    }

    /** @return array<string, mixed> */
    public function disable(string $slug, ?int $initiatedBy = null): array
    {
        $row = $this->requireInstalled($slug);
        if (($row['status'] ?? '') === 'disabled') {
            // Idempotent: skip lifecycle hooks, but always repair plugins mirror (B).
            $this->syncPluginState($slug, false);
            return ['ok' => true, 'slug' => $slug, 'status' => 'disabled'];
        }
        $opId = $this->registry->startOperation($slug, 'disable', (string) $row['installed_version'], null, $initiatedBy);
        try {
            $manifest = $this->rowManifest($row);
            $this->runLifecycleHook('before_disable', $manifest, $slug, 'disable', $opId);
            $this->registry->setStatus($slug, 'disabled', null, (string) ($row['health_status'] ?? 'unknown'));
            $this->syncPluginState($slug, false);
            try {
                (new \App\Platform\Capabilities\CapabilityRegistry($this->db))->revokeModule($slug);
            } catch (\Throwable) {
            }
            $this->runLifecycleHook('after_disable', $manifest, $slug, 'disable', $opId);
            $this->registry->finishOperation($opId, 'success');
            return ['ok' => true, 'slug' => $slug, 'status' => 'disabled'];
        } catch (\Throwable $e) {
            $this->registry->finishOperation($opId, 'failed', $e->getMessage());
            $this->registry->setStatus($slug, 'failed', $e->getMessage(), 'failed');
            $this->syncPluginState($slug, false);
            throw $e;
        }
    }

    /** @return array<string, mixed> */
    public function uninstall(string $slug, bool $keepData = true, ?int $initiatedBy = null): array
    {
        $row = $this->requireInstalled($slug);
        $manifest = $this->rowManifest($row);
        $fromVersion = (string) ($row['installed_version'] ?? '0.0.0');
        $opId = $this->registry->startOperation($slug, 'uninstall', $fromVersion, null, $initiatedBy);
        $backupPath = null;

        try {
            $backupPath = $this->snapshots->createSnapshot($slug);
            $this->registry->appendOperationLog($opId, 'Snapshot: ' . $backupPath);

            $this->runLifecycleHook('before_uninstall', $manifest, $slug, 'uninstall', $opId);

            if (!$keepData) {
                $moduleRoot = $this->paths->moduleRoot($slug);
                $uninstallDir = $moduleRoot . '/' . trim($manifest->uninstallMigrationsPath(), '/');
                $result = $this->migrations->applyUninstall($slug, $uninstallDir);
                if ($result['error'] !== null) {
                    throw new \RuntimeException('Uninstall migrations failed: ' . ($result['error']['message'] ?? ''));
                }
            }

            if ($keepData) {
                $storage = $this->paths->moduleStorage($slug);
                if (!is_dir($storage)) {
                    @mkdir($storage, 0775, true);
                }
                @file_put_contents(
                    $storage . '/preserved.json',
                    json_encode([
                        'slug' => $slug,
                        'version' => $fromVersion,
                        'kept_at' => gmdate('c'),
                        'manifest' => $manifest->toArray(),
                    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
                );
            } else {
                $storage = $this->paths->moduleStorage($slug);
                if (is_dir($storage)) {
                    $this->removeTree($storage);
                }
            }

            $this->removeInstalledFiles($slug);
            $this->registry->deleteModule($slug);
            $this->syncPluginState($slug, false);
            (new ModuleSafeMode($this->paths))->clear($slug);

            $this->registry->finishOperation($opId, 'success', null, $backupPath, true, !$keepData);
            return ['ok' => true, 'slug' => $slug, 'keep_data' => $keepData, 'backup_path' => $backupPath];
        } catch (\Throwable $e) {
            if ($backupPath !== null && is_file($backupPath)) {
                try {
                    $this->snapshots->restoreSnapshot($backupPath, $slug);
                } catch (\Throwable) {
                }
            }
            $this->registry->finishOperation($opId, 'failed', $e->getMessage(), $backupPath, $backupPath !== null, false);
            throw $e;
        }
    }

    /** @return array<string, mixed> */
    public function rollback(string $slug, ?int $initiatedBy = null): array
    {
        $row = $this->requireInstalled($slug);
        $ops = $this->registry->listOperations($slug, 20);
        $backupPath = null;
        foreach ($ops as $op) {
            if (($op['status'] ?? '') === 'success' && !empty($op['backup_path']) && ($op['file_rollback_available'] ?? 0)) {
                $backupPath = (string) $op['backup_path'];
                break;
            }
        }
        if ($backupPath === null || !is_file($backupPath)) {
            throw new \RuntimeException(
                'Нет снимка для отката. Rollback доступен только после успешного обновления (update) модуля, не после первой установки.',
            );
        }

        $fromVersion = (string) ($row['installed_version'] ?? '0.0.0');
        $opId = $this->registry->startOperation($slug, 'rollback', $fromVersion, null, $initiatedBy, $backupPath);
        try {
            $this->snapshots->restoreSnapshot($backupPath, $slug);
            $restored = $this->registry->getBySlug($slug);
            $toVersion = (string) ($restored['installed_version'] ?? $fromVersion);
            $this->registry->appendOperationLog($opId, 'Restored from ' . $backupPath);
            $health = $this->health->check($slug);
            $this->registry->finishOperation($opId, 'success', null, $backupPath, true, false);
            return ['ok' => true, 'slug' => $slug, 'from_version' => $fromVersion, 'to_version' => $toVersion, 'health' => $health];
        } catch (\Throwable $e) {
            $this->registry->finishOperation($opId, 'failed', $e->getMessage(), $backupPath, true, false);
            $this->registry->setStatus($slug, 'failed', $e->getMessage(), 'failed');
            throw $e;
        }
    }

    /**
     * @param array<string, mixed>|null $existingRow
     * @return array<string, mixed>
     */
    private function runPipeline(
        string $zipPath,
        ModuleManifest $manifest,
        string $operation,
        ?string $fromVersion,
        string $toVersion,
        ?int $initiatedBy,
        string $contentMode,
        ?array $existingRow,
    ): array {
        $slug = $manifest->slug();
        $opId = $this->registry->startOperation($slug, $operation, $fromVersion, $toVersion, $initiatedBy, $zipPath);
        $backupPath = null;
        $stagingOpId = $this->tempOperationId();
        $filesCommitted = false;

        try {
            $this->registry->appendOperationLog($opId, 'Extracting package');
            $staging = $this->staging->extractZipToStaging($zipPath, $stagingOpId);
            $packageRoot = $staging['package_root'];

            $cmsVersion = (string) ($this->app['version'] ?? '1.0.0');
            $validation = $this->validator()->validateExtracted($packageRoot, $cmsVersion, $this->installedVersionMap());
            if (!$validation['ok'] || !$validation['manifest'] instanceof ModuleManifest) {
                throw new \RuntimeException('Validation failed: ' . implode('; ', $validation['errors']));
            }

            if ($operation === 'update') {
                $this->registry->appendOperationLog($opId, 'Creating snapshot');
                $backupPath = $this->snapshots->createSnapshot($slug);
            }

            $modulesRoot = $this->paths->modulesRoot();
            if (!is_dir($modulesRoot) && !@mkdir($modulesRoot, 0775, true) && !is_dir($modulesRoot)) {
                throw new \RuntimeException('Cannot create modules root: ' . $modulesRoot);
            }
            $publicModulesRoot = $this->paths->publicModulesRoot();
            if (!is_dir($publicModulesRoot) && !@mkdir($publicModulesRoot, 0775, true) && !is_dir($publicModulesRoot)) {
                throw new \RuntimeException('Cannot create public modules root: ' . $publicModulesRoot);
            }

            $moduleRoot = $this->paths->moduleRoot($slug);
            $publicRoot = $this->paths->publicModuleRoot($slug);
            $storageRoot = $this->paths->moduleStorage($slug);

            $hookContextStaging = $this->makeInstallContext(
                $manifest,
                $packageRoot,
                $storageRoot,
                $operation === 'install' ? 'before_install' : 'before_update',
            );
            $this->hooks->runIfDefined($operation === 'install' ? 'before_install' : 'before_update', $hookContextStaging);
            foreach ($hookContextStaging->logs() as $line) {
                $this->registry->appendOperationLog($opId, $line);
            }

            if (!is_dir($moduleRoot)) {
                @mkdir($moduleRoot, 0775, true);
            }
            if (!is_dir($storageRoot)) {
                @mkdir($storageRoot, 0775, true);
            }

            $this->registry->appendOperationLog($opId, 'Copying module files');
            $fileInventory = $this->copyPackageFiles($packageRoot, $slug, $contentMode);
            $filesCommitted = true;
            $this->registry->appendOperationLog($opId, 'Copied ' . count($fileInventory) . ' files');

            $this->registerPermissions($manifest);

            $migrationsDir = $moduleRoot . '/' . trim($manifest->migrationsPath(), '/');
            $this->registry->appendOperationLog($opId, 'Applying migrations');
            $migResult = $this->migrations->applyPending($slug, $migrationsDir, $manifest->version());
            if ($migResult['error'] !== null) {
                throw new \RuntimeException('Migrations failed: ' . ($migResult['error']['message'] ?? ''));
            }

            $frontendManifest = $this->readFrontendManifest($packageRoot, $manifest);
            $signatureStatus = (string) ($validation['signature']['status'] ?? 'unsigned');

            $nextStatus = $operation === 'install'
                ? 'enabled'
                : (string) ($existingRow['status'] ?? 'enabled');
            if ($nextStatus === 'installed') {
                $nextStatus = 'enabled';
            }

            $this->registry->upsert([
                'slug' => $slug,
                'name' => $manifest->name(),
                'installed_version' => $manifest->version(),
                'status' => $nextStatus,
                'source' => 'package',
                'manifest_json' => json_encode($manifest->toArray(), JSON_UNESCAPED_UNICODE),
                'package_checksum' => 'sha256:' . hash_file('sha256', $zipPath),
                'signature_status' => $signatureStatus,
                'health_status' => 'unknown',
                'last_error' => null,
                'data_retention' => $manifest->preserveDataOnUninstall() ? 'preserve' : 'remove',
                'frontend_manifest_json' => $frontendManifest,
            ]);
            $this->registry->replaceModuleFiles($slug, $fileInventory);
            $this->syncPluginState($slug, $nextStatus === 'enabled');

            $hookContextInstalled = $this->makeInstallContext(
                $manifest,
                $moduleRoot,
                $storageRoot,
                $operation === 'install' ? 'after_install' : 'after_update',
            );
            $this->hooks->runIfDefined($operation === 'install' ? 'after_install' : 'after_update', $hookContextInstalled);
            foreach ($hookContextInstalled->logs() as $line) {
                $this->registry->appendOperationLog($opId, $line);
            }

            $health = $this->health->check($slug);
            $healthStatus = (string) ($health['status'] ?? 'unknown');
            if (in_array($healthStatus, ['failed', 'incompatible'], true)) {
                $msg = implode('; ', $health['issues'] ?? [$healthStatus]);
                // Keep copied files for diagnosis / "Проверка" — do not throw into wipe/restore.
                $this->registry->setStatus($slug, 'failed', 'Health check failed: ' . $msg, $healthStatus);
                $this->syncPluginState($slug, false);
                $this->registry->finishOperation($opId, 'failed', 'Health check failed: ' . $msg, $backupPath, $backupPath !== null, false);
                throw new \RuntimeException('Health check failed: ' . $msg);
            }
            $this->registry->setStatus($slug, $nextStatus, null, $healthStatus);
            // File rollback is available when a snapshot was taken (update).
            // DB migration revert is NOT implemented — never advertise db_rollback_available.
            $this->registry->finishOperation($opId, 'success', null, $backupPath, $backupPath !== null, false);

            return [
                'ok' => true,
                'operation' => $operation,
                'slug' => $slug,
                'version' => $manifest->version(),
                'migrations_applied' => $migResult['applied'],
                'files' => count($fileInventory),
                'health' => $health,
                'backup_path' => $backupPath,
                'file_rollback_available' => $backupPath !== null,
                'db_rollback_available' => false,
            ];
        } catch (\Throwable $e) {
            $isHealthFail = str_starts_with($e->getMessage(), 'Health check failed:');
            // Pre-copy failures: restore snapshot (update) or wipe install.
            // Post-copy update failures (except intentional health leave-in-place): restore snapshot
            // so filesystem + module_migrations + inventory stay consistent.
            if (!$filesCommitted) {
                if ($backupPath !== null && is_file($backupPath)) {
                    try {
                        $this->snapshots->restoreSnapshot($backupPath, $slug);
                        $this->registry->appendOperationLog($opId, 'Restored snapshot after failure');
                    } catch (\Throwable $restoreErr) {
                        $this->registry->appendOperationLog($opId, 'Snapshot restore failed: ' . $restoreErr->getMessage());
                    }
                } elseif ($operation === 'install') {
                    $this->removeInstalledFiles($slug);
                }
            } elseif (
                $operation === 'update'
                && !$isHealthFail
                && $backupPath !== null
                && is_file($backupPath)
            ) {
                try {
                    $this->snapshots->restoreSnapshot($backupPath, $slug);
                    $this->registry->appendOperationLog($opId, 'Restored snapshot after post-copy failure (update)');
                } catch (\Throwable $restoreErr) {
                    $this->registry->appendOperationLog(
                        $opId,
                        'Post-copy snapshot restore failed: ' . $restoreErr->getMessage() . ' — files left for diagnosis'
                    );
                }
            } else {
                $this->registry->appendOperationLog($opId, 'Left module files in place after failure (no wipe)');
            }
            $this->registry->setStatus($slug, 'failed', $e->getMessage(), 'failed');
            $op = $this->registry->getOperation($opId);
            if ($op === null || ($op['status'] ?? '') === 'running') {
                $this->registry->finishOperation($opId, 'failed', $e->getMessage(), $backupPath, $backupPath !== null, false);
            }
            throw $e;
        } finally {
            $this->staging->cleanupStaging($stagingOpId);
        }
    }

    /**
     * @return list<array{relative_path:string, sha256:string, size_bytes:int}>
     */
    private function copyPackageFiles(string $packageRoot, string $slug, string $contentMode): array
    {
        $packageRoot = rtrim(str_replace('\\', '/', $packageRoot), '/');
        $moduleRoot = $this->paths->moduleRoot($slug);
        $publicRoot = $this->paths->publicModuleRoot($slug);
        $inventory = [];

        foreach (self::META_FILES as $meta) {
            $src = $packageRoot . '/' . $meta;
            if (is_file($src)) {
                $this->copyFileInto($src, $moduleRoot . '/' . $meta, $moduleRoot);
                $inventory[] = $this->fileRecord($moduleRoot . '/' . $meta, $meta);
            }
        }

        $backendSrc = $packageRoot . '/backend';
        if (is_dir($backendSrc)) {
            foreach ($this->listFilesRecursive($backendSrc) as $rel) {
                $src = $backendSrc . '/' . $rel;
                $destRel = 'backend/' . $rel;
                $dest = $moduleRoot . '/' . $destRel;
                $this->copyFileInto($src, $dest, $moduleRoot);
                $inventory[] = $this->fileRecord($dest, $destRel);
            }
        }

        foreach (self::COPY_DIRS as $dir) {
            if ($dir === 'content' && $contentMode === 'skip') {
                continue;
            }
            $srcDir = $packageRoot . '/' . $dir;
            if (!is_dir($srcDir)) {
                continue;
            }
            $destDir = $moduleRoot . '/' . $dir;
            if ($dir === 'content' && $contentMode === 'replace' && is_dir($destDir)) {
                $this->removeTree($destDir);
            }
            foreach ($this->listFilesRecursive($srcDir) as $rel) {
                $src = $srcDir . '/' . $rel;
                $dest = $destDir . '/' . $rel;
                $this->copyFileInto($src, $dest, $moduleRoot);
                $inventory[] = $this->fileRecord($dest, $dir . '/' . $rel);
            }
        }

        $frontendSrc = $packageRoot . '/frontend-dist';
        if (is_dir($frontendSrc)) {
            if (!is_dir($publicRoot)) {
                @mkdir($publicRoot, 0775, true);
            }
            foreach ($this->listFilesRecursive($frontendSrc) as $rel) {
                $src = $frontendSrc . '/' . $rel;
                $dest = $publicRoot . '/' . $rel;
                $this->copyFileInto($src, $dest, $publicRoot);
                $inventory[] = $this->fileRecord($dest, 'public:' . $rel);
            }
        }

        return $inventory;
    }

    private function registerPermissions(ModuleManifest $manifest): void
    {
        foreach ($manifest->permissions() as $permSlug) {
            if ($permSlug === '') {
                continue;
            }
            $name = ucwords(str_replace(['.', '_', '-'], ' ', $permSlug));
            try {
                $this->db->run(
                    'INSERT IGNORE INTO permissions (slug, name, group_name, description) VALUES (?, ?, ?, ?)',
                    [$permSlug, $name, $manifest->slug(), '']
                );
            } catch (\Throwable) {
            }
        }
    }

    private function makeInstallContext(
        ModuleManifest $manifest,
        string $moduleRoot,
        string $storageRoot,
        string $operation,
    ): ModuleInstallContext {
        return new ModuleInstallContext(
            $this->db,
            $this->app,
            $manifest,
            $moduleRoot,
            $storageRoot,
            $operation,
            new EventDispatcher(),
            $this->migrations,
        );
    }

    private function runLifecycleHook(
        string $hookName,
        ModuleManifest $manifest,
        string $slug,
        string $operation,
        int $opId,
    ): void {
        $moduleRoot = $this->paths->moduleRoot($slug);
        $storageRoot = $this->paths->moduleStorage($slug);
        $ctx = $this->makeInstallContext($manifest, $moduleRoot, $storageRoot, $operation);
        $lines = $this->hooks->runIfDefined($hookName, $ctx);
        foreach ($lines as $line) {
            $this->registry->appendOperationLog($opId, $line);
        }
    }

    /** @return array<string, mixed> */
    private function requireInstalled(string $slug): array
    {
        $this->paths->assertSlug($slug);
        $row = $this->registry->getBySlug($slug);
        if ($row === null) {
            throw new \RuntimeException('Module not installed: ' . $slug);
        }
        return $row;
    }

    /** @param array<string, mixed> $row */
    private function rowManifest(array $row): ModuleManifest
    {
        $raw = $row['manifest_json'] ?? '';
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            throw new \RuntimeException('Stored manifest invalid');
        }
        return ModuleManifest::fromArray($data);
    }

    private function resolvePackagePath(string $packageIdOrPath): string
    {
        if (is_file($packageIdOrPath)) {
            return $packageIdOrPath;
        }
        $path = $this->paths->uploadsRoot() . '/' . $packageIdOrPath . '.zip';
        if (!is_file($path)) {
            $path = $this->paths->uploadsRoot() . '/' . $packageIdOrPath;
        }
        if (!is_file($path)) {
            throw new \RuntimeException('Package not found: ' . $packageIdOrPath);
        }
        return $path;
    }

    /** @return array<string, string> */
    private function installedVersionMap(): array
    {
        $cmsVersion = (string) ($this->app['version'] ?? '1.0.0');
        $map = [
            'system' => $cmsVersion,
            'users' => $cmsVersion,
            'module-manager' => $cmsVersion,
        ];
        // Bundled modules discovered on disk count as installed at CMS version.
        $bundledRoot = dirname(__DIR__, 2) . '/Modules';
        foreach (glob($bundledRoot . '/*', GLOB_ONLYDIR) ?: [] as $dir) {
            $name = strtolower(basename($dir));
            // Folder Names → plugin machine names are usually lowercase folder
            $slug = match ($name) {
                'modulemanager' => 'module-manager',
                default => preg_replace('/([a-z])([A-Z])/', '$1-$2', basename($dir)) ?? basename($dir),
            };
            $slug = strtolower((string) $slug);
            $map[$slug] = $cmsVersion;
            // Also map common short names (Forms → forms)
            $map[strtolower(basename($dir))] = $cmsVersion;
        }
        foreach ($this->registry->listAll() as $row) {
            $slug = (string) ($row['slug'] ?? '');
            if ($slug === '') {
                continue;
            }
            $map[$slug] = (string) ($row['installed_version'] ?? '0.0.0');
        }
        return $map;
    }

    private function tempOperationId(): int
    {
        return random_int(100000, 2147483646);
    }

    private function readFrontendManifest(string $packageRoot, ModuleManifest $manifest): ?string
    {
        $rel = $manifest->frontendManifestPath();
        if ($rel === null) {
            return null;
        }
        $path = $packageRoot . '/' . str_replace('\\', '/', $rel);
        if (!is_file($path)) {
            return null;
        }
        $raw = file_get_contents($path);
        return is_string($raw) ? $raw : null;
    }

    private function copyFileInto(string $src, string $dest, string $jailRoot): void
    {
        $src = str_replace('\\', '/', $src);
        $dest = str_replace('\\', '/', $dest);
        $this->paths->assertContained($jailRoot, dirname($dest));
        $parent = dirname($dest);
        if (!is_dir($parent)) {
            @mkdir($parent, 0775, true);
        }
        if (!@copy($src, $dest)) {
            throw new \RuntimeException('Copy failed: ' . basename($dest));
        }
    }

    /** @return array{relative_path:string, sha256:string, size_bytes:int} */
    private function fileRecord(string $absPath, string $relativePath): array
    {
        $size = (int) (filesize($absPath) ?: 0);
        return [
            'relative_path' => str_replace('\\', '/', $relativePath),
            'sha256' => hash_file('sha256', $absPath) ?: '',
            'size_bytes' => $size,
        ];
    }

    /** @return list<string> */
    private function listFilesRecursive(string $dir): array
    {
        $dir = rtrim(str_replace('\\', '/', $dir), '/');
        $out = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $fileInfo) {
            /** @var \SplFileInfo $fileInfo */
            if (!$fileInfo->isFile()) {
                continue;
            }
            $full = str_replace('\\', '/', $fileInfo->getPathname());
            $out[] = ltrim(substr($full, strlen($dir)), '/');
        }
        return $out;
    }

    private function removeInstalledFiles(string $slug): void
    {
        $this->removeTree($this->paths->moduleRoot($slug));
        $this->removeTree($this->paths->publicModuleRoot($slug));
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

    private function syncPluginState(string $slug, bool $enabled): void
    {
        (new ModulePluginMirror($this->db))->mirror($slug, $enabled);
    }

    /**
     * Align plugins `modules.is_enabled` with canonical installed_modules.status.
     *
     * @return array{
     *   ok:bool,
     *   dry_run:bool,
     *   scanned:int,
     *   checked:int,
     *   divergent:int,
     *   diverged:int,
     *   repaired:int,
     *   failed:int,
     *   unchanged:int,
     *   items:list<array<string,mixed>>,
     *   failures:list<array{slug:string,error:string}>
     * }
     */
    public function reconcilePluginMirror(bool $dryRun = true): array
    {
        return (new ModulePluginMirror($this->db))->reconcile($this->registry, $dryRun);
    }
}
