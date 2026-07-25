<?php
declare(strict_types=1);

namespace App\Platform\Analysis;

use App\Platform\Manifest\PublicApiRegistry;
use App\Platform\PlatformContext;
use App\Platform\SdkVersion;
use ReflectionClass;
use ReflectionMethod;

/**
 * Snapshot of public Platform Contracts + PlatformContext methods for API drift detection.
 */
final class ApiSnapshot
{
    private const SNAPSHOT_FILE = __DIR__ . '/../Manifest/api-snapshot.v1.json';

    /** @return array<string, mixed> */
    public function generate(): array
    {
        $contracts = [];
        $reg = new PublicApiRegistry();
        foreach ($reg->listApis() as $entry) {
            $id = (string) ($entry['id'] ?? '');
            if (!str_starts_with($id, 'App\\Platform\\Contracts\\')) {
                continue;
            }
            if (!interface_exists($id)) {
                continue;
            }
            $contracts[$id] = $this->reflectType($id);
        }

        $context = $this->reflectType(PlatformContext::class, publicOnly: true);

        return [
            'schema_version' => 1,
            'sdk_version' => SdkVersion::CURRENT,
            'generated_at' => gmdate(DATE_ATOM),
            'contracts' => $contracts,
            'context' => $context,
        ];
    }

    public function write(?string $path = null): string
    {
        $target = $path ?? self::SNAPSHOT_FILE;
        $payload = $this->generate();
        $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        file_put_contents($target, $json);
        return $target;
    }

    /** @return array<string, mixed>|null */
    public function loadCommitted(?string $path = null): ?array
    {
        $target = $path ?? self::SNAPSHOT_FILE;
        if (!is_file($target)) {
            return null;
        }
        $raw = file_get_contents($target);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($data) ? $data : null;
    }

    /**
     * @return array{ok:bool, breaking:list<string>, added:list<string>, removed:list<string>}
     */
    public function diff(?array $committed = null, ?array $current = null): array
    {
        $committed = $committed ?? $this->loadCommitted();
        $current = $current ?? $this->generate();
        if ($committed === null) {
            return [
                'ok' => false,
                'breaking' => ['No committed api-snapshot.v1.json — run api-snapshot to generate baseline'],
                'added' => [],
                'removed' => [],
            ];
        }

        $breaking = [];
        $added = [];
        $removed = [];

        $committedMethods = $this->flattenMethods($committed);
        $currentMethods = $this->flattenMethods($current);

        foreach ($committedMethods as $key => $sig) {
            if (!isset($currentMethods[$key])) {
                $removed[] = $key;
                $breaking[] = 'Removed: ' . $key;
            } elseif ($currentMethods[$key] !== $sig) {
                $breaking[] = 'Changed signature: ' . $key . ' (' . $sig . ' -> ' . $currentMethods[$key] . ')';
            }
        }

        foreach ($currentMethods as $key => $_sig) {
            if (!isset($committedMethods[$key])) {
                $added[] = $key;
            }
        }

        return [
            'ok' => $breaking === [],
            'breaking' => $breaking,
            'added' => $added,
            'removed' => $removed,
        ];
    }

    /**
     * @return array{class:string, methods:array<string, string>}
     */
    private function reflectType(string $className, bool $publicOnly = false): array
    {
        $ref = new ReflectionClass($className);
        $methods = [];
        foreach ($ref->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
            if ($publicOnly && ($method->getDeclaringClass()->getName() !== $className || $method->isStatic())) {
                continue;
            }
            if ($method->isConstructor()) {
                continue;
            }
            $methods[$method->getName()] = $this->methodSignature($method);
        }
        ksort($methods);
        return ['class' => $className, 'methods' => $methods];
    }

    private function methodSignature(ReflectionMethod $method): string
    {
        $params = [];
        foreach ($method->getParameters() as $p) {
            $chunk = '';
            $type = $p->getType();
            if ($type !== null) {
                $chunk .= $type . ' ';
            }
            if ($p->isVariadic()) {
                $chunk .= '...';
            }
            $chunk .= '$' . $p->getName();
            if ($p->isOptional() && $p->isDefaultValueAvailable()) {
                $dv = $p->getDefaultValue();
                $chunk .= '=' . var_export($dv, true);
            }
            $params[] = $chunk;
        }
        $ret = $method->getReturnType();
        $retStr = $ret !== null ? ': ' . $ret : '';
        return $method->getName() . '(' . implode(', ', $params) . ')' . $retStr;
    }

    /**
     * @param array<string, mixed> $snapshot
     * @return array<string, string>
     */
    private function flattenMethods(array $snapshot): array
    {
        $out = [];
        foreach (['contracts', 'context'] as $section) {
            $block = $snapshot[$section] ?? null;
            if (!is_array($block)) {
                continue;
            }
            if (isset($block['methods']) && is_array($block['methods'])) {
                $class = (string) ($block['class'] ?? 'context');
                foreach ($block['methods'] as $name => $sig) {
                    $out[$class . '::' . $name] = (string) $sig;
                }
                continue;
            }
            foreach ($block as $class => $data) {
                if (!is_array($data) || !isset($data['methods']) || !is_array($data['methods'])) {
                    continue;
                }
                foreach ($data['methods'] as $name => $sig) {
                    $out[$class . '::' . $name] = (string) $sig;
                }
            }
        }
        return $out;
    }
}
