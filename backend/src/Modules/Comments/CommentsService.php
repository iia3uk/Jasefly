<?php
declare(strict_types=1);

namespace App\Modules\Comments;

use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;

final class CommentsService
{
    private const TARGETS = ['blog_post', 'project', 'product', 'page'];
    private const STATUSES = ['pending', 'approved', 'rejected', 'spam', 'deleted'];

    public function __construct(private Database $db, private string $salt) {}

    /** @param array<string,mixed> $input @return array<string,mixed> */
    public function create(array $input, ?string $ip = null): array
    {
        $type = (string) ($input['type'] ?? 'comment');
        $targetType = (string) ($input['target_type'] ?? '');
        $targetId = (int) ($input['target_id'] ?? 0);
        $name = trim((string) ($input['author_name'] ?? ''));
        $email = trim(strtolower((string) ($input['author_email'] ?? '')));
        $body = trim((string) ($input['body'] ?? ''));
        $rating = $input['rating'] ?? null;
        if (!in_array($type, ['comment', 'review'], true) || !in_array($targetType, self::TARGETS, true) || $targetId < 1) {
            throw new \InvalidArgumentException('Invalid comment target');
        }
        if ($name === '' || mb_strlen($name) > 200 || $body === '' || mb_strlen($body) > 10000) {
            throw new \InvalidArgumentException('Name and comment text are required');
        }
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid email');
        }
        if ($type === 'review') {
            $rating = (int) $rating;
            if ($rating < 1 || $rating > 5) {
                throw new \InvalidArgumentException('Rating must be between 1 and 5');
            }
        } else {
            $rating = null;
        }
        $parentId = ($input['parent_id'] ?? null) !== null ? (int) $input['parent_id'] : null;
        if ($parentId && !$this->db->one('SELECT id FROM comments WHERE id=? AND target_type=? AND target_id=?', [$parentId, $targetType, $targetId])) {
            throw new \InvalidArgumentException('Invalid parent comment');
        }
        $ipHash = $ip ? hash_hmac('sha256', $ip, $this->salt) : null;
        $verified = $type === 'review' && $targetType === 'product' && $email !== ''
            ? $this->verifiedPurchase($targetId, $email) : false;
        $publicId = strtolower(bin2hex(random_bytes(13)));
        $this->db->run(
            'INSERT INTO comments (public_id,type,target_type,target_id,parent_id,user_id,author_name,author_email,body,rating,status,verified_purchase,ip_hash)
             VALUES (?,?,?,?,?,?,?,?,?,?,\'pending\',?,?)',
            [$publicId, $type, $targetType, $targetId, $parentId, $input['user_id'] ?? null, $name, $email ?: null, $body, $rating, $verified ? 1 : 0, $ipHash]
        );
        $comment = $this->db->one('SELECT * FROM comments WHERE id=?', [(int) $this->db->id()]) ?? [];
        $this->dispatch('comment.created', ['comment' => $this->safe($comment)]);
        if ($type === 'review') {
            $this->dispatch('review.created', ['comment' => $this->safe($comment)]);
        }
        return $this->safe($comment);
    }

    /** @return list<array<string,mixed>> */
    public function approved(string $targetType, int $targetId, ?string $type = null): array
    {
        if (!in_array($targetType, self::TARGETS, true) || $targetId < 1) {
            throw new \InvalidArgumentException('Invalid target');
        }
        $sql = "SELECT id,public_id,type,target_type,target_id,parent_id,user_id,author_name,body,rating,verified_purchase,created_at
                FROM comments WHERE target_type=? AND target_id=? AND status='approved' AND deleted_at IS NULL";
        $params = [$targetType, $targetId];
        if ($type && in_array($type, ['comment', 'review'], true)) {
            $sql .= ' AND type=?';
            $params[] = $type;
        }
        $sql .= ' ORDER BY created_at ASC LIMIT 500';
        return $this->db->all($sql, $params);
    }

    /** @return array<string,mixed> */
    public function ratingSummary(string $targetType, int $targetId): array
    {
        $row = $this->db->one(
            "SELECT COUNT(*) count,COALESCE(ROUND(AVG(rating),2),0) average,
             SUM(rating=5) five,SUM(rating=4) four,SUM(rating=3) three,SUM(rating=2) two,SUM(rating=1) one
             FROM comments WHERE target_type=? AND target_id=? AND type='review' AND status='approved' AND deleted_at IS NULL",
            [$targetType, $targetId]
        ) ?? [];
        return [
            'count' => (int) ($row['count'] ?? 0),
            'average' => (float) ($row['average'] ?? 0),
            'distribution' => [
                5 => (int) ($row['five'] ?? 0), 4 => (int) ($row['four'] ?? 0), 3 => (int) ($row['three'] ?? 0),
                2 => (int) ($row['two'] ?? 0), 1 => (int) ($row['one'] ?? 0),
            ],
        ];
    }

    public function moderate(int $id, string $status): array
    {
        if (!in_array($status, ['approved', 'rejected', 'spam'], true)) {
            throw new \InvalidArgumentException('Invalid moderation status');
        }
        $comment = $this->db->one('SELECT * FROM comments WHERE id=? AND deleted_at IS NULL', [$id]);
        if (!$comment) {
            throw new \InvalidArgumentException('Comment not found');
        }
        $this->db->run('UPDATE comments SET status=? WHERE id=?', [$status, $id]);
        $comment['status'] = $status;
        if ($status === 'approved') {
            $this->dispatch('comment.approved', ['comment' => $this->safe($comment)]);
        }
        return $this->safe($comment);
    }

    private function verifiedPurchase(int $productId, string $email): bool
    {
        try {
            return (bool) $this->db->one(
                "SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id=o.id
                 WHERE oi.product_id=? AND COALESCE(o.email,o.customer_email)=? AND o.status IN ('paid','processing','shipped','completed') LIMIT 1",
                [$productId, $email]
            );
        } catch (\Throwable) {
            return false;
        }
    }

    /** @param array<string,mixed> $row @return array<string,mixed> */
    private function safe(array $row): array
    {
        unset($row['author_email'], $row['ip_hash']);
        return $row;
    }

    private function dispatch(string $name, array $payload): void
    {
        try {
            $container = Container::getInstance();
            if ($container->has(EventDispatcher::class)) {
                $container->get(EventDispatcher::class)->dispatch($name, $payload);
            }
        } catch (\Throwable) {
        }
    }
}
