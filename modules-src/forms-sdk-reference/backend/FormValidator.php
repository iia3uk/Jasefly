<?php
declare(strict_types=1);

namespace App\PackageModules\FormsSdkReference;

final class FormValidator
{
    /**
     * @param list<array<string, mixed>> $fields
     * @param array<string, mixed> $values
     * @return array{ok:bool, errors:array<string,string>, visible:array<string,bool>}
     */
    public static function validate(array $fields, array $values): array
    {
        $errors = [];
        $visible = [];
        foreach ($fields as $field) {
            $name = (string) ($field['name'] ?? '');
            $type = (string) ($field['type'] ?? 'text');
            if ($name === '' || in_array($type, ['heading', 'paragraph'], true)) {
                continue;
            }
            $vis = $field['visibility'] ?? null;
            if (is_string($vis)) {
                $vis = json_decode($vis, true);
            }
            $isVisible = self::isVisible(is_array($vis) ? $vis : null, $values);
            $visible[$name] = $isVisible;
            if (!$isVisible) {
                continue;
            }
            $required = (int) ($field['required'] ?? 0) === 1;
            $val = $values[$name] ?? null;
            $rules = $field['validation'] ?? [];
            if (is_string($rules)) {
                $rules = json_decode($rules, true) ?: [];
            }
            if (!is_array($rules)) {
                $rules = [];
            }

            if ($required && self::isEmpty($val)) {
                $errors[$name] = 'Обязательное поле';
                continue;
            }
            if (self::isEmpty($val)) {
                continue;
            }

            if (($type === 'email' || !empty($rules['email'])) && !filter_var((string) $val, FILTER_VALIDATE_EMAIL)) {
                $errors[$name] = 'Некорректный email';
            }
            if (!empty($rules['min_length']) && mb_strlen((string) $val) < (int) $rules['min_length']) {
                $errors[$name] = 'Слишком короткое значение';
            }
            if (!empty($rules['max_length']) && mb_strlen((string) $val) > (int) $rules['max_length']) {
                $errors[$name] = 'Слишком длинное значение';
            }
            if (isset($rules['min']) && is_numeric($val) && (float) $val < (float) $rules['min']) {
                $errors[$name] = 'Меньше минимума';
            }
            if (isset($rules['max']) && is_numeric($val) && (float) $val > (float) $rules['max']) {
                $errors[$name] = 'Больше максимума';
            }
            if (!empty($rules['regex']) && is_string($rules['regex'])) {
                $re = $rules['regex'];
                if (@preg_match($re, '') === false) {
                    $re = '/' . str_replace('/', '\/', $re) . '/u';
                }
                if (@preg_match($re, (string) $val) !== 1) {
                    $errors[$name] = 'Неверный формат';
                }
            }
            if ($type === 'phone' || !empty($rules['phone'])) {
                $digits = preg_replace('/\D+/', '', (string) $val) ?? '';
                if (strlen($digits) < 7 || strlen($digits) > 15) {
                    $errors[$name] = 'Некорректный телефон';
                }
            }
            if ($type === 'consent' && !(bool) $val) {
                $errors[$name] = 'Требуется согласие';
            }
        }
        return ['ok' => $errors === [], 'errors' => $errors, 'visible' => $visible];
    }

    /**
     * @param array<string, mixed>|null $visibility
     * @param array<string, mixed> $values
     */
    private static function isVisible(?array $visibility, array $values): bool
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
            $empty = $actual === null || $actual === '' || $actual === [];
            $results[] = match ($operator) {
                'equals', 'eq' => (string) $actual === (string) $expected,
                'does_not_equal', 'neq', 'not_equals' => (string) $actual !== (string) $expected,
                'contains' => is_string($actual) && is_string($expected) && str_contains($actual, $expected),
                'is_empty', 'empty' => $empty,
                'is_not_empty' => !$empty,
                default => true,
            };
        }
        if ($results === []) {
            return true;
        }
        return $op === 'OR' ? in_array(true, $results, true) : !in_array(false, $results, true);
    }

    private static function isEmpty(mixed $val): bool
    {
        return $val === null || $val === '' || $val === [] || $val === false;
    }
}
