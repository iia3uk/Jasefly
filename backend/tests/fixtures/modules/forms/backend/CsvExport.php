<?php
declare(strict_types=1);

namespace App\PackageModules\Forms;

/**
 * Package-local CSV builder with formula-injection escaping.
 */
final class CsvExport
{
    /** Escape CSV formula injection (= + - @). */
    public static function cell(mixed $value): string
    {
        $s = (string) ($value ?? '');
        $s = str_replace(["\r\n", "\r", "\n"], ' ', $s);
        if ($s !== '' && preg_match('/^[=+\-@]/', $s)) {
            $s = "'" . $s;
        }
        return $s;
    }

    /**
     * @param list<string> $headers
     * @param list<list<mixed>> $rows
     */
    public static function build(array $headers, array $rows): string
    {
        $out = fopen('php://temp', 'r+');
        if ($out === false) {
            return '';
        }
        fputcsv($out, array_map([self::class, 'cell'], $headers));
        foreach ($rows as $row) {
            fputcsv($out, array_map([self::class, 'cell'], $row));
        }
        rewind($out);
        $csv = stream_get_contents($out) ?: '';
        fclose($out);
        return $csv;
    }
}
