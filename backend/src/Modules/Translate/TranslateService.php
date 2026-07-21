<?php
declare(strict_types=1);

namespace App\Modules\Translate;

use App\Database;

/**
 * Machine translation with DB cache (warmup + live overlay).
 */
final class TranslateService
{
    private const TIMEOUT = 12;

    private ?TranslateCache $cache;

    /** @param array<string, mixed> $settings */
    public function __construct(
        private array $settings,
        private ?Database $db = null,
    ) {
        $this->cache = $db ? new TranslateCache($db) : null;
        if ($this->cache) {
            $this->cache->ensureTable();
        }
    }

    /**
     * @param list<string> $texts
     * @return array{translations: list<string>, cached: int, fetched: int, provider: string}
     */
    public function translateBatch(array $texts, string $source, string $target): array
    {
        $source = strtolower(trim($source));
        $target = strtolower(trim($target));
        $provider = (string) ($this->settings['provider'] ?? 'mymemory');

        if ($source === '' || $target === '' || $source === $target || $texts === []) {
            return [
                'translations' => $texts,
                'cached' => count($texts),
                'fetched' => 0,
                'provider' => $provider,
            ];
        }

        $cachedMap = $this->cache ? $this->cache->getMany($source, $target, $texts) : [];
        $out = [];
        $missIndex = [];
        $missTexts = [];

        foreach ($texts as $i => $text) {
            $hash = TranslateCache::hash($text);
            if (isset($cachedMap[$hash])) {
                $out[$i] = $cachedMap[$hash];
            } else {
                $missIndex[] = $i;
                $missTexts[] = $text;
            }
        }

        $fetched = 0;
        if ($missTexts !== []) {
            $fresh = $provider === 'libretranslate'
                ? $this->viaLibreTranslate($missTexts, $source, $target)
                : $this->viaMyMemory($missTexts, $source, $target);
            foreach ($missIndex as $j => $i) {
                $translated = $fresh[$j] ?? $texts[$i];
                $out[$i] = $translated;
                if ($this->cache && is_string($translated) && $translated !== '') {
                    $this->cache->put($source, $target, $texts[$i], $translated, $provider);
                }
                $fetched++;
            }
        }

        ksort($out);
        return [
            'translations' => array_values($out),
            'cached' => count($texts) - $fetched,
            'fetched' => $fetched,
            'provider' => $provider,
        ];
    }

    /**
     * @param list<string> $texts
     * @return list<string>
     */
    private function viaLibreTranslate(array $texts, string $source, string $target): array
    {
        $base = rtrim((string) ($this->settings['api_url'] ?? ''), '/');
        if ($base === '') {
            return $this->viaMyMemory($texts, $source, $target);
        }

        $apiKey = trim((string) ($this->settings['api_key'] ?? ''));
        $out = $texts;
        $chunks = array_chunk($texts, 12, true);
        foreach ($chunks as $chunk) {
            $payload = [
                'q' => array_values($chunk),
                'source' => $source,
                'target' => $target,
                'format' => 'text',
            ];
            if ($apiKey !== '') {
                $payload['api_key'] = $apiKey;
            }
            $res = $this->httpJson('POST', $base . '/translate', $payload);
            if (!is_array($res)) {
                foreach ($chunk as $k => $text) {
                    $onePayload = [
                        'q' => $text,
                        'source' => $source,
                        'target' => $target,
                        'format' => 'text',
                    ];
                    if ($apiKey !== '') {
                        $onePayload['api_key'] = $apiKey;
                    }
                    $one = $this->httpJson('POST', $base . '/translate', $onePayload);
                    if (is_array($one) && isset($one['translatedText']) && is_string($one['translatedText'])) {
                        $out[$k] = $one['translatedText'];
                    }
                }
                continue;
            }
            $translated = $res['translatedText'] ?? null;
            if (is_string($translated) && count($chunk) === 1) {
                $keys = array_keys($chunk);
                $out[$keys[0]] = $translated;
            } elseif (is_array($translated) && count($translated) === count($chunk)) {
                $i = 0;
                foreach (array_keys($chunk) as $k) {
                    $out[$k] = (string) ($translated[$i] ?? $texts[$k]);
                    $i++;
                }
            }
        }
        return array_values($out);
    }

    /**
     * @param list<string> $texts
     * @return list<string>
     */
    private function viaMyMemory(array $texts, string $source, string $target): array
    {
        $pair = $source . '|' . $target;
        $email = trim((string) ($this->settings['mymemory_email'] ?? ''));
        $out = [];
        foreach ($texts as $text) {
            if (mb_strlen($text) > 450) {
                $out[] = $text;
                continue;
            }
            $url = 'https://api.mymemory.translated.net/get?q=' . rawurlencode($text)
                . '&langpair=' . rawurlencode($pair);
            if ($email !== '') {
                $url .= '&de=' . rawurlencode($email);
            }
            $res = $this->httpJson('GET', $url, null);
            $translated = null;
            if (is_array($res)) {
                $translated = $res['responseData']['translatedText'] ?? null;
            }
            $out[] = is_string($translated) && $translated !== ''
                ? html_entity_decode($translated, ENT_QUOTES | ENT_HTML5, 'UTF-8')
                : $text;
            usleep(25_000);
        }
        return $out;
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
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT => 'JaseflyCMS-Translate/1.0',
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
