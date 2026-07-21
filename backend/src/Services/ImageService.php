<?php
declare(strict_types=1);

namespace App\Services;

final class ImageService
{
    public static function thumbnail(string $source, string $dest, int $max = 480): bool
    {
        $info = @getimagesize($source);
        if (!$info) {
            return false;
        }
        [$w, $h] = $info;
        $mime = $info['mime'] ?? '';
        $src = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($source),
            'image/png' => @imagecreatefrompng($source),
            'image/gif' => @imagecreatefromgif($source),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($source) : false,
            default => false,
        };
        if (!$src) {
            return false;
        }
        $scale = min(1, $max / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        $ok = imagejpeg($dst, $dest, 82);
        imagedestroy($src);
        imagedestroy($dst);
        return $ok;
    }

    public static function toWebp(string $source, string $dest, int $quality = 80): bool
    {
        if (!function_exists('imagewebp')) {
            return false;
        }
        $info = @getimagesize($source);
        if (!$info) {
            return false;
        }
        $mime = $info['mime'] ?? '';
        $src = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($source),
            'image/png' => @imagecreatefrompng($source),
            'image/gif' => @imagecreatefromgif($source),
            default => false,
        };
        if (!$src) {
            return false;
        }
        $ok = imagewebp($src, $dest, $quality);
        imagedestroy($src);
        return $ok;
    }
}
