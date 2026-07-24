<?php
declare(strict_types=1);

namespace App\Modules\Translate;

use App\Database;

/** Persistent string translations for cache-first overlay + warmup. */
final class TranslateCache
{
    public function __construct(private Database $db) {}

    public function ensureTable(): void
    {
        try {
            $this->db->run(
                'CREATE TABLE IF NOT EXISTS translate_cache (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                  source_lang VARCHAR(8) NOT NULL,
                  target_lang VARCHAR(8) NOT NULL,
                  source_hash CHAR(64) NOT NULL,
                  source_text TEXT NOT NULL,
                  translated_text TEXT NOT NULL,
                  provider VARCHAR(40) NULL,
                  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (id),
                  UNIQUE KEY uq_translate_cache (source_lang, target_lang, source_hash),
                  KEY idx_translate_target (target_lang)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
        } catch (\Throwable) {
            // Runner / dialect may already create via migration
        }
    }

    public static function hash(string $text): string
    {
        return hash('sha256', $text);
    }

    /**
     * @param list<string> $texts
     * @return array<string, string> hash => translated (skips invalid echoes)
     */
    public function getMany(string $source, string $target, array $texts): array
    {
        if ($texts === []) {
            return [];
        }
        $hashes = [];
        foreach ($texts as $t) {
            $hashes[self::hash($t)] = true;
        }
        $hashList = array_keys($hashes);
        $out = [];
        foreach (array_chunk($hashList, 200) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '?'));
            $params = array_merge([$source, $target], $chunk);
            try {
                $rows = $this->db->all(
                    "SELECT source_hash, source_text, translated_text FROM translate_cache
                     WHERE source_lang=? AND target_lang=? AND source_hash IN ($placeholders)",
                    $params
                );
            } catch (\Throwable) {
                continue;
            }
            foreach ($rows as $row) {
                $src = (string) ($row['source_text'] ?? '');
                $tr = (string) ($row['translated_text'] ?? '');
                if (!TranslateService::isAcceptable($source, $target, $src, $tr)) {
                    continue;
                }
                $out[(string) $row['source_hash']] = $tr;
            }
        }
        return $out;
    }

    public function put(string $source, string $target, string $sourceText, string $translated, ?string $provider): void
    {
        if (!TranslateService::isAcceptable($source, $target, $sourceText, $translated)) {
            return;
        }
        $hash = self::hash($sourceText);
        try {
            $this->db->upsert(
                'translate_cache',
                [
                    'source_lang' => $source,
                    'target_lang' => $target,
                    'source_hash' => $hash,
                    'source_text' => mb_substr($sourceText, 0, 65000),
                    'translated_text' => mb_substr($translated, 0, 65000),
                    'provider' => $provider,
                ],
                ['source_lang', 'target_lang', 'source_hash'],
                ['translated_text', 'provider', 'source_text']
            );
        } catch (\Throwable) {
            // ignore cache write failures
        }
    }

    public function deleteHash(string $source, string $target, string $hash): void
    {
        try {
            $this->db->run(
                'DELETE FROM translate_cache WHERE source_lang=? AND target_lang=? AND source_hash=?',
                [$source, $target, $hash]
            );
        } catch (\Throwable) {
        }
    }

    /**
     * Remove rows where translation equals source (failed MT that was wrongly cached).
     *
     * @return int deleted rows
     */
    public function purgeInvalid(): int
    {
        try {
            // Exact echo across languages — always bogus for our use-case.
            $this->db->run(
                'DELETE FROM translate_cache WHERE source_lang <> target_lang AND source_text = translated_text'
            );
            // Also drop Cyrillic "translations" into Latin target langs (script check in PHP for portability).
            $rows = $this->db->all(
                'SELECT id, source_lang, target_lang, source_text, translated_text FROM translate_cache
                 WHERE source_lang <> target_lang LIMIT 5000'
            );
            $ids = [];
            foreach ($rows as $row) {
                if (!TranslateService::isAcceptable(
                    (string) $row['source_lang'],
                    (string) $row['target_lang'],
                    (string) $row['source_text'],
                    (string) $row['translated_text']
                )) {
                    $ids[] = (int) $row['id'];
                }
            }
            foreach (array_chunk($ids, 200) as $chunk) {
                if ($chunk === []) {
                    continue;
                }
                $ph = implode(',', array_fill(0, count($chunk), '?'));
                $this->db->run("DELETE FROM translate_cache WHERE id IN ($ph)", $chunk);
            }
            return count($ids);
        } catch (\Throwable) {
            return 0;
        }
    }

    /** @return array{rows: int, by_target: array<string, int>} */
    public function stats(): array
    {
        try {
            $total = (int) ($this->db->one('SELECT COUNT(*) c FROM translate_cache')['c'] ?? 0);
            $rows = $this->db->all(
                'SELECT target_lang, COUNT(*) c FROM translate_cache GROUP BY target_lang ORDER BY target_lang'
            );
            $by = [];
            foreach ($rows as $r) {
                $by[(string) $r['target_lang']] = (int) $r['c'];
            }
            return ['rows' => $total, 'by_target' => $by];
        } catch (\Throwable) {
            return ['rows' => 0, 'by_target' => []];
        }
    }

    /**
     * How many of $texts are missing for this pair.
     *
     * @param list<string> $texts
     */
    public function missingCount(string $source, string $target, array $texts): int
    {
        if ($texts === []) {
            return 0;
        }
        $cached = $this->getMany($source, $target, $texts);
        $miss = 0;
        foreach ($texts as $t) {
            if (!isset($cached[self::hash($t)])) {
                $miss++;
            }
        }
        return $miss;
    }
}
