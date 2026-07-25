<?php
declare(strict_types=1);

namespace App\Core\Modules;

/**
 * Semver-ish dependency checks for module packages.
 */
final class ModuleDependencyResolver
{
    /**
     * @param array<string, string> $installedMap slug => version (enabled or installed)
     * @return array{ok:bool, missing:list<array{slug:string,constraint:string}>, conflicts:list<array{slug:string,constraint:string,installed:string}>, optional:list<array{slug:string,constraint:string,installed:?string}>}
     */
    public function plan(ModuleManifest $manifest, array $installedMap): array
    {
        $missing = [];
        $conflicts = [];
        $optional = [];

        foreach ($manifest->requiredDependencies() as $slug => $constraint) {
            $have = $installedMap[$slug] ?? null;
            if ($have === null || !$this->satisfies($have, $constraint)) {
                $missing[] = ['slug' => $slug, 'constraint' => $constraint];
            }
        }

        foreach ($manifest->conflicts() as $slug => $constraint) {
            $have = $installedMap[$slug] ?? null;
            if ($have !== null && $this->satisfies($have, $constraint)) {
                $conflicts[] = ['slug' => $slug, 'constraint' => $constraint, 'installed' => $have];
            }
        }

        foreach ($manifest->optionalDependencies() as $slug => $constraint) {
            $have = $installedMap[$slug] ?? null;
            $optional[] = [
                'slug' => $slug,
                'constraint' => $constraint,
                'installed' => $have,
            ];
        }

        return [
            'ok' => $missing === [] && $conflicts === [],
            'missing' => $missing,
            'conflicts' => $conflicts,
            'optional' => $optional,
        ];
    }

    public function satisfies(string $version, string $constraint): bool
    {
        $constraint = trim($constraint);
        if ($constraint === '' || $constraint === '*') {
            return true;
        }
        if (preg_match('/^(>=|<=|>|<|=|==)\s*(.+)$/', $constraint, $m)) {
            $op = $m[1] === '==' ? '=' : $m[1];
            return $this->compare($version, trim($m[2]), $op);
        }
        // bare version → exact
        return $this->compare($version, $constraint, '=');
    }

    public function compare(string $a, string $b, string $op): bool
    {
        $cmp = version_compare($this->normalize($a), $this->normalize($b));
        return match ($op) {
            '>' => $cmp > 0,
            '>=' => $cmp >= 0,
            '<' => $cmp < 0,
            '<=' => $cmp <= 0,
            '=' => $cmp === 0,
            default => false,
        };
    }

    public function isNewer(string $candidate, string $current): bool
    {
        return $this->compare($candidate, $current, '>');
    }

    public function normalize(string $version): string
    {
        $version = trim($version);
        if ($version === '') {
            return '0.0.0';
        }
        // strip build/prerelease for comparison baseline
        $version = preg_replace('/[-+].*$/', '', $version) ?? $version;
        $parts = explode('.', $version);
        while (count($parts) < 3) {
            $parts[] = '0';
        }
        return implode('.', array_slice($parts, 0, 3));
    }
}
