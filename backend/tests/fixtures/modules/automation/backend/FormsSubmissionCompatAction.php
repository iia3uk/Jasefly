<?php
declare(strict_types=1);

namespace App\PackageModules\Automation;

use App\Platform\Contracts\PlatformDatabaseInterface;

/**
 * TECHNICAL DEBT / compatibility adapter (not part of the generic Automation engine).
 *
 * Knows Forms table `form_submissions`. Follow-up: move ownership to Forms via
 * Platform event/capability (e.g. forms.submission.update) so Automation stays domain-agnostic.
 */
final class FormsSubmissionCompatAction
{
    public function __construct(
        private PlatformDatabaseInterface $db,
        private ConditionEngine $conditions,
    ) {}

    /**
     * @param array<string, mixed> $config
     * @param array<string, mixed> $ctx
     * @return array<string, mixed>
     */
    public function __invoke(array $config, array &$ctx): array
    {
        $status = (string) ($config['status'] ?? '');
        if (!in_array($status, ['new', 'in_progress', 'resolved', 'spam', 'archived'], true)) {
            throw new \RuntimeException('Invalid submission update');
        }
        $id = (int) ($config['submission_id'] ?? $this->conditions->value($ctx, 'submission.id') ?? $ctx['submission_id'] ?? 0);
        if ($id < 1) {
            $publicId = (string) (
                $config['submission_public_id']
                ?? $this->conditions->value($ctx, 'submission.public_id')
                ?? $ctx['submission_public_id']
                ?? $ctx['public_id']
                ?? ''
            );
            if ($publicId !== '') {
                try {
                    $row = $this->db->one('SELECT id FROM form_submissions WHERE public_id=?', [$publicId]);
                    $id = (int) ($row['id'] ?? 0);
                } catch (\Throwable) {
                    $id = 0;
                }
            }
        }
        if ($id < 1) {
            throw new \RuntimeException('Invalid submission update');
        }
        try {
            $this->db->run('UPDATE form_submissions SET status=? WHERE id=?', [$status, $id]);
        } catch (\Throwable $e) {
            throw new \RuntimeException('Forms submission update unavailable: ' . $e->getMessage(), 0, $e);
        }
        return ['submission_id' => $id, 'status' => $status, '_compat' => 'forms_submission'];
    }
}
