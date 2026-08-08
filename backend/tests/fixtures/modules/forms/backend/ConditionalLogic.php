<?php
declare(strict_types=1);

namespace App\PackageModules\Forms;

final class ConditionalLogic
{
    /**
     * @param array<string, mixed> $visibility  {op: AND|OR, rules: [{field, operator, value}]}
     * @param array<string, mixed> $values
     */
    public static function isVisible(?array $visibility, array $values): bool
    {
        if (!$visibility || empty($visibility['rules']) || !is_array($visibility['rules'])) {
            return true;
        }
        $op = strtoupper((string) ($visibility['op'] ?? 'AND'));
        $results = [];
        foreach ($visibility['rules'] as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            $field = (string) ($rule['field'] ?? '');
            $operator = (string) ($rule['operator'] ?? 'equals');
            $expected = $rule['value'] ?? null;
            $actual = $values[$field] ?? null;
            $results[] = self::match($operator, $actual, $expected);
        }
        if ($results === []) {
            return true;
        }
        return $op === 'OR' ? in_array(true, $results, true) : !in_array(false, $results, true);
    }

    private static function match(string $operator, mixed $actual, mixed $expected): bool
    {
        $empty = $actual === null || $actual === '' || $actual === [];
        return match ($operator) {
            'equals', 'eq' => (string) $actual === (string) $expected,
            'does_not_equal', 'neq', 'not_equals' => (string) $actual !== (string) $expected,
            'contains' => is_string($actual) && is_string($expected) && str_contains($actual, $expected),
            'is_empty' => $empty,
            'is_not_empty' => !$empty,
            default => true,
        };
    }
}
