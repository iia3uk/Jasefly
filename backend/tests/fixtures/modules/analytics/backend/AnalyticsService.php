<?php
declare(strict_types=1);

namespace App\PackageModules\Analytics;

use App\Platform\Contracts\PlatformDatabaseInterface;

final class AnalyticsService
{
    public const EVENTS = [
        'page_view', 'form_view', 'form_submit', 'form_success', 'checkout_started',
        'order_created', 'payment_completed', 'comment_created', 'newsletter_subscribed', 'custom_event',
    ];

    public function __construct(
        private PlatformDatabaseInterface $db,
        private string $salt,
    ) {}

    /**
     * @param array<string,mixed> $input
     * @return array{id:int,accepted:bool}
     */
    public function ingest(array $input, ?string $ip, ?string $userAgent): array
    {
        $event = strtolower(trim((string) ($input['event'] ?? $input['event_name'] ?? '')));
        if (!in_array($event, self::EVENTS, true)) {
            throw new \InvalidArgumentException('Unsupported analytics event');
        }
        $visitorToken = trim((string) ($input['visitor_id'] ?? ''));
        $sessionToken = trim((string) ($input['session_id'] ?? ''));
        $fingerprint = $visitorToken !== '' ? $visitorToken : (($ip ?? '') . '|' . ($userAgent ?? ''));
        $visitorHash = hash_hmac('sha256', $fingerprint, $this->salt);
        $sessionHash = hash_hmac('sha256', $sessionToken !== '' ? $sessionToken : ($fingerprint . '|' . date('Y-m-d-H')), $this->salt);
        $path = mb_substr((string) ($input['path'] ?? ''), 0, 1024);
        $referrerHost = null;
        if (!empty($input['referrer'])) {
            $referrerHost = parse_url((string) $input['referrer'], PHP_URL_HOST) ?: null;
        }
        $uaHash = $userAgent ? hash_hmac('sha256', $userAgent, $this->salt) : null;

        $this->db->run(
            'INSERT INTO analytics_sessions (session_hash,visitor_hash,landing_path,referrer_host,user_agent_hash,events_count)
             VALUES (?,?,?,?,?,1)
             ON DUPLICATE KEY UPDATE last_seen_at=NOW(),events_count=events_count+1',
            [$sessionHash, $visitorHash, $path ?: null, $referrerHost, $uaHash]
        );
        $session = $this->db->one('SELECT id FROM analytics_sessions WHERE session_hash=?', [$sessionHash]);
        $metadata = $input['metadata'] ?? new \stdClass();
        $encoded = json_encode($metadata, JSON_UNESCAPED_UNICODE);
        if ($encoded === false || strlen($encoded) > 16000) {
            throw new \InvalidArgumentException('Analytics metadata is too large');
        }
        $this->db->run(
            'INSERT INTO analytics_events (event_name,session_id,visitor_hash,path,target_type,target_id,value,currency,metadata)
             VALUES (?,?,?,?,?,?,?,?,?)',
            [$event, $session['id'] ?? null, $visitorHash, $path ?: null,
                mb_substr((string) ($input['target_type'] ?? ''), 0, 64) ?: null,
                mb_substr((string) ($input['target_id'] ?? ''), 0, 128) ?: null,
                isset($input['value']) ? round((float) $input['value'], 2) : null,
                isset($input['currency']) ? strtoupper(substr((string) $input['currency'], 0, 8)) : null,
                $encoded]
        );
        $eventId = $this->db->lastInsertId();
        $this->recordGoals($eventId, $event, (int) ($session['id'] ?? 0), $visitorHash, $path, $input);
        return ['id' => $eventId, 'accepted' => true];
    }

