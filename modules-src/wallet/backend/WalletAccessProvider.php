<?php
declare(strict_types=1);

namespace App\PackageModules\Wallet;

use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;
use App\Platform\Contracts\PlatformDatabaseInterface;

/** Access provider `wallet` — min_balance check. */
final class WalletAccessProvider implements AccessProviderInterface
{
    private ?bool $available = null;

    public function __construct(private PlatformDatabaseInterface $db) {}

    public function id(): string
    {
        return 'wallet';
    }

    public function label(): string
    {
        return 'Кошелёк';
    }

    public function asserts(): array
    {
        return [
            [
                'id' => 'min_balance',
                'label' => 'Минимальный баланс',
                'params' => [
                    ['key' => 'amount', 'label' => 'Сумма', 'type' => 'number', 'placeholder' => '100'],
                    ['key' => 'currency', 'label' => 'Валюта / кредиты', 'type' => 'text', 'placeholder' => 'credits'],
                ],
            ],
        ];
    }

    public function isAvailable(): bool
    {
        if ($this->available !== null) {
            return $this->available;
        }
        try {
            $this->db->one('SELECT user_id FROM wallet_balances LIMIT 1');
            return $this->available = true;
        } catch (\Throwable) {
            return $this->available = false;
        }
    }

    public function evaluate(?int $userId, string $assert, array $params = []): AccessDecision
    {
        if (!$this->isAvailable()) {
            return AccessDecision::deny('Wallet provider unavailable', $this->id());
        }
        if ($assert !== 'min_balance') {
            return AccessDecision::deny('Unknown wallet assert: ' . $assert, $this->id());
        }
        if ($userId === null || $userId <= 0) {
            return AccessDecision::deny('Authentication required', $this->id());
        }
        $amount = (float) ($params['amount'] ?? 0);
        $currency = trim((string) ($params['currency'] ?? 'credits'));
        if ($currency === '') {
            $currency = 'credits';
        }
        if ($amount < 0) {
            return AccessDecision::deny('Invalid amount', $this->id());
        }
        try {
            $row = $this->db->one(
                'SELECT balance FROM wallet_balances WHERE user_id = ? AND currency = ? LIMIT 1',
                [$userId, $currency]
            );
            $balance = (float) ($row['balance'] ?? 0);
            return $balance >= $amount
                ? AccessDecision::allow($this->id(), ['balance' => $balance, 'currency' => $currency])
                : AccessDecision::deny('Insufficient balance', $this->id(), [
                    'balance' => $balance,
                    'required' => $amount,
                    'currency' => $currency,
                ]);
        } catch (\Throwable) {
            return AccessDecision::deny('Wallet check failed', $this->id());
        }
    }
}
