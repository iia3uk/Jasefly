<?php
declare(strict_types=1);

namespace App\PackageModules\Automation;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformHttpInterface;
use App\Platform\Contracts\PlatformMailInterface;
use App\Platform\Contracts\PlatformNotificationsInterface;
use App\Platform\Contracts\PlatformSchedulerInterface;

/**
 * Generic automation runner — Platform Mail / HTTP / Notifications / Scheduler only.
 * Domain-specific actions (e.g. Forms submission update) register via registerCompatAction().
 */
final class AutomationEngine
{
    private const MAX_STEPS = 50;
    private ConditionEngine $conditions;

    /** @var array<string, callable(array, array): array> */
    private array $compatActions = [];

    public function __construct(
        private PlatformDatabaseInterface $db,
        private PlatformMailInterface $mail,
        private PlatformHttpInterface $http,
        private PlatformNotificationsInterface $notifications,
        private PlatformSchedulerInterface $scheduler,
    ) {
        $this->conditions = new ConditionEngine();
    }

    /** @param callable(array<string,mixed>, array<string,mixed>): array<string,mixed> $handler */
    public function registerCompatAction(string $type, callable $handler): void
    {
        $this->compatActions[trim($type)] = $handler;
    }

    public function run(array $automation, array $context, ?string $idempotencyKey = null): ?int
    {
        $definition = $automation['definition'] ?? [];
        if (is_string($definition)) {
            $definition = json_decode($definition, true);
        }
        if (!is_array($definition)) {
            throw new \InvalidArgumentException('Invalid automation definition');
        }
        if ((int) ($context['_depth'] ?? 0) > 10) {
            throw new \RuntimeException('Automation recursion limit reached');
        }
        if (!$this->conditions->matches($definition['conditions'] ?? [], $context)) {
            return null;
        }
        $idempotencyKey ??= hash('sha256', json_encode([$automation['id'], $context], JSON_UNESCAPED_UNICODE) ?: '');
        try {
            $this->db->run(
                "INSERT INTO automation_runs (automation_id,status,trigger_event,context,idempotency_key,started_at)
                 VALUES (?,'running',?,?,?,NOW())",
                [(int) $automation['id'], $context['_event'] ?? null, $this->json($context), $idempotencyKey]
            );
        } catch (\Throwable $e) {
            $existing = $this->db->one(
                'SELECT id FROM automation_runs WHERE automation_id=? AND idempotency_key=?',
                [(int) $automation['id'], $idempotencyKey]
            );
            if ($existing) {
                return (int) $existing['id'];
            }
            throw $e;
        }
        $runId = (int) $this->db->lastInsertId();
        $this->execute($runId, $automation, $context, (array) ($definition['steps'] ?? []), 0);
        return $runId;
    }

    public function resume(array $payload): void
    {
        $runId = (int) ($payload['run_id'] ?? 0);
        $run = $this->db->one('SELECT * FROM automation_runs WHERE id=?', [$runId]);
        if (!$run || !in_array($run['status'], ['waiting', 'running'], true)) {
            return;
        }
        $automation = $this->db->one('SELECT * FROM automations WHERE id=?', [(int) $run['automation_id']]);
        if (!$automation) {
            return;
        }
        $context = json_decode((string) ($run['context'] ?? '{}'), true) ?: [];
        $definition = json_decode((string) $automation['definition'], true) ?: [];
        $this->db->run("UPDATE automation_runs SET status='running' WHERE id=?", [$runId]);
        $this->execute($runId, $automation, $context, (array) ($definition['steps'] ?? []), (int) ($payload['next_step'] ?? $run['current_step']));
    }

