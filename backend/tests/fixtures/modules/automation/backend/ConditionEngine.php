<?php
declare(strict_types=1);

namespace App\PackageModules\Automation;

final class ConditionEngine
{
    public function matches(mixed $condition, array $context): bool
    {
        if (!is_array($condition) || $condition === []) {
            return true;
        }
        if (isset($condition['all']) && is_array($condition['all'])) {
            foreach ($condition['all'] as $child) {
                if (!$this->matches($child, $context)) {
                    return false;
                }
            }
            return true;
        }
        if (isset($condition['any']) && is_array($condition['any'])) {
            foreach ($condition['any'] as $child) {
                if ($this->matches($child, $context)) {
                    return true;
                }
            }
            return false;
        }

        $actual = $this->value($context, (string) ($condition['path'] ?? $condition['field'] ?? ''));
        $expected = $condition['value'] ?? null;
        return match ((string) ($condition['operator'] ?? 'equals')) {
            'equals' => $actual == $expected,
            'not_equals' => $actual != $expected,
            'contains' => is_array($actual)
                ? in_array($expected, $actual, true)
                : str_contains((string) $actual, (string) $expected),
            'greater_than' => is_numeric($actual) && is_numeric($expected) && (float) $actual > (float) $expected,
            'less_than' => is_numeric($actual) && is_numeric($expected) && (float) $actual < (float) $expected,
            'is_empty' => $actual === null || $actual === '' || $actual === [],
            'is_not_empty' => !($actual === null || $actual === '' || $actual === []),
            'in' => is_array($expected) && in_array($actual, $expected, true),
            'not_in' => is_array($expected) && !in_array($actual, $expected, true),
            default => false,
        };
    }

    public function value(array $context, string $path): mixed
    {
        if ($path === '') {
            return null;
        }
        $value = $context;
        foreach (explode('.', $path) as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) {
                return null;
            }
            $value = $value[$part];
        }
        return $value;
    }
}
