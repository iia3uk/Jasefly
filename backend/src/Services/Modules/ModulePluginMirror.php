<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Database;

/**
 * Mirrors package enable state into the plugins `modules` table.
 *
 * Canonical persistence for package lifecycle: installed_modules.status (A).
 * Runtime projection consumed by ModuleRegistry / PluginStateService: modules.is_enabled (B).
 * Correctness depends on mandatory synchronization after every lifecycle transition;
 * diagnostics / reconcile must expose projection drift — do not invent a third store.
 */
final class ModulePluginMirror
{
    public function __construct(private Database $db) {}

    /**
     * Write modules.is_enabled and verify persistence.
     *
     * @throws \RuntimeException when the mirror cannot be written or verified
     */
    public function mirror(string $slug, bool $enabled): void
    {
        $want = $enabled ? 1 : 0;
        $lastError = null;

        try {
            $this->db->run(
                'INSERT INTO modules (name, is_enabled, settings) VALUES (?, ?, NULL)
                 ON DUPLICATE KEY UPDATE is_enabled=VALUES(is_enabled)',
                [$slug, $want]
            );
        } catch (\Throwable $e) {
            $lastError = $e;
            try {
                $existing = $this->db->one('SELECT name FROM modules WHERE name=? LIMIT 1', [$slug]);
                if ($existing === null) {
                    $this->db->run(
                        'INSERT INTO modules (name, is_enabled, settings) VALUES (?, ?, NULL)',
                        [$slug, $want]
                    );
                } else {
                    $this->db->run(
                        'UPDATE modules SET is_enabled=? WHERE name=?',
                        [$want, $slug]
                    );
                }
                $lastError = null;
            } catch (\Throwable $e2) {
                $lastError = $e2;
            }
        }

        if ($lastError !== null) {
            throw new \RuntimeException(
                'Failed to mirror plugin state for ' . $slug . ': ' . $lastError->getMessage(),
                0,
                $lastError
            );
        }

        if (!$this->verifyMirror($slug, $enabled)) {
            throw new \RuntimeException(
                'Plugin mirror verify failed for ' . $slug . ' (expected is_enabled=' . $want . ')'
            );
        }
    }

    public function isPackageBacked(ModuleRegistryRepository $repo, string $slug): bool
    {
        $row = $repo->getBySlug($slug);
        if ($row === null) {
            return false;
        }
        return (string) ($row['source'] ?? 'package') !== 'bundled';
    }

    /**
     * Align modules.is_enabled with installed_modules.status for package rows.
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
    public function reconcile(ModuleRegistryRepository $repo, bool $dryRun = true): array
    {
        $items = [];
        $failures = [];
        $divergent = 0;
        $repaired = 0;
        $failed = 0;
        $unchanged = 0;
        $scanned = 0;

        foreach ($repo->listAll() as $row) {
            $source = (string) ($row['source'] ?? 'package');
            if ($source === 'bundled') {
                continue;
            }
            $slug = (string) ($row['slug'] ?? '');
            if ($slug === '') {
                continue;
            }
            $scanned++;
            $canonicalOn = (string) ($row['status'] ?? '') === 'enabled';
            $probe = $this->probeMirror($slug);
            $aligned = $probe['readable']
                && !$probe['missing']
                && $probe['enabled'] === $canonicalOn;
            if ($aligned) {
                $unchanged++;
                continue;
            }
            $divergent++;
            $items[] = [
                'slug' => $slug,
                'installed_status' => (string) ($row['status'] ?? ''),
                'modules_is_enabled' => $probe['enabled'],
                'target_is_enabled' => $canonicalOn,
                'mirror_row_missing' => $probe['missing'] || !$probe['readable'],
            ];
            if ($dryRun) {
                continue;
            }
            try {
                $this->mirror($slug, $canonicalOn);
                if (!$this->verifyMirror($slug, $canonicalOn)) {
                    throw new \RuntimeException('post-write verify failed');
                }
                $repaired++;
            } catch (\Throwable $e) {
                $failed++;
                $failures[] = [
                    'slug' => $slug,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return [
            'ok' => $failed === 0,
            'dry_run' => $dryRun,
            'scanned' => $scanned,
            'checked' => $scanned,
            'divergent' => $divergent,
            'diverged' => $divergent,
            'repaired' => $repaired,
            'failed' => $failed,
            'unchanged' => $unchanged,
            'items' => $items,
            'failures' => $failures,
        ];
    }

    /**
     * @return array{readable:bool, missing:bool, enabled:?bool}
     */
    private function probeMirror(string $slug): array
    {
        try {
            $row = $this->db->one('SELECT is_enabled FROM modules WHERE name=? LIMIT 1', [$slug]);
            if ($row === null) {
                return ['readable' => true, 'missing' => true, 'enabled' => null];
            }
            return [
                'readable' => true,
                'missing' => false,
                'enabled' => (int) ($row['is_enabled'] ?? 0) === 1,
            ];
        } catch (\Throwable) {
            return ['readable' => false, 'missing' => true, 'enabled' => null];
        }
    }

    private function verifyMirror(string $slug, bool $enabled): bool
    {
        try {
            $row = $this->db->one('SELECT is_enabled FROM modules WHERE name=? LIMIT 1', [$slug]);
            if ($row === null) {
                return false;
            }
            return ((int) ($row['is_enabled'] ?? 0) === 1) === $enabled;
        } catch (\Throwable) {
            return false;
        }
    }
}
