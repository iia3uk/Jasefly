<?php
declare(strict_types=1);

namespace App\Platform\Analysis;

/**
 * Static scan of package sources — packages may only use App\Platform\* (and PHP stdlib).
 */
final class PackageStaticAnalyzer
{
    /** @var list<string> */
    private const FORBIDDEN_PHP = [
        'App\\Core\\',
        'App\\Modules\\',
        'App\\Services\\',
        'App\\Controllers\\',
        'App\\Middleware\\',
        'App\\Support\\',
        'Container::get',
        'new Mailer',
        'new JobQueue',
        'new NotificationService',
        'new MediaService',
        'new PermissionService',
    ];

    /** Allowed even if they match substrings of forbidden (Platform HTTP uses Router types via interface). */
    private const ALLOWED_PHP_PREFIXES = [
        'App\\Platform\\',
        'App\\PackageModules\\',
    ];

    /** @var list<string> */
    private const FORBIDDEN_JS = [
        "from '@/core/",
        'from "@/core/',
        "from '@/admin/",
        'from "@/lib/api"',
        "from '@/modules/",
        "from '@/builder/registry",
    ];

    /**
     * @return array{ok:bool, errors:list<string>, warnings:list<string>, files_scanned:int}
     */
    public function analyzeDirectory(string $root): array
    {
        $errors = [];
        $warnings = [];
        $files = 0;
        $root = rtrim(str_replace('\\', '/', $root), '/');
        if (!is_dir($root)) {
            return ['ok' => false, 'errors' => ['Directory not found: ' . $root], 'warnings' => [], 'files_scanned' => 0];
        }

        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            if (!$file->isFile()) {
                continue;
            }
            $path = str_replace('\\', '/', $file->getPathname());
            $rel = ltrim(substr($path, strlen($root)), '/');
            $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            if ($ext === 'php') {
                if (str_contains($rel, 'vendor/') || str_contains($rel, 'node_modules/')) {
                    continue;
                }
                $files++;
                $raw = (string) file_get_contents($path);
                $isHook = str_starts_with($rel, 'hooks/');
                $errors = array_merge($errors, $this->scanPhp($rel, $raw, $isHook));
            } elseif (in_array($ext, ['js', 'ts', 'tsx', 'mjs'], true)) {
                if (str_starts_with($rel, 'frontend/') || str_starts_with($rel, 'frontend-dist/')) {
                    $files++;
                    $raw = (string) file_get_contents($path);
                    $errors = array_merge($errors, $this->scanJs($rel, $raw));
                }
            }
        }

        return [
            'ok' => $errors === [],
            'errors' => $errors,
            'warnings' => $warnings,
            'files_scanned' => $files,
        ];
    }

    /** @return list<string> */
    private function scanPhp(string $rel, string $raw, bool $isHook = false): array
    {
        $out = [];
        foreach (self::FORBIDDEN_PHP as $needle) {
            if (!str_contains($raw, $needle)) {
                continue;
            }
            // Install hooks may type-hint ModuleInstallContext (installer API).
            if ($isHook && str_contains($needle, 'App\\Core\\') && str_contains($raw, 'ModuleInstallContext')) {
                continue;
            }
            if ($needle === 'App\\Core\\' || $needle === 'App\\Modules\\' || $needle === 'App\\Services\\'
                || $needle === 'App\\Controllers\\' || $needle === 'App\\Middleware\\' || $needle === 'App\\Support\\') {
                if (preg_match('/\buse\s+' . preg_quote($needle, '/') . '/', $raw)
                    || preg_match('/\\\\' . preg_quote(rtrim($needle, '\\'), '/') . '\\\\/', $raw)) {
                    $out[] = "{$rel}: forbidden reference to {$needle}";
                }
            } else {
                $out[] = "{$rel}: forbidden pattern {$needle}";
            }
        }
        if (!$isHook && preg_match('/\buse\s+App\\\\(Database|Router|Request|Response)\b/', $raw)) {
            $out[] = "{$rel}: use App\\Database|Router|Request|Response — use PlatformContext instead";
        }
        return $out;
    }

    /** @return list<string> */
    private function scanJs(string $rel, string $raw): array
    {
        $out = [];
        foreach (self::FORBIDDEN_JS as $needle) {
            if (str_contains($raw, $needle)) {
                $out[] = "{$rel}: forbidden import {$needle} — use @/platform or host register(ctx)";
            }
        }
        return $out;
    }
}
