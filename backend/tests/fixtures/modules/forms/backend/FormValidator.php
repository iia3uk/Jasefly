<?php
declare(strict_types=1);

namespace App\PackageModules\Forms;

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
            if ($name === '' || in_array($field['type'] ?? '', ['heading', 'paragraph', 'hidden'], true) && ($field['type'] ?? '') !== 'hidden') {
                if (in_array($field['type'] ?? '', ['heading', 'paragraph'], true)) {
                    continue;
                }
            }
            $vis = $field['visibility'] ?? null;
            if (is_string($vis)) {
                $vis = json_decode($vis, true);
            }
            $isVisible = ConditionalLogic::isVisible(is_array($vis) ? $vis : null, $values);
            $visible[$name] = $isVisible;
            if (!$isVisible) {
                continue;
            }
            $type = (string) ($field['type'] ?? 'text');
            $required = (int) ($field['required'] ?? 0) === 1;
            $val = $values[$name] ?? null;
            $rules = $field['validation'] ?? [];
            if (is_string($rules)) {
                $rules = json_decode($rules, true) ?: [];
            }
            if (!is_array($rules)) {
                $rules = [];
            }

            if ($required && self::isEmpty($val) && $type !== 'heading' && $type !== 'paragraph') {
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

    private static function isEmpty(mixed $val): bool
    {
        return $val === null || $val === '' || $val === [] || $val === false;
    }
}
