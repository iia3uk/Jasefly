<?php
declare(strict_types=1);

namespace App\PackageModules\Translate;

use App\Platform\Contracts\PlatformDatabaseInterface;

/**
 * Machine translation with DB cache (warmup + cache-only overlay).
 * Never persists failed / echoed translations (source === target for cross-lang).
 */
final class TranslateService
{
    private const TIMEOUT = 18;

    private ?TranslateCache $cache;

    /** @param array<string, mixed> $settings */
    public function __construct(
        private array $settings,
        private ?PlatformDatabaseInterface $db = null,
    ) {
        $this->cache = $db ? new TranslateCache($db) : null;
        if ($this->cache) {
            $this->cache->ensureTable();
        }
    }

    /**
     * @param list<string> $texts
     * @param int $fillMissCap When cacheOnly: live-MT at most this many unique misses (0 = none).
     * @return array{translations: list<string>, cached: int, fetched: int, provider: string, missing: int, failed: int, partial: bool, quota_hit: bool}
     */
    public function translateBatch(array $texts, string $source, string $target, bool $cacheOnly = false, int $fillMissCap = 0): array
    {
        $source = strtolower(trim($source));
        $target = strtolower(trim($target));
        $provider = (string) ($this->settings['provider'] ?? 'google');
        $fillMissCap = max(0, min(24, $fillMissCap));

        if ($source === '' || $target === '' || $source === $target || $texts === []) {
            return [
                'translations' => $texts,
                'cached' => count($texts),
                'fetched' => 0,
                'missing' => 0,
                'failed' => 0,
                'partial' => false,
                'quota_hit' => false,
                'provider' => $provider,
            ];
        }

        $cachedMap = $this->cache ? $this->cache->getMany($source, $target, $texts) : [];
        $out = [];
        $missIndex = [];
        $missTexts = [];

        foreach ($texts as $i => $text) {
            $hash = TranslateCache::hash($text);
            if (isset($cachedMap[$hash]) && self::isAcceptable($source, $target, $text, $cachedMap[$hash])) {
                $out[$i] = $cachedMap[$hash];
            } else {
                if (isset($cachedMap[$hash]) && $this->cache) {
                    // Drop bogus row so warmup can retry.
                    $this->cache->deleteHash($source, $target, $hash);
                }
                $missIndex[] = $i;
                $missTexts[] = $text;
            }
        }

        $fetched = 0;
        $failed = 0;
        $quotaHit = false;
        $partial = false;
        if ($missTexts !== []) {
            if ($cacheOnly && $fillMissCap <= 0) {
                foreach ($missIndex as $i) {
                    $out[$i] = $texts[$i];
                }
                $failed = count($missTexts);
            } else {
                // Unique misses (preserve first-seen order) for live MT.
                $uniqueMiss = [];
                $uniqueSeen = [];
                foreach ($missTexts as $t) {
                    if (!isset($uniqueSeen[$t])) {
                        $uniqueSeen[$t] = true;
                        $uniqueMiss[] = $t;
                    }
                }

                $toFetch = $uniqueMiss;
                if ($cacheOnly && $fillMissCap > 0 && count($uniqueMiss) > $fillMissCap) {
                    $toFetch = array_slice($uniqueMiss, 0, $fillMissCap);
                    $partial = true;
                }

                $freshMap = [];
                if ($toFetch !== []) {
                    $fresh = match ($provider) {
                        'google' => $this->viaGoogle($toFetch, $source, $target),
                        'libretranslate' => $this->viaLibreTranslate($toFetch, $source, $target),
                        'deepl' => $this->viaDeepL($toFetch, $source, $target),
                        'mymemory' => $this->viaMyMemory($toFetch, $source, $target),
                        default => $this->viaGoogle($toFetch, $source, $target),
                    };
                    foreach ($toFetch as $j => $srcText) {
                        $translated = $fresh[$j] ?? null;
                        if ($translated === '__QUOTA__') {
                            $quotaHit = true;
                            continue;
                        }
                        if (!is_string($translated) || !self::isAcceptable($source, $target, $srcText, $translated)) {
                            continue;
                        }
                        $freshMap[$srcText] = $translated;
                        if ($this->cache) {
                            $this->cache->put($source, $target, $srcText, $translated, $provider);
                        }
                        $fetched++;
                    }
                }

                foreach ($missIndex as $i) {
                    $srcText = $texts[$i];
                    if (isset($freshMap[$srcText])) {
                        $out[$i] = $freshMap[$srcText];
                    } else {
                        $out[$i] = $srcText;
                        $failed++;
                    }
                }
                // Still missing after fill attempt в†’ FE should retry.
                if ($cacheOnly && $fillMissCap > 0) {
                    foreach ($uniqueMiss as $t) {
                        if (!isset($freshMap[$t])) {
                            $partial = true;
                            break;
                        }
                    }
                }
            }
        }

        ksort($out);
        return [
            'translations' => array_values($out),
            'cached' => count($texts) - count($missTexts),
            'fetched' => $fetched,
            'missing' => count($missTexts),
            'failed' => $failed,
            'partial' => $partial,
            'quota_hit' => $quotaHit,
            'provider' => $provider,
        ];
    }

