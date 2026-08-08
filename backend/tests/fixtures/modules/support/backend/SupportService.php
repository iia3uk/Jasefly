<?php
declare(strict_types=1);

namespace App\PackageModules\Support;

use App\Platform\Contracts\PlatformDatabaseInterface;

/**
 * Tickets, messages, contact gate, bot fallback.
 */
final class SupportService
{
    /** @param array<string, mixed> $settings */
    public function __construct(
        private PlatformDatabaseInterface $db,
        private array $settings,
        private SupportPresence $presence,
        private SupportBot $bot,
        private SupportEmailGuard $emailGuard,
        private ?SupportNotifier $notifier = null,
    ) {}

    public function ensureSchema(): void
    {
        // Tables come from migration; no-op if already applied.
        $this->db->one('SELECT 1 FROM support_tickets LIMIT 1');
    }

    public function newVisitorKey(): string
    {
        return bin2hex(random_bytes(24));
    }

    /**
     * Latest open ticket for this visitor hash (reload / multi-tab restore).
     *
     * @return array{ticket: array<string, mixed>, messages: list<array<string, mixed>>}|null
     */
    public function activeForVisitor(string $visitorKey): ?array
    {
        $visitorKey = $this->sanitizeKey($visitorKey);
        if ($visitorKey === '') {
            return null;
        }
        $row = $this->db->one(
            "SELECT * FROM support_tickets
             WHERE visitor_key = ? AND status <> 'closed'
             ORDER BY updated_at DESC, id DESC
             LIMIT 1",
            [$visitorKey]
        );
        if (!$row) {
            return null;
        }
        $ticket = $this->formatTicket($row);
        return [
            'ticket' => $ticket,
            'messages' => $this->listMessages((int) $ticket['id'], 0),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function publicConfig(): array
    {
        $social = (string) ($this->settings['social_types'] ?? 'telegram,vk,whatsapp,max');
        $types = array_values(array_filter(array_map('trim', explode(',', $social))));
        return [
            'widget_enabled' => (bool) ($this->settings['widget_enabled'] ?? true),
            'position' => (string) ($this->settings['position'] ?? 'bottom-left'),
            'title' => (string) ($this->settings['widget_title'] ?? 'Поддержка'),
            'greeting' => (string) ($this->settings['greeting'] ?? 'Здравствуйте! Чем можем помочь?'),
            'require_contact_on_leave' => (bool) ($this->settings['require_contact_on_leave'] ?? true),
            'social_types' => $types ?: ['telegram', 'vk'],
            'agents_online' => $this->presence->hasOnlineAgents(),
            'poll_interval_ms' => max(2500, min(8000, (int) ($this->settings['poll_interval_ms'] ?? 3500))),
            'faq' => $this->publicFaqQuestions(),
        ];
    }

    /**
     * Clickable FAQ for the widget (id + question only).
     *
     * @return list<array{id: int, question: string}>
     */
    public function publicFaqQuestions(): array
    {
        try {
            $rows = $this->db->all(
                'SELECT id, question FROM support_faq WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 20'
            );
        } catch (\Throwable) {
            return [];
        }
        $out = [];
        foreach ($rows as $row) {
            $q = trim((string) ($row['question'] ?? ''));
            if ($q === '') {
                continue;
            }
            $out[] = ['id' => (int) $row['id'], 'question' => $q];
        }
        return $out;
    }

    /**
     * Visitor clicked a FAQ chip: persist question + exact bot answer in the ticket.
     *
     * @return array{ok: bool, error?: string, code?: string, ticket?: array<string, mixed>, messages?: list<array<string, mixed>>}
     */
    public function askFaq(int $faqId, string $visitorKey, ?string $pageUrl, ?string $userAgent): array
    {
        $visitorKey = $this->sanitizeKey($visitorKey);
        if ($visitorKey === '' || $faqId <= 0) {
            return ['ok' => false, 'error' => 'Некорректный запрос'];
        }

        $faq = $this->db->one(
            'SELECT id, question, answer FROM support_faq WHERE id = ? AND is_active = 1 LIMIT 1',
            [$faqId]
        );
        if (!$faq) {
            return ['ok' => false, 'error' => 'Вопрос не найден'];
        }
        $question = trim((string) $faq['question']);
        $answer = trim((string) $faq['answer']);
        if ($question === '' || $answer === '') {
            return ['ok' => false, 'error' => 'Пустой FAQ'];
        }

        $existing = $this->db->one(
            "SELECT * FROM support_tickets
             WHERE visitor_key = ? AND status <> 'closed'
             ORDER BY updated_at DESC, id DESC LIMIT 1",
            [$visitorKey]
        );

        if ($existing) {
            if (($existing['status'] ?? '') === 'awaiting_contact' && !$this->hasContact($existing)) {
                return ['ok' => false, 'error' => 'Нужен контакт (email или соцсеть)', 'code' => 'contact_required'];
            }
            $ticketId = (int) $existing['id'];
            $this->insertMessage($ticketId, 'visitor', $question, null);
            $this->insertMessage($ticketId, 'bot', $answer, null);
            $this->db->run(
                "UPDATE support_tickets SET status = 'bot', updated_at = NOW(), last_visitor_seen_at = NOW() WHERE id = ?",
                [$ticketId]
            );
            return [
                'ok' => true,
                'ticket' => $this->getById($ticketId),
                'messages' => $this->listMessages($ticketId, 0),
            ];
        }

        $publicId = bin2hex(random_bytes(16));
        $this->db->run(
            'INSERT INTO support_tickets
             (public_id, status, visitor_key, user_agent, page_url, last_visitor_seen_at)
             VALUES (?, ?, ?, ?, ?, NOW())',
            [
                $publicId,
                'bot',
                $visitorKey,
                $userAgent !== null ? mb_substr($userAgent, 0, 512) : null,
                $pageUrl !== null ? mb_substr($pageUrl, 0, 1024) : null,
            ]
        );
        $ticketId = (int) $this->db->lastInsertId();
        $this->insertMessage($ticketId, 'visitor', $question, null);
        $this->insertMessage($ticketId, 'bot', $answer, null);

        return [
            'ok' => true,
            'ticket' => $this->getByPublicId($publicId, $visitorKey),
            'messages' => $this->listMessages($ticketId, 0),
        ];
    }

    /**
     * @return array{ok: bool, error?: string, ticket?: array<string, mixed>, messages?: list<array<string, mixed>>}
     */
    public function createTicket(string $visitorKey, string $body, ?string $pageUrl, ?string $userAgent): array
    {
        $visitorKey = $this->sanitizeKey($visitorKey);
        $body = $this->sanitizeBody($body);
        if ($visitorKey === '' || $body === '') {
            return ['ok' => false, 'error' => 'Пустое сообщение'];
        }

        // Reuse open ticket for the same visitor hash (reload / duplicate send).
        $existing = $this->db->one(
            "SELECT * FROM support_tickets
             WHERE visitor_key = ? AND status <> 'closed'
             ORDER BY updated_at DESC, id DESC LIMIT 1",
            [$visitorKey]
        );
        if ($existing) {
            $posted = $this->postVisitorMessage((string) $existing['public_id'], $visitorKey, $body);
            if (!$posted['ok']) {
                return $posted;
            }
            return [
                'ok' => true,
                'ticket' => $posted['ticket'] ?? $this->formatTicket($existing),
                'messages' => $this->listMessages((int) $existing['id'], 0),
            ];
        }

        $publicId = bin2hex(random_bytes(16));
        $agentsOnline = $this->presence->hasOnlineAgents();
        $status = $agentsOnline ? 'waiting_agent' : 'bot';

        $this->db->run(
            'INSERT INTO support_tickets
             (public_id, status, visitor_key, user_agent, page_url, last_visitor_seen_at)
             VALUES (?, ?, ?, ?, ?, NOW())',
            [
                $publicId,
                $status,
                $visitorKey,
                $userAgent !== null ? mb_substr($userAgent, 0, 512) : null,
                $pageUrl !== null ? mb_substr($pageUrl, 0, 1024) : null,
            ]
        );
        $ticketId = (int) $this->db->lastInsertId();
        $this->insertMessage($ticketId, 'visitor', $body, null);

        $note = '';
        if ($agentsOnline) {
            // waiting for agent
        } else {
            $bot = $this->bot->reply($body);
            $this->insertMessage($ticketId, 'bot', $bot['answer'], null);
            $note = 'Агенты офлайн — ответил бот. Зайдите в /admin/support.';
        }

        // Always notify (TG/email/…) — even when offline, otherwise nobody knows about the ticket.
        $this->notifier?->notifyNewActivity([
            'kind' => 'ticket',
            'public_id' => $publicId,
            'preview' => $body,
            'note' => $note,
        ]);

        $ticket = $this->getByPublicId($publicId, $visitorKey);
        return [
            'ok' => true,
            'ticket' => $ticket,
            'messages' => $this->listMessages($ticketId, 0),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getByPublicId(string $publicId, string $visitorKey): ?array
    {
        $row = $this->db->one(
            'SELECT * FROM support_tickets WHERE public_id = ? AND visitor_key = ? LIMIT 1',
            [$publicId, $this->sanitizeKey($visitorKey)]
        );
        return $row ? $this->formatTicket($row) : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getById(int $id): ?array
    {
        $row = $this->db->one('SELECT * FROM support_tickets WHERE id = ? LIMIT 1', [$id]);
        return $row ? $this->formatTicket($row) : null;
    }

    /**
     * @return array{ok: bool, error?: string, message?: array<string, mixed>, bot_message?: array<string, mixed>|null, ticket?: array<string, mixed>}
     */
    public function postVisitorMessage(string $publicId, string $visitorKey, string $body): array
    {
        $ticket = $this->db->one(
            'SELECT * FROM support_tickets WHERE public_id = ? AND visitor_key = ? LIMIT 1',
            [$publicId, $this->sanitizeKey($visitorKey)]
        );
        if (!$ticket) {
            return ['ok' => false, 'error' => 'Тикет не найден'];
        }
        if (($ticket['status'] ?? '') === 'closed') {
            return ['ok' => false, 'error' => 'Тикет закрыт', 'code' => 'ticket_closed'];
        }

        $this->presence->markAbandonedWithoutContact();
        $ticket = $this->db->one('SELECT * FROM support_tickets WHERE id = ?', [(int) $ticket['id']]) ?: $ticket;

        if (($ticket['status'] ?? '') === 'awaiting_contact' && !$this->hasContact($ticket)) {
            return ['ok' => false, 'error' => 'Нужен контакт (email или соцсеть)', 'code' => 'contact_required'];
        }

        $body = $this->sanitizeBody($body);
        if ($body === '') {
            return ['ok' => false, 'error' => 'Пустое сообщение'];
        }

        $ticketId = (int) $ticket['id'];
        $msg = $this->insertMessage($ticketId, 'visitor', $body, null);
        $this->presence->touchVisitor($ticketId);

        $agentsOnline = $this->presence->hasOnlineAgents();
        $botMsg = null;
        $note = '';

        if ($agentsOnline) {
            if ((string) $ticket['status'] !== 'closed') {
                $this->db->run(
                    "UPDATE support_tickets SET status = 'waiting_agent', updated_at = NOW() WHERE id = ?",
                    [$ticketId]
                );
            }
        } else {
            $this->db->run("UPDATE support_tickets SET status = 'bot', updated_at = NOW() WHERE id = ?", [$ticketId]);
            $bot = $this->bot->reply($body);
            $botMsg = $this->insertMessage($ticketId, 'bot', $bot['answer'], null);
            $note = 'Агенты офлайн — ответил бот.';
        }

        $this->notifier?->notifyNewActivity([
            'kind' => 'message',
            'public_id' => (string) $ticket['public_id'],
            'preview' => $body,
            'note' => $note,
        ]);

        return [
            'ok' => true,
            'message' => $msg,
            'bot_message' => $botMsg,
            'ticket' => $this->getById($ticketId),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listMessages(int $ticketId, int $afterId = 0): array
    {
        $rows = $this->db->all(
            'SELECT id, ticket_id, sender, user_id, body, created_at
             FROM support_messages WHERE ticket_id = ? AND id > ? ORDER BY id ASC LIMIT 200',
            [$ticketId, $afterId]
        );
        return array_map(fn(array $r): array => $this->formatMessage($r), $rows);
    }

    /**
     * @return array{ok: bool, error?: string, ticket?: array<string, mixed>}
     */
    public function setContact(string $publicId, string $visitorKey, ?string $email, ?string $social, ?string $socialType): array
    {
        $ticket = $this->db->one(
            'SELECT * FROM support_tickets WHERE public_id = ? AND visitor_key = ? LIMIT 1',
            [$publicId, $this->sanitizeKey($visitorKey)]
        );
        if (!$ticket) {
            return ['ok' => false, 'error' => 'Тикет не найден'];
        }

        $email = $email !== null ? trim(mb_strtolower($email)) : '';
        $social = $social !== null ? trim($social) : '';
        $socialType = $socialType !== null ? trim(mb_strtolower($socialType)) : '';

        if ($email === '' && $social === '') {
            return ['ok' => false, 'error' => 'Укажите email или соцсеть'];
        }

        if ($email !== '') {
            $extra = SupportEmailGuard::parseExtraDomains((string) ($this->settings['disposable_domains'] ?? ''));
            $check = $this->emailGuard->validate($email, $extra);
            if (!$check['ok']) {
                return ['ok' => false, 'error' => $check['error'] ?? 'Некорректный email'];
            }
        }

        if ($social !== '' && mb_strlen($social) > 255) {
            return ['ok' => false, 'error' => 'Слишком длинный контакт'];
        }

        $newStatus = $this->presence->hasOnlineAgents() ? 'waiting_agent' : 'bot';
        if (($ticket['status'] ?? '') === 'closed') {
            $newStatus = 'closed';
        }

        $this->db->run(
            'UPDATE support_tickets SET
                contact_email = ?, contact_social = ?, contact_social_type = ?,
                status = ?, updated_at = NOW()
             WHERE id = ?',
            [
                $email !== '' ? $email : null,
                $social !== '' ? mb_substr($social, 0, 255) : null,
                $socialType !== '' ? mb_substr($socialType, 0, 40) : null,
                $newStatus,
                (int) $ticket['id'],
            ]
        );

        $this->insertMessage(
            (int) $ticket['id'],
            'system',
            'Контакт сохранён' . ($email !== '' ? ': ' . $email : '') . ($social !== '' ? ' / ' . $socialType . ' ' . $social : ''),
            null
        );

        if ($newStatus === 'waiting_agent') {
            $this->notifier?->notifyNewActivity([
                'kind' => 'ticket',
                'public_id' => (string) $ticket['public_id'],
                'preview' => 'Контакт: ' . ($email ?: $social),
            ]);
        }

        return ['ok' => true, 'ticket' => $this->getById((int) $ticket['id'])];
    }

    public function visitorHeartbeat(string $publicId, string $visitorKey): ?array
    {
        $ticket = $this->db->one(
            'SELECT * FROM support_tickets WHERE public_id = ? AND visitor_key = ? LIMIT 1',
            [$publicId, $this->sanitizeKey($visitorKey)]
        );
        if (!$ticket) {
            return null;
        }
        $this->presence->touchVisitor((int) $ticket['id']);
        return $this->formatTicket($ticket);
    }

    /**
     * Soft gate: visitor signals leave without contact → awaiting_contact.
     */
    public function markAwaitingContact(string $publicId, string $visitorKey): ?array
    {
        $ticket = $this->db->one(
            'SELECT * FROM support_tickets WHERE public_id = ? AND visitor_key = ? LIMIT 1',
            [$publicId, $this->sanitizeKey($visitorKey)]
        );
        if (!$ticket || $this->hasContact($ticket)) {
            return $ticket ? $this->formatTicket($ticket) : null;
        }
        if (in_array((string) $ticket['status'], ['closed'], true)) {
            return $this->formatTicket($ticket);
        }
        $this->db->run(
            "UPDATE support_tickets SET status = 'awaiting_contact', updated_at = NOW() WHERE id = ?",
            [(int) $ticket['id']]
        );
        return $this->getById((int) $ticket['id']);
    }

    /**
     * @return array{ok: bool, error?: string, message?: array<string, mixed>}
     */
    public function agentReply(int $ticketId, int $userId, string $body): array
    {
        $ticket = $this->db->one('SELECT * FROM support_tickets WHERE id = ?', [$ticketId]);
        if (!$ticket) {
            return ['ok' => false, 'error' => 'Тикет не найден'];
        }
        $body = $this->sanitizeBody($body);
        if ($body === '') {
            return ['ok' => false, 'error' => 'Пустое сообщение'];
        }
        $msg = $this->insertMessage($ticketId, 'agent', $body, $userId);
        if (($ticket['status'] ?? '') !== 'closed') {
            $this->db->run(
                "UPDATE support_tickets SET status = 'open', assigned_user_id = COALESCE(assigned_user_id, ?), updated_at = NOW() WHERE id = ?",
                [$userId, $ticketId]
            );
        }
        return ['ok' => true, 'message' => $msg];
    }

    public function assign(int $ticketId, int $userId): bool
    {
        $this->db->run(
            'UPDATE support_tickets SET assigned_user_id = ?, updated_at = NOW() WHERE id = ?',
            [$userId, $ticketId]
        );
        return true;
    }

    public function close(int $ticketId): bool
    {
        $this->db->run(
            "UPDATE support_tickets SET status = 'closed', updated_at = NOW() WHERE id = ?",
            [$ticketId]
        );
        $this->insertMessage($ticketId, 'system', 'Тикет закрыт', null);
        return true;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function adminList(?string $status = null, int $limit = 50, int $offset = 0): array
    {
        $limit = max(1, min(100, $limit));
        $offset = max(0, $offset);
        if ($status !== null && $status !== '' && $status !== 'all') {
            $rows = $this->db->all(
                'SELECT t.*,
                    (SELECT body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
                    (SELECT created_at FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message_at
                 FROM support_tickets t
                 WHERE t.status = ?
                 ORDER BY t.updated_at DESC
                 LIMIT ' . $limit . ' OFFSET ' . $offset,
                [$status]
            );
        } else {
            $rows = $this->db->all(
                'SELECT t.*,
                    (SELECT body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
                    (SELECT created_at FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message_at
                 FROM support_tickets t
                 ORDER BY t.updated_at DESC
                 LIMIT ' . $limit . ' OFFSET ' . $offset
            );
        }
        return array_map(function (array $r): array {
            $t = $this->formatTicket($r);
            $t['last_body'] = isset($r['last_body']) ? mb_substr((string) $r['last_body'], 0, 200) : null;
            $t['last_message_at'] = $r['last_message_at'] ?? null;
            return $t;
        }, $rows);
    }

    /**
     * @return array{ok: bool, error?: string, item?: array<string, mixed>}
     */
    public function createFaq(string $question, string $answer, string $keywords = '', int $sort = 0): array
    {
        $question = trim($question);
        $answer = trim($answer);
        if ($question === '' || $answer === '') {
            return ['ok' => false, 'error' => 'Вопрос и ответ обязательны'];
        }
        $this->db->run(
            'INSERT INTO support_faq (question, answer, keywords, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
            [$question, $answer, trim($keywords), $sort]
        );
        $id = (int) $this->db->lastInsertId();
        return ['ok' => true, 'item' => $this->db->one('SELECT * FROM support_faq WHERE id = ?', [$id])];
    }

    /**
     * @param array<string, mixed> $fields
     * @return array{ok: bool, error?: string}
     */
    public function updateFaq(int $id, array $fields): array
    {
        $sets = [];
        $params = [];
        foreach (['question', 'answer', 'keywords'] as $f) {
            if (array_key_exists($f, $fields) && is_string($fields[$f])) {
                $sets[] = "$f = ?";
                $params[] = trim($fields[$f]);
            }
        }
        if (array_key_exists('sort_order', $fields)) {
            $sets[] = 'sort_order = ?';
            $params[] = (int) $fields['sort_order'];
        }
        if (array_key_exists('is_active', $fields)) {
            $sets[] = 'is_active = ?';
            $params[] = $fields['is_active'] ? 1 : 0;
        }
        if ($sets === []) {
            return ['ok' => false, 'error' => 'Нет полей'];
        }
        $params[] = $id;
        $this->db->run('UPDATE support_faq SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
        return ['ok' => true];
    }

    public function deleteFaq(int $id): void
    {
        $this->db->run('DELETE FROM support_faq WHERE id = ?', [$id]);
    }

    /** @return list<array<string, mixed>> */
    public function listFaq(bool $activeOnly = false): array
    {
        if ($activeOnly) {
            return $this->db->all('SELECT * FROM support_faq WHERE is_active = 1 ORDER BY sort_order ASC, id ASC');
        }
        return $this->db->all('SELECT * FROM support_faq ORDER BY sort_order ASC, id ASC');
    }

    /**
     * @return array<string, mixed>
     */
    private function insertMessage(int $ticketId, string $sender, string $body, ?int $userId): array
    {
        $this->db->run(
            'INSERT INTO support_messages (ticket_id, sender, user_id, body) VALUES (?, ?, ?, ?)',
            [$ticketId, $sender, $userId, $body]
        );
        $id = (int) $this->db->lastInsertId();
        $row = $this->db->one('SELECT * FROM support_messages WHERE id = ?', [$id]);
        return $this->formatMessage($row ?: [
            'id' => $id,
            'ticket_id' => $ticketId,
            'sender' => $sender,
            'user_id' => $userId,
            'body' => $body,
            'created_at' => date('c'),
        ]);
    }

    /** @param array<string, mixed> $row */
    private function hasContact(array $row): bool
    {
        return trim((string) ($row['contact_email'] ?? '')) !== ''
            || trim((string) ($row['contact_social'] ?? '')) !== '';
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function formatTicket(array $row): array
    {
        return [
            'id' => (int) ($row['id'] ?? 0),
            'public_id' => (string) ($row['public_id'] ?? ''),
            'status' => (string) ($row['status'] ?? 'open'),
            'contact_email' => $row['contact_email'] ?? null,
            'contact_social' => $row['contact_social'] ?? null,
            'contact_social_type' => $row['contact_social_type'] ?? null,
            'page_url' => $row['page_url'] ?? null,
            'assigned_user_id' => isset($row['assigned_user_id']) ? (int) $row['assigned_user_id'] : null,
            'last_visitor_seen_at' => $row['last_visitor_seen_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'needs_contact' => ($row['status'] ?? '') === 'awaiting_contact' && !$this->hasContact($row),
            'has_contact' => $this->hasContact($row),
        ];
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function formatMessage(array $row): array
    {
        return [
            'id' => (int) ($row['id'] ?? 0),
            'ticket_id' => (int) ($row['ticket_id'] ?? 0),
            'sender' => (string) ($row['sender'] ?? 'visitor'),
            'user_id' => isset($row['user_id']) && $row['user_id'] !== null ? (int) $row['user_id'] : null,
            'body' => (string) ($row['body'] ?? ''),
            'created_at' => $row['created_at'] ?? null,
        ];
    }

    private function sanitizeKey(string $key): string
    {
        $key = preg_replace('/[^a-f0-9]/i', '', $key) ?? '';
        return $this->clip($key, 64);
    }

    private function sanitizeBody(string $body): string
    {
        $body = trim(strip_tags($body));
        $body = preg_replace("/\r\n?/", "\n", $body) ?? $body;
        return $this->clip($body, 4000);
    }

    /** Prefer mbstring; fall back so SQLite/parity PHP without ext still answers. */
    private function clip(string $value, int $max): string
    {
        if (\function_exists('mb_substr')) {
            return \mb_substr($value, 0, $max);
        }
        return substr($value, 0, $max);
    }
}
