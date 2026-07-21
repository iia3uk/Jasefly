<?php
declare(strict_types=1);

namespace App\Modules\Ddos;

/** IPv4/IPv6 CIDR membership helpers for origin-shield checks. */
final class IpUtils
{
    public static function inCidr(string $ip, string $cidr): bool
    {
        $ip = trim($ip);
        $cidr = trim($cidr);
        if ($ip === '' || $cidr === '') {
            return false;
        }
        if (!str_contains($cidr, '/')) {
            return $ip === $cidr;
        }
        [$subnet, $mask] = explode('/', $cidr, 2);
        $mask = (int) $mask;
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)
            && filter_var($subnet, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $ipLong = ip2long($ip);
            $subLong = ip2long($subnet);
            if ($ipLong === false || $subLong === false || $mask < 0 || $mask > 32) {
                return false;
            }
            $maskLong = $mask === 0 ? 0 : (-1 << (32 - $mask));
            return ($ipLong & $maskLong) === ($subLong & $maskLong);
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)
            && filter_var($subnet, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $ipBin = inet_pton($ip);
            $subBin = inet_pton($subnet);
            if ($ipBin === false || $subBin === false || $mask < 0 || $mask > 128) {
                return false;
            }
            $bytes = intdiv($mask, 8);
            $bits = $mask % 8;
            if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($subBin, 0, $bytes)) {
                return false;
            }
            if ($bits === 0) {
                return true;
            }
            $maskByte = (~((1 << (8 - $bits)) - 1)) & 0xFF;
            return (ord($ipBin[$bytes]) & $maskByte) === (ord($subBin[$bytes]) & $maskByte);
        }
        return false;
    }

    /** @param list<string> $cidrs */
    public static function inAny(string $ip, array $cidrs): bool
    {
        foreach ($cidrs as $cidr) {
            if (self::inCidr($ip, $cidr)) {
                return true;
            }
        }
        return false;
    }
}
