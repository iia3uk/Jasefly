<?php
declare(strict_types=1);
namespace App;
final class Jwt {
    private static function b64(string $v): string { return rtrim(strtr(base64_encode($v), '+/', '-_'), '='); }
    private static function unb64(string $v): string { return base64_decode(strtr($v, '-_', '+/'), true) ?: ''; }
    public static function encode(array $payload, string $secret): string {
        $h=self::b64(json_encode(['alg'=>'HS256','typ'=>'JWT'], JSON_THROW_ON_ERROR));
        $p=self::b64(json_encode($payload, JSON_THROW_ON_ERROR)); $s=self::b64(hash_hmac('sha256',"$h.$p",$secret,true));
        return "$h.$p.$s";
    }
    public static function decode(string $token, string $secret): array {
        [$h,$p,$s] = array_pad(explode('.',$token),3,''); $sig=self::b64(hash_hmac('sha256',"$h.$p",$secret,true));
        if (!$h || !hash_equals($sig,$s)) throw new \RuntimeException('Invalid token');
        $data=json_decode(self::unb64($p),true,512,JSON_THROW_ON_ERROR);
        if (($data['exp'] ?? 0) < time()) throw new \RuntimeException('Token expired');
        return $data;
    }
}
