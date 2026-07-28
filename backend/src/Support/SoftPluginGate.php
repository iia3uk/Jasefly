<?php
declare(strict_types=1);

namespace App\Support;

use App\Core\ModuleRegistry;
use App\Response;

/**
 * Soft-disabled plugin HTTP contract (Design B).
 * Routes stay registered; behavior degrades without booting domain as enabled.
 */
final class SoftPluginGate
{
    /**
     * @return 'pass'|'empty_list'|'not_found'|'plugin_disabled'
     */
    public static function decide(bool $pluginEnabled, string $method, bool $isItem): string
    {
        if ($pluginEnabled) {
            return 'pass';
        }
        $m = strtoupper($method);
        if ($m === 'GET' && !$isItem) {
            return 'empty_list';
        }
        if ($m === 'GET') {
            return 'not_found';
        }
        return 'plugin_disabled';
    }

    /**
     * Structured soft response (no exit) — used by enforce and behavioral tests.
     *
     * @return array{status:int, body:array<string,mixed>}
     */
    public static function responseFor(string $decision, string $pluginName): array
    {
        return match ($decision) {
            'empty_list' => [
                'status' => 200,
                'body' => ['data' => []],
            ],
            'not_found' => [
                'status' => 404,
                'body' => [
                    'success' => false,
                    'error' => 'Not found',
                    'errors' => [],
                    'data' => null,
                ],
            ],
            'plugin_disabled' => [
                'status' => 409,
                'body' => [
                    'success' => false,
                    'error' => 'Plugin disabled',
                    'errors' => [],
                    'data' => null,
                    'code' => 'plugin_disabled',
                    'plugin' => $pluginName,
                ],
            ],
            default => throw new \InvalidArgumentException('Unknown soft gate decision: ' . $decision),
        };
    }

    /**
     * Resolve soft outcome for a live registry state without exiting.
     *
     * @return null|array{status:int, body:array<string,mixed>} null = pass through to handler
     */
    public static function outcome(ModuleRegistry $registry, string $pluginName, string $method, bool $isItem): ?array
    {
        $decision = self::decide($registry->isEnabledByName($pluginName), $method, $isItem);
        if ($decision === 'pass') {
            return null;
        }
        return self::responseFor($decision, $pluginName);
    }

    /**
     * Exit with soft response when plugin is off; return when enabled.
     */
    public static function enforce(ModuleRegistry $registry, string $pluginName, string $method, bool $isItem): void
    {
        $payload = self::outcome($registry, $pluginName, $method, $isItem);
        if ($payload === null) {
            return;
        }
        Response::json($payload['body'], $payload['status']);
    }
}
