<?php
declare(strict_types=1);

namespace App\Modules\Support;

use App\Database;

/**
 * Simple FAQ matcher by keywords / tokenization.
 */
final class SupportBot
{
    public function __construct(
        private Database $db,
        private string $fallbackMessage = '',
    ) {}

    /**
     * @return array{matched: bool, answer: string, faq_id: ?int}
     */
    public function reply(string $visitorMessage): array
    {
        $fallback = trim($this->fallbackMessage) !== ''
            ? $this->fallbackMessage
            : 'Сейчас нет операторов онлайн. Оставьте email или соцсеть — ответим, как только сможем. Или переформулируйте вопрос.';

        $tokens = $this->tokenize($visitorMessage);
        if ($tokens === []) {
            return ['matched' => false, 'answer' => $fallback, 'faq_id' => null];
        }

        try {
            $rows = $this->db->all(
                'SELECT id, question, answer, keywords FROM support_faq WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
            );
        } catch (\Throwable) {
            return ['matched' => false, 'answer' => $fallback, 'faq_id' => null];
        }

        $bestId = null;
        $bestAnswer = null;
        $bestScore = 0;

        foreach ($rows as $row) {
            $hay = mb_strtolower(
                (string) ($row['question'] ?? '') . ' ' . (string) ($row['keywords'] ?? '') . ' ' . (string) ($row['answer'] ?? '')
            );
            $score = 0;
            foreach ($tokens as $t) {
                if (mb_strlen($t) < 3) {
                    continue;
                }
                if (mb_strpos($hay, $t) !== false) {
                    $score += mb_strlen($t) >= 5 ? 2 : 1;
                }
            }
            // Extra weight for keyword list hits
            $kw = $this->tokenize((string) ($row['keywords'] ?? ''));
            foreach ($kw as $k) {
                if (in_array($k, $tokens, true)) {
                    $score += 3;
                }
            }
            if ($score > $bestScore) {
                $bestScore = $score;
                $bestId = (int) $row['id'];
                $bestAnswer = (string) $row['answer'];
            }
        }

        if ($bestScore >= 2 && $bestAnswer !== null && $bestAnswer !== '') {
            return ['matched' => true, 'answer' => $bestAnswer, 'faq_id' => $bestId];
        }

        return ['matched' => false, 'answer' => $fallback, 'faq_id' => null];
    }

    /**
     * @return list<string>
     */
    private function tokenize(string $text): array
    {
        $text = mb_strtolower(trim($text));
        if ($text === '') {
            return [];
        }
        $parts = preg_split('/[^\p{L}\p{N}]+/u', $text) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = trim($p);
            if ($p !== '' && mb_strlen($p) >= 2) {
                $out[] = $p;
            }
        }
        return array_values(array_unique($out));
    }
}
