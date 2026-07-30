<?php
declare(strict_types=1);

namespace App\Modules\Translate;

use App\Database;

/**
 * Sync newly saved CMS strings into translate_cache for all target languages.
 */
final class TranslateSync
{
    /** Tables that carry human-readable site content. */
    public const CONTENT_TABLES = [
        'pages',
        'blog_posts',
        'projects',
        'services',
        'testimonials',
        'navigation_items',
        'products',
        'hero_settings',
        'footer_settings',
        'contact_info',
        'site_settings',
        'seo_settings',
    ];

    public function __construct(
        private Database $db,
        private array $settings,
    ) {}

    /**
     * Extract strings from a saved resource payload and translate missing ones.
     *
     * @param array<string, mixed> $data
     * @return array{texts: int, fetched: int, failed: int, targets: list<string>}
     */
    public function syncPayload(array $data, int $maxTexts = 40): array
    {
        $bag = [];
        $this->walk($bag, $data, $maxTexts);
        $texts = array_keys($bag);
        if ($texts === []) {
            return ['texts' => 0, 'fetched' => 0, 'failed' => 0, 'targets' => []];
        }

        $source = (string) ($this->settings['source_lang'] ?? 'ru');
        $targets = $this->targets();
        $svc = new TranslateService($this->settings, $this->db);
        $fetched = 0;
        $failed = 0;
        foreach ($targets as $target) {
            $result = $svc->translateBatch($texts, $source, $target, false);
            $fetched += (int) ($result['fetched'] ?? 0);
            $failed += (int) ($result['failed'] ?? 0);
        }
        return [
            'texts' => count($texts),
            'fetched' => $fetched,
            'failed' => $failed,
            'targets' => $targets,
        ];
    }

    /**
     * @return list<string>
     */
    private function targets(): array
    {
        $raw = (string) ($this->settings['languages'] ?? 'en,de,fr,es');
        $parts = preg_split('/[\s,;]+/', strtolower($raw)) ?: [];
        $out = [];
        $source = (string) ($this->settings['source_lang'] ?? 'ru');
        foreach ($parts as $p) {
            $p = preg_replace('/[^a-z\-]/', '', $p) ?? '';
            if ($p !== '' && $p !== $source && strlen($p) <= 8 && !in_array($p, $out, true)) {
                $out[] = $p;
            }
        }
        return $out ?: ['en'];
    }

    /**
     * @param array<string, true> $bag
     * @param mixed $node
     */
    private function walk(array &$bag, mixed $node, int $max): void
    {
        if (count($bag) >= $max) {
            return;
        }
        if (is_string($node)) {
            // Keep HTML split rules identical to TranslateCorpus::ingest.
            $raw = $node;
            if (str_contains($raw, '<')) {
                $raw = preg_replace('/<br\s*\/?>/iu', "\n", $raw) ?? $raw;
                $raw = preg_replace('/<\/(p|li|div|h[1-6]|tr|td|th|blockquote|section|article|figcaption)>/iu', "\n", $raw) ?? $raw;
                $raw = preg_replace('/<(p|li|div|h[1-6]|tr|td|th|blockquote|section|article)\b[^>]*>/iu', "\n", $raw) ?? $raw;
            }
            $text = html_entity_decode(strip_tags($raw), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            foreach (preg_split('/[\r\n]+/u', $text) ?: [$text] as $part) {
                $t = trim(preg_replace('/\s+/u', ' ', $part) ?? '');
                if ($t === '' || mb_strlen($t) < 2 || mb_strlen($t) > 2000) {
                    continue;
                }
                if (preg_match('#^(https?://|mailto:|/)#i', $t)) {
                    continue;
                }
                if (!preg_match('/\p{L}/u', $t)) {
                    continue;
                }
                $bag[$t] = true;
                if (count($bag) >= $max) {
                    return;
                }
            }
            return;
        }
        if (!is_array($node)) {
            return;
        }
        foreach ($node as $k => $v) {
            if (is_string($k) && preg_match('/^(id|elType|widgetType|width|gap|padding|margin|color|href|url|src|className|type|slug|status|template)$/i', $k)) {
                if (is_string($v) && in_array(strtolower($k), ['href', 'url', 'src', 'id', 'elType', 'widgetType', 'className', 'type', 'slug', 'status', 'template'], true)) {
                    continue;
                }
            }
            $this->walk($bag, $v, $max);
            if (count($bag) >= $max) {
                return;
            }
        }
    }
}