    public function aggregateDaily(?string $from = null, ?string $to = null): int
    {
        $from = $this->date($from ?? date('Y-m-d'));
        $to = $this->date($to ?? $from);
        $this->db->run('DELETE FROM analytics_daily_stats WHERE stat_date BETWEEN ? AND ?', [$from, $to]);
        $this->db->run(
            "INSERT INTO analytics_daily_stats (stat_date,event_name,path,events_count,unique_visitors,value_total)
             SELECT DATE(created_at),event_name,LEFT(COALESCE(path,''),512),COUNT(*),COUNT(DISTINCT visitor_hash),COALESCE(SUM(value),0)
             FROM analytics_events WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)
             GROUP BY DATE(created_at),event_name,LEFT(COALESCE(path,''),512)",
            [$from, $to]
        );
        $row = $this->db->one(
            'SELECT COUNT(*) AS c FROM analytics_daily_stats WHERE stat_date BETWEEN ? AND ?',
            [$from, $to]
        );
        return (int) ($row['c'] ?? 0);
    }

    /** @return array{events:int,sessions:int} */
    public function cleanup(int $days): array
    {
        $days = max(1, min(3650, $days));
        $eventsRow = $this->db->one(
            'SELECT COUNT(*) AS c FROM analytics_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [$days]
        );
        $sessionsRow = $this->db->one(
            'SELECT COUNT(*) AS c FROM analytics_sessions WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [$days]
        );
        $events = (int) ($eventsRow['c'] ?? 0);
        $sessions = (int) ($sessionsRow['c'] ?? 0);
        $this->db->run('DELETE FROM analytics_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [$days]);
        $this->db->run('DELETE FROM analytics_sessions WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [$days]);
        $this->db->run('DELETE FROM analytics_goal_conversions WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [$days]);
        return ['events' => $events, 'sessions' => $sessions];
    }

    /** @return array<string,mixed> */
    public function overview(?string $from, ?string $to): array
    {
        $to = $this->date($to ?? date('Y-m-d'));
        $from = $this->date($from ?? date('Y-m-d', strtotime('-29 days')));
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        $params = [$from, $to];
        $summary = $this->db->one(
            "SELECT COUNT(*) events,COUNT(DISTINCT visitor_hash) visitors,COUNT(DISTINCT session_id) sessions,
             SUM(event_name='page_view') page_views,COALESCE(SUM(value),0) value_total
             FROM analytics_events WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)",
            $params
        ) ?? [];
        $daily = $this->db->all(
            "SELECT DATE(created_at) date,COUNT(*) events,COUNT(DISTINCT visitor_hash) visitors,
             SUM(event_name='page_view') page_views
             FROM analytics_events WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)
             GROUP BY DATE(created_at) ORDER BY date",
            $params
        );
        $events = $this->db->all(
            "SELECT event_name,COUNT(*) count,COUNT(DISTINCT visitor_hash) visitors,COALESCE(SUM(value),0) value
             FROM analytics_events WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)
             GROUP BY event_name ORDER BY count DESC",
            $params
        );
        $pages = $this->db->all(
            "SELECT path,COUNT(*) views,COUNT(DISTINCT visitor_hash) visitors
             FROM analytics_events WHERE event_name='page_view' AND created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)
             GROUP BY path ORDER BY views DESC LIMIT 50",
            $params
        );
        $goals = $this->db->all(
            "SELECT g.id,g.name,COUNT(c.id) conversions,COALESCE(SUM(c.value),0) value
             FROM analytics_goals g LEFT JOIN analytics_goal_conversions c ON c.goal_id=g.id
             AND c.created_at>=? AND c.created_at<DATE_ADD(?,INTERVAL 1 DAY)
             WHERE g.is_active=1 GROUP BY g.id,g.name ORDER BY conversions DESC",
            $params
        );
        return ['range' => ['from' => $from, 'to' => $to], 'summary' => $summary, 'daily' => $daily, 'events' => $events, 'pages' => $pages, 'goals' => $goals];
    }

    /** @param array<string,mixed> $input */
    private function recordGoals(int $eventId, string $event, int $sessionId, string $visitorHash, string $path, array $input): void
    {
        $goals = $this->db->all('SELECT * FROM analytics_goals WHERE is_active=1 AND event_name=?', [$event]);
        foreach ($goals as $goal) {
            $conditions = is_string($goal['conditions'] ?? null) ? json_decode($goal['conditions'], true) : ($goal['conditions'] ?? []);
            if (is_array($conditions) && isset($conditions['path']) && (string) $conditions['path'] !== $path) {
                continue;
            }
            $value = $input['value'] ?? $goal['value'] ?? null;
            $this->db->run(
                'INSERT IGNORE INTO analytics_goal_conversions (goal_id,event_id,session_id,visitor_hash,value) VALUES (?,?,?,?,?)',
                [(int) $goal['id'], $eventId, $sessionId ?: null, $visitorHash, $value]
            );
        }
    }

    private function date(string $value): string
    {
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date && $date->format('Y-m-d') === $value ? $value : date('Y-m-d');
    }
}
