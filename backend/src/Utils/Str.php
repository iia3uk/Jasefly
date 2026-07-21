<?php
declare(strict_types=1);
namespace App\Utils;
final class Str { public static function slug(string $s): string { $s=iconv('UTF-8','ASCII//TRANSLIT',$s) ?: $s; return trim(preg_replace('/[^a-z0-9]+/','-',strtolower($s)),'-'); } }
