<?php
declare(strict_types=1);

namespace App\PackageModules\AiContentOptimizer;

/**
 * OpenRouter chat completions with key/model failover and optional HTTP proxy.
 */
final class OpenRouterClient
{
    private const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
    private const ALLOWED_HOST = 'openrouter.ai';

    /**
     * @param list<string> $apiKeys
     * @param list<string> $models
     * @param array{host?: string, port?: int, user?: string, pass?: string} $proxy
     * @param array{temperature?: float, max_tokens?: int, web_search?: bool, timeout?: int} $opts
     * @return array{ok: bool, content?: string, model?: string, key_index?: int, error?: string}
     */
    public function chat(
        array $apiKeys,
        array $models,
        string $system,
        string $user,
        array $proxy = [],
        array $opts = [],
    ): array {
        $apiKeys = array_values(array_filter(array_map('trim', $apiKeys)));
        $models = array_values(array_filter(array_map('trim', $models)));
        if ($apiKeys === []) {
            return ['ok' => false, 'error' => 'Не заданы OpenRouter API-ключи'];
        }
        if ($models === []) {
            return ['ok' => false, 'error' => 'Не задан список моделей'];
        }

        $lastError = 'unknown';
        foreach ($apiKeys as $ki => $key) {
            foreach ($models as $model) {
                $res = $this->requestOnce($key, $model, $system, $user, $proxy, $opts);
                if ($res['ok']) {
                    return [
                        'ok' => true,
                        'content' => $res['content'],
                        'model' => $model,
                        'key_index' => $ki,
                    ];
                }
                $lastError = (string) ($res['error'] ?? 'error');
                if ($this->isFatalAuth($lastError)) {
                    break;
                }
            }
        }
        return ['ok' => false, 'error' => $lastError];
    }

    /**
     * @param array{host?: string, port?: int, user?: string, pass?: string} $proxy
     * @param array{temperature?: float, max_tokens?: int, web_search?: bool, timeout?: int} $opts
     * @return array{ok: bool, content?: string, error?: string}
     */
    private function requestOnce(
        string $apiKey,
        string $model,
        string $system,
        string $user,
        array $proxy,
        array $opts,
    ): array {
        $host = parse_url(self::ENDPOINT, PHP_URL_HOST);
        if ($host !== self::ALLOWED_HOST || !function_exists('curl_init')) {
            return ['ok' => false, 'error' => 'OpenRouter недоступен (host/curl)'];
        }

        $temperature = isset($opts['temperature']) ? (float) $opts['temperature'] : 0.4;
        $maxTokens = isset($opts['max_tokens']) ? (int) $opts['max_tokens'] : 6000;
        $timeout = isset($opts['timeout']) ? (int) $opts['timeout'] : 120;
        $payloadArr = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $user],
            ],
            'temperature' => max(0, min(2, $temperature)),
            'max_tokens' => max(256, min(32000, $maxTokens)),
            'response_format' => ['type' => 'json_object'],
        ];
        if (!empty($opts['web_search'])) {
            $payloadArr['plugins'] = [['id' => 'web']];
        }
        $payload = json_encode($payloadArr, JSON_UNESCAPED_UNICODE);

        $ch = curl_init(self::ENDPOINT);
        if ($ch === false) {
            return ['ok' => false, 'error' => 'curl_init failed'];
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
                'HTTP-Referer: https://jasefly.com',
                'X-Title: Jasefly AI Content Optimizer',
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => max(15, $timeout),
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $proxyHost = trim((string) ($proxy['host'] ?? ''));
        if ($proxyHost !== '') {
            $port = (int) ($proxy['port'] ?? 0);
            curl_setopt($ch, CURLOPT_PROXY, $proxyHost . ($port > 0 ? ':' . $port : ''));
            $pu = (string) ($proxy['user'] ?? '');
            $pp = (string) ($proxy['pass'] ?? '');
            if ($pu !== '') {
                curl_setopt($ch, CURLOPT_PROXYUSERPWD, $pu . ':' . $pp);
            }
        }

        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $err = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body === false || $errno) {
            return ['ok' => false, 'error' => 'curl: ' . ($err !== '' ? $err : (string) $errno)];
        }
        $json = json_decode((string) $body, true);
        if ($status >= 400) {
            $msg = is_array($json)
                ? (string) ($json['error']['message'] ?? $json['error'] ?? $body)
                : (string) $body;
            return ['ok' => false, 'error' => "HTTP {$status}: " . mb_substr($msg, 0, 400)];
        }
        $text = $json['choices'][0]['message']['content'] ?? null;
        if (!is_string($text) || trim($text) === '') {
            return ['ok' => false, 'error' => 'Пустой ответ модели'];
        }
        return ['ok' => true, 'content' => $text];
    }

    private function isFatalAuth(string $error): bool
    {
        return (bool) preg_match('/\b(401|403|invalid.?api.?key|unauthorized)\b/i', $error);
    }
}