    private function execute(int $runId, array $automation, array &$context, array $steps, int $start, bool $finalize = true): void
    {
        try {
            for ($i = $start, $count = count($steps); $i < $count; $i++) {
                $context['_automation_steps'] = (int) ($context['_automation_steps'] ?? 0) + 1;
                if ($context['_automation_steps'] > self::MAX_STEPS) {
                    throw new \RuntimeException('Maximum step count exceeded');
                }
                $step = is_array($steps[$i]) ? $steps[$i] : [];
                $type = (string) ($step['action'] ?? $step['type'] ?? '');
                $stepId = $this->startStep($runId, $i, $type, $step);
                try {
                    $result = $this->action($type, $step, $context, $runId, $i, $automation);
                    $this->finishStep($stepId, 'completed', $result);
                    if (($result['waiting'] ?? false) === true) {
                        $this->db->run("UPDATE automation_runs SET status='waiting', current_step=? WHERE id=?", [$i + 1, $runId]);
                        return;
                    }
                    if (($result['stop'] ?? false) === true) {
                        break;
                    }
                } catch (\Throwable $e) {
                    $this->db->run(
                        "UPDATE automation_run_steps SET status='failed',error=?,finished_at=NOW() WHERE id=?",
                        [$e->getMessage(), $stepId]
                    );
                    throw $e;
                }
                $this->db->run('UPDATE automation_runs SET current_step=? WHERE id=?', [$i + 1, $runId]);
            }
            if ($finalize) {
                $this->db->run("UPDATE automation_runs SET status='completed',finished_at=NOW() WHERE id=?", [$runId]);
                $this->db->run('UPDATE automations SET run_count=run_count+1,last_run_at=NOW() WHERE id=?', [(int) $automation['id']]);
            }
        } catch (\Throwable $e) {
            $this->db->run("UPDATE automation_runs SET status='failed',error=?,finished_at=NOW() WHERE id=?", [$e->getMessage(), $runId]);
            if (!$finalize) {
                throw $e;
            }
        }
    }

    /** @return array<string, mixed> */
    private function action(string $type, array $step, array &$context, int $runId, int $index, array $automation): array
    {
        $config = is_array($step['config'] ?? null) ? $step['config'] : $step;
        if (isset($this->compatActions[$type])) {
            return ($this->compatActions[$type])($config, $context);
        }
        return match ($type) {
            'send_email' => $this->sendEmail($config, $context),
            'send_telegram' => $this->sendTelegram($config, $context),
            'send_webhook' => $this->sendWebhook($config, $context),
            'create_notification' => $this->notify($config, $context),
            'delay' => $this->delay($config, $runId, $index),
            'branch' => $this->branch($config, $context, $runId, $automation),
            'stop' => ['stop' => true],
            default => throw new \RuntimeException('Unknown automation action: ' . $type),
        };
    }