    /**
     * True when $translated is a real translation worth caching.
     */
    public static function isAcceptable(string $source, string $target, string $from, string $to): bool
    {
        $from = trim($from);
        $to = trim($to);
        if ($to === '' || $from === '') {
            return false;
        }
        if ($source === $target) {
            return true;
        }
        // Exact echo of source for a different language is almost always a provider failure
        // when the source uses a different script (e.g. Cyrillic в†’ Spanish).
        if ($to === $from) {
            $latinTargets = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'tr', 'id', 'sv', 'da', 'fi', 'no'];
            if (in_array($target, $latinTargets, true) && preg_match('/\p{Cyrillic}/u', $from)) {
                return false;
            }
            // Cyrillic target but Latin source echoed вЂ” also reject.
            if (in_array($source, $latinTargets, true) && preg_match('/\p{Cyrillic}/u', $to) === 0
                && preg_match('/\p{Latin}/u', $from) && $target === 'ru') {
                // enв†’ru with identical Latin-only string (brand) can be OK
                return !preg_match('/\p{Cyrillic}/u', $from);
            }
            if (in_array($source, $latinTargets, true) && $target === 'ru' && preg_match('/\p{Latin}/u', $from)
                && !preg_match('/\p{Cyrillic}/u', $from) && $to === $from) {
                return true; // brand / MCP / PHP
            }
            if ($to === $from && preg_match('/\p{Cyrillic}/u', $from) && $target !== 'ru' && $target !== 'uk' && $target !== 'bg') {
                return false;
            }
        }
        return true;
    }

    /**
     * Free Google Translate (gtx client) вЂ” neural MT, no API key.
     * Unofficial endpoint; if blocked, falls back to public LibreTranslate then MyMemory.
     *
     * @param list<string> $texts
     * @return list<string|null>
     */
    private function viaGoogle(array $texts, string $source, string $target): array
    {
        $out = array_fill(0, count($texts), null);
        $quota = false;
        foreach ($texts as $i => $text) {
            if ($quota) {
                $out[$i] = '__QUOTA__';
                continue;
            }
            $chunks = $this->splitForProvider($text, 1800);
            $parts = [];
            $ok = true;
            foreach ($chunks as $chunk) {
                $piece = $this->googleOne($chunk, $source, $target);
                if ($piece === '__QUOTA__') {
                    $quota = true;
                    $ok = false;
                    break;
                }
                if ($piece === null) {
                    $ok = false;
                    break;
                }
                $parts[] = $piece;
                usleep(50_000);
            }
            if ($ok) {
                $out[$i] = trim(implode(' ', $parts));
                continue;
            }
            // Do NOT fall back to public LibreTranslate вЂ” quality is often unusable and
            // pollutes translate_cache. Short phrases may retry via MyMemory; else leave miss.
            if (mb_strlen($text) <= 400) {
                $fb = $this->viaMyMemory([$text], $source, $target);
                $cand = $fb[0] ?? null;
                if (is_string($cand) && $cand !== '__QUOTA__' && self::isAcceptable($source, $target, $text, $cand)) {
                    $out[$i] = $cand;
                } elseif ($cand === '__QUOTA__') {
                    $out[$i] = '__QUOTA__';
                }
            }
        }
        return $out;
    }

    /** @return string|null translated, "__QUOTA__" on rate limit */
    private function googleOne(string $text, string $source, string $target): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }
        $sl = $source !== '' ? $source : 'auto';
        $url = 'https://translate.googleapis.com/translate_a/single?'
            . http_build_query([
                'client' => 'gtx',
                'sl' => $sl,
                'tl' => $target,
                'dt' => 't',
                'dj' => '1',
                'q' => $text,
            ], '', '&', PHP_QUERY_RFC3986);

        for ($attempt = 0; $attempt < 2; $attempt++) {
            if ($attempt > 0) {
                usleep(400_000);
            }
            $ch = curl_init($url);
            if ($ch === false) {
                return null;
            }
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => self::TIMEOUT,
                CURLOPT_CONNECTTIMEOUT => 6,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; JaseflyCMS-Translate/1.3)',
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
            ]);
            $raw = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($code === 429 || $code === 503) {
                if ($attempt === 0) {
                    continue;
                }
                return '__QUOTA__';
            }
            if (!is_string($raw) || $raw === '' || $code >= 400) {
                continue;
            }
            $decoded = json_decode($raw, true);
            $joined = '';
            if (is_array($decoded) && isset($decoded['sentences']) && is_array($decoded['sentences'])) {
                foreach ($decoded['sentences'] as $s) {
                    if (is_array($s) && isset($s['trans']) && is_string($s['trans'])) {
                        $joined .= $s['trans'];
                    }
                }
            } elseif (is_array($decoded) && isset($decoded[0]) && is_array($decoded[0])) {
                // Legacy nested array format
                foreach ($decoded[0] as $row) {
                    if (is_array($row) && isset($row[0]) && is_string($row[0])) {
                        $joined .= $row[0];
                    }
                }
            }
            $joined = trim($joined);
            if ($joined !== '' && self::isAcceptable($source, $target, $text, $joined)) {
                return $joined;
            }
        }
        return null;
    }

    /**
     * @param list<string> $texts
     * @return list<string|null>
     */
    private function viaLibreTranslate(array $texts, string $source, string $target): array
    {
        $configured = rtrim(trim((string) ($this->settings['api_url'] ?? '')), '/');
        $bases = $configured !== ''
            ? [$configured]
            : [
                'https://libretranslate.com',
                'https://translate.argosopentech.com',
                'https://lt.vern.cc',
            ];

        $apiKey = trim((string) ($this->settings['api_key'] ?? ''));
        $out = array_fill(0, count($texts), null);
        foreach ($texts as $i => $text) {
            $chunks = $this->splitForProvider($text, 450);
            $parts = [];
            $ok = true;
            foreach ($chunks as $chunk) {
                $piece = null;
                foreach ($bases as $base) {
                    $onePayload = [
                        'q' => $chunk,
                        'source' => $source,
                        'target' => $target,
                        'format' => 'text',
                    ];
                    if ($apiKey !== '') {
                        $onePayload['api_key'] = $apiKey;
                    }
                    $one = $this->httpJson('POST', $base . '/translate', $onePayload);
                    $cand = is_array($one) && isset($one['translatedText']) && is_string($one['translatedText'])
                        ? $one['translatedText']
                        : null;
                    if ($cand !== null && self::isAcceptable($source, $target, $chunk, $cand)) {
                        $piece = $cand;
                        break;
                    }
                }
                if ($piece === null) {
                    $ok = false;
                    break;
                }
                $parts[] = $piece;
            }
            $out[$i] = $ok ? implode(' ', $parts) : null;
            usleep(40_000);
        }

        // If libre fully failed and nothing configured, last resort MyMemory
        $anyOk = false;
        foreach ($out as $v) {
            if (is_string($v) && $v !== '' && $v !== '__QUOTA__') {
                $anyOk = true;
                break;
            }
        }
        if ($configured === '' && !$anyOk) {
            return $this->viaMyMemory($texts, $source, $target);
        }

        return $out;
    }

    /**
     * DeepL API (Free or Pro). Requires deepl_api_key in plugin settings.
     *
     * @param list<string> $texts
     * @return list<string|null>
     */
    private function viaDeepL(array $texts, string $source, string $target): array
    {
        $key = trim((string) ($this->settings['deepl_api_key'] ?? ''));
        if ($key === '') {
            return array_fill(0, count($texts), null);
        }

        $plan = strtolower(trim((string) ($this->settings['deepl_plan'] ?? 'free')));
        $custom = rtrim(trim((string) ($this->settings['deepl_api_url'] ?? '')), '/');
        if ($custom !== '') {
            $url = str_ends_with($custom, '/translate') ? $custom : ($custom . '/translate');
        } else {
            $url = $plan === 'pro'
                ? 'https://api.deepl.com/v2/translate'
                : 'https://api-free.deepl.com/v2/translate';
        }

        $src = $this->deeplLang($source, false);
        $tgt = $this->deeplLang($target, true);
        if ($tgt === '') {
            return array_fill(0, count($texts), null);
        }

        $n = count($texts);
        $out = array_fill(0, $n, null);
        $batchSize = 40;

        for ($i = 0; $i < $n; $i += $batchSize) {
            $slice = array_slice($texts, $i, $batchSize);
            $payload = [
                'text' => $slice,
                'target_lang' => $tgt,
            ];
            if ($src !== '') {
                $payload['source_lang'] = $src;
            }

            $res = $this->httpDeepL($url, $key, $payload);
            if ($res === '__QUOTA__') {
                for ($j = $i; $j < $n; $j++) {
                    $out[$j] = '__QUOTA__';
                }
                break;
            }
            if (!is_array($res) || !isset($res['translations']) || !is_array($res['translations'])) {
                continue;
            }
            foreach ($res['translations'] as $j => $row) {
                $text = is_array($row) && isset($row['text']) && is_string($row['text'])
                    ? $row['text']
                    : null;
                if ($text !== null && isset($slice[$j])
                    && self::isAcceptable($source, $target, $slice[$j], $text)) {
                    $out[$i + (int) $j] = $text;
                }
            }
            usleep(30_000);
        }

        return $out;
    }

    /** Map CMS lang codes to DeepL (uppercase; EN target в†’ EN-GB). */
    private function deeplLang(string $code, bool $asTarget): string
    {
        $code = strtolower(trim($code));
        if ($code === '') {
            return '';
        }
        $map = [
            'en' => $asTarget ? 'EN-GB' : 'EN',
            'pt' => $asTarget ? 'PT-PT' : 'PT',
            'zh' => 'ZH',
            'nb' => 'NB',
            'nn' => 'NB',
        ];
        if (isset($map[$code])) {
            return $map[$code];
        }
        if (preg_match('/^[a-z]{2}$/', $code)) {
            return strtoupper($code);
        }
        if (preg_match('/^([a-z]{2})-([a-z]{2})$/', $code, $m)) {
            return strtoupper($m[1]) . '-' . strtoupper($m[2]);
        }
        return strtoupper($code);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|string|null
     */
    private function httpDeepL(string $url, string $authKey, array $payload): array|string|null
    {
        if (!function_exists('curl_init')) {
            return null;
        }
        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT => 'JaseflyCMS-Translate/1.2',
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'Authorization: DeepL-Auth-Key ' . $authKey,
            ],
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code === 456 || $code === 429) {
            return '__QUOTA__';
        }
        if (!is_string($raw) || $raw === '' || $code >= 400) {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param list<string> $texts
     * @return list<string|null> null = failed; string "__QUOTA__" = daily limit
     */
    private function viaMyMemory(array $texts, string $source, string $target): array
    {
        $pair = $source . '|' . $target;
        $email = trim((string) ($this->settings['mymemory_email'] ?? ''));
        $out = [];
        $quota = false;
        foreach ($texts as $text) {
            if ($quota) {
                $out[] = '__QUOTA__';
                continue;
            }
            $chunks = $this->splitForProvider($text, 450);
            $parts = [];
            $ok = true;
            foreach ($chunks as $chunk) {
                $piece = $this->myMemoryOne($chunk, $pair, $email, $source, $target);
                if ($piece === '__QUOTA__') {
                    $quota = true;
                    $ok = false;
                    break;
                }
                if ($piece === null) {
                    $ok = false;
                    break;
                }
                $parts[] = $piece;
                usleep(120_000);
            }
            $out[] = $ok ? trim(implode(' ', $parts)) : ($quota ? '__QUOTA__' : null);
        }
        return $out;
    }

    /** @return string|null translated text, null on fail, "__QUOTA__" on daily limit */
    private function myMemoryOne(string $text, string $pair, string $email, string $source, string $target): ?string
    {
        for ($attempt = 0; $attempt < 3; $attempt++) {
            if ($attempt > 0) {
                usleep(400_000 * $attempt);
            }
            $url = 'https://api.mymemory.translated.net/get?q=' . rawurlencode($text)
                . '&langpair=' . rawurlencode($pair);
            if ($email !== '') {
                $url .= '&de=' . rawurlencode($email);
            }
            $res = $this->httpJson('GET', $url, null);
            if (!is_array($res)) {
                continue;
            }
            $status = (int) ($res['responseStatus'] ?? 0);
            if ($status === 429 || $status === 403) {
                usleep(800_000);
                continue;
            }
            $translated = $res['responseData']['translatedText'] ?? null;
            if (!is_string($translated) || $translated === '') {
                continue;
            }
            $decoded = html_entity_decode($translated, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if (preg_match('/^(INVALID|PLEASE SELECT|MYMEMORY WARNING|NO QUERY|QUERY LENGTH)/i', $decoded)) {
                if (preg_match('/QUOTA|NO MORE TRANSLATIONS/i', $decoded) || !empty($res['quotaFinished'])) {
                    return '__QUOTA__';
                }
                continue;
            }
            if (!empty($res['quotaFinished'])) {
                return '__QUOTA__';
            }
            if (!self::isAcceptable($source, $target, $text, $decoded)) {
                continue;
            }
            return $decoded;
        }
        return null;
    }

    /**
     * Split long strings so free MyMemory (в‰€500 chars) can handle them.
     *
     * @return list<string>
     */
    private function splitForProvider(string $text, int $max): array
    {
        $text = trim($text);
        if ($text === '') {
            return [];
        }
        if (mb_strlen($text) <= $max) {
            return [$text];
        }
        $parts = preg_split('/(?<=[\.\!\?;вЂ¦])\s+/u', $text) ?: [$text];
        $out = [];
        $buf = '';
        foreach ($parts as $p) {
            $p = trim($p);
            if ($p === '') {
                continue;
            }
            if (mb_strlen($p) > $max) {
                if ($buf !== '') {
                    $out[] = $buf;
                    $buf = '';
                }
                // Hard-split oversized segment
                $len = mb_strlen($p);
                for ($i = 0; $i < $len; $i += $max) {
                    $out[] = mb_substr($p, $i, $max);
                }
                continue;
            }
            $next = $buf === '' ? $p : ($buf . ' ' . $p);
            if (mb_strlen($next) > $max) {
                $out[] = $buf;
                $buf = $p;
            } else {
                $buf = $next;
            }
        }
        if ($buf !== '') {
            $out[] = $buf;
        }
        return $out ?: [$text];
    }

    /**
     * @param array<string, mixed>|null $jsonBody
     * @return array<string, mixed>|null
     */
    private function httpJson(string $method, string $url, ?array $jsonBody): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }
        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        $headers = ['Accept: application/json'];
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT => 'JaseflyCMS-Translate/1.1',
        ];
        if (strtoupper($method) === 'POST') {
            $body = json_encode($jsonBody ?? [], JSON_UNESCAPED_UNICODE);
            $headers[] = 'Content-Type: application/json';
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = $body;
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($raw) || $raw === '' || $code >= 400) {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}