    /** @return array<string, mixed> */
    private function sendEmail(array $c, array $ctx): array
    {
        if (!$this->mail->isAvailable()) {
            throw new \RuntimeException('Mail capability unavailable');
        }
        $to = $this->render((string) ($c['to'] ?? ''), $ctx);
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new \RuntimeException('Invalid email recipient');
        }
        $result = $this->mail->sendHtml(
            $to,
            $this->render((string) ($c['subject'] ?? 'Уведомление'), $ctx),
            $this->render((string) ($c['html'] ?? $c['body'] ?? ''), $ctx),
            $this->render((string) ($c['text'] ?? $c['body'] ?? ''), $ctx) ?: null
        );
        if (!($result['ok'] ?? false)) {
            throw new \RuntimeException((string) ($result['error'] ?? 'Mail send failed'));
        }
        return ['sent' => true, 'to' => $to];
    }

    /** @return array<string, mixed> */
    private function sendTelegram(array $c, array $ctx): array
    {
        $token = $this->render((string) ($c['bot_token'] ?? ''), $ctx);
        $chat = $this->render((string) ($c['chat_id'] ?? ''), $ctx);
        if ($token === '' || $chat === '') {
            throw new \RuntimeException('Telegram is not configured');
        }
        $url = 'https://api.telegram.org/bot' . $token . '/sendMessage';
        if (!$this->http->isSafeOutboundUrl($url)) {
            throw new \RuntimeException('Unsafe Telegram URL');
        }
        $ok = $this->http->postJsonOutbound($url, [
            'chat_id' => $chat,
            'text' => $this->render((string) ($c['text'] ?? ''), $ctx),
        ]);
        if (!$ok) {
            throw new \RuntimeException('Telegram send failed');
        }
        return ['sent' => true, 'chat_id' => '***'];
    }

    /** @return array<string, mixed> */
    private function sendWebhook(array $c, array $ctx): array
    {
        $url = $this->render((string) ($c['url'] ?? ''), $ctx);
        if (!$this->http->isSafeOutboundUrl($url)) {
            throw new \RuntimeException('Unsafe webhook URL');
        }
        $body = $c['payload'] ?? $ctx;
        $ok = $this->http->postJsonOutbound($url, is_array($body) ? $body : ['payload' => $body]);
        if (!$ok) {
            throw new \RuntimeException('Webhook send failed');
        }
        return ['ok' => true];
    }

    /** @return array<string, mixed> */
    private function notify(array $c, array $ctx): array
    {
        if (!$this->notifications->isAvailable()) {
            throw new \RuntimeException('Notifications capability unavailable');
        }
        $this->notifications->notifyAdmins(
            (string) ($c['notification_type'] ?? 'automation'),
            $this->render((string) ($c['title'] ?? 'Автоматизация'), $ctx),
            $this->render((string) ($c['body'] ?? ''), $ctx),
            $c
        );
        return ['created' => true];
    }

    /** @return array<string, mixed> */
    private function delay(array $c, int $runId, int $index): array
    {
        $seconds = max(1, min(2592000, (int) ($c['seconds'] ?? 60)));
        $this->scheduler->enqueueEx(
            'resume',
            ['run_id' => $runId, 'next_step' => $index + 1],
            $seconds,
            'default',
            0,
            5,
            'resume-' . $runId . '-' . $index
        );
        return ['waiting' => true, 'seconds' => $seconds];
    }

    /** @return array<string, mixed> */
    private function branch(array $c, array &$ctx, int $runId, array $automation): array
    {
        $branch = $this->conditions->matches($c['conditions'] ?? [], $ctx) ? ($c['then'] ?? []) : ($c['else'] ?? []);
        $ctx['_depth'] = (int) ($ctx['_depth'] ?? 0) + 1;
        $this->execute($runId, $automation, $ctx, is_array($branch) ? $branch : [], 0, false);
        return ['branch' => $this->conditions->matches($c['conditions'] ?? [], $ctx) ? 'then' : 'else'];
    }

    private function startStep(int $runId, int $index, string $type, array $input): int
    {
        $this->db->run(
            "INSERT INTO automation_run_steps (run_id,step_index,action_type,status,input) VALUES (?,?,?,'running',?)",
            [$runId, $index, $type, $this->json($this->redact($input))]
        );
        return (int) $this->db->lastInsertId();
    }

    private function finishStep(int $id, string $status, array $output): void
    {
        $this->db->run(
            'UPDATE automation_run_steps SET status=?,output=?,finished_at=NOW() WHERE id=?',
            [$status, $this->json($this->redact($output)), $id]
        );
    }

    private function render(string $text, array $ctx): string
    {
        return preg_replace_callback('/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/', function (array $m) use ($ctx): string {
            $v = $this->conditions->value($ctx, $m[1]);
            return is_scalar($v) ? (string) $v : '';
        }, $text) ?? $text;
    }

    private function redact(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        $out = [];
        foreach ($value as $k => $v) {
            $key = strtolower((string) $k);
            if (preg_match('/(password|secret|token|api_key|authorization)/', $key)) {
                $out[$k] = '***';
            } else {
                $out[$k] = is_array($v) ? $this->redact($v) : $v;
            }
        }
        return $out;
    }

    private function json(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    }
}
