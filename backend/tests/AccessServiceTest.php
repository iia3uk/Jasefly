<?php
declare(strict_types=1);

/**
 * AccessService DSL + layout filter — included from run.php (uses global assert_true).
 * No DB required: auth provider + fail-closed registry behaviour.
 */

use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;
use App\Platform\Access\AccessProviderRegistry;
use App\Platform\Access\AccessService;
use App\Platform\Access\Providers\AuthAccessProvider;

$registry = new AccessProviderRegistry();
$svc = new AccessService($registry, null);
$svc->registerBuiltins();

// —— empty rule allows (compat) ——
$empty = $svc->can(null, null);
assert_true($empty->allowed === true, 'empty rule allows');

// —— auth guest / authenticated ——
$guestOk = $svc->can(null, [
    'version' => 1,
    'op' => 'all',
    'rules' => [['provider' => 'auth', 'assert' => 'guest']],
]);
assert_true($guestOk->allowed === true, 'guest assert allows anonymous');

$authDeny = $svc->can(null, [
    'version' => 1,
    'op' => 'all',
    'rules' => [['provider' => 'auth', 'assert' => 'authenticated']],
]);
assert_true($authDeny->allowed === false, 'authenticated denies guest');

$authOk = $svc->can(7, [
    'version' => 1,
    'op' => 'all',
    'rules' => [['provider' => 'auth', 'assert' => 'authenticated']],
]);
assert_true($authOk->allowed === true, 'authenticated allows user');

// —— any / all / not ——
$any = $svc->can(null, [
    'version' => 1,
    'op' => 'any',
    'rules' => [
        ['provider' => 'auth', 'assert' => 'authenticated'],
        ['provider' => 'auth', 'assert' => 'guest'],
    ],
]);
assert_true($any->allowed === true, 'any: guest branch allows');

$all = $svc->can(null, [
    'version' => 1,
    'op' => 'all',
    'rules' => [
        ['provider' => 'auth', 'assert' => 'guest'],
        ['provider' => 'auth', 'assert' => 'authenticated'],
    ],
]);
assert_true($all->allowed === false, 'all: mixed guest+auth denies');

$not = $svc->can(null, [
    'version' => 1,
    'op' => 'not',
    'rules' => [['provider' => 'auth', 'assert' => 'authenticated']],
]);
assert_true($not->allowed === true, 'not: negates authenticated for guest');

// —— fail-closed unknown provider ——
$unknown = $svc->can(1, [
    'version' => 1,
    'op' => 'all',
    'rules' => [['provider' => 'nft', 'assert' => 'owns']],
]);
assert_true($unknown->allowed === false, 'unknown provider denies');
assert_true(str_contains((string) $unknown->reason, 'Unknown provider'), 'unknown provider reason');

// —— unavailable provider ——
$fake = new class implements AccessProviderInterface {
    public function id(): string { return 'custom.locked'; }
    public function label(): string { return 'Locked'; }
    public function asserts(): array { return [['id' => 'ok', 'label' => 'OK']]; }
    public function isAvailable(): bool { return false; }
    public function evaluate(?int $userId, string $assert, array $params = []): AccessDecision
    {
        return AccessDecision::allow($this->id());
    }
};
$svc->registerProvider($fake);
$unavail = $svc->can(1, [
    'version' => 1,
    'op' => 'all',
    'rules' => [['provider' => 'custom.locked', 'assert' => 'ok']],
]);
assert_true($unavail->allowed === false, 'unavailable provider denies');
assert_true(str_contains((string) $unavail->reason, 'unavailable'), 'unavailable reason');

// —— registry lists auth ——
$ids = array_column($svc->providers(), 'id');
assert_true(in_array('auth', $ids, true), 'providers include auth');

// —— filterLayout hide strips node ——
$layout = [
    'elements' => [
        [
            'type' => 'section',
            'id' => 's1',
            'elements' => [
                [
                    'type' => 'access-container',
                    'id' => 'ac1',
                    'settings' => [
                        'rule' => [
                            'version' => 1,
                            'op' => 'all',
                            'rules' => [['provider' => 'auth', 'assert' => 'authenticated']],
                        ],
                        'deny_mode' => 'hide',
                    ],
                    'elements' => [
                        ['type' => 'heading', 'id' => 'h1', 'settings' => ['text' => 'SECRET']],
                    ],
                ],
                [
                    'type' => 'heading',
                    'id' => 'public',
                    'settings' => ['text' => 'OK'],
                ],
            ],
        ],
    ],
];
$filtered = $svc->filterLayout($layout, null, false);
$sectionKids = $filtered['elements'][0]['elements'] ?? [];
assert_true(count($sectionKids) === 1, 'hide removes access-container');
assert_true(($sectionKids[0]['id'] ?? '') === 'public', 'public sibling kept');

// —— deny message keeps shell, strips children ——
$layout2 = [
    'elements' => [
        [
            'type' => 'access-container',
            'id' => 'ac2',
            'settings' => [
                'rule' => [
                    'version' => 1,
                    'op' => 'all',
                    'rules' => [['provider' => 'auth', 'assert' => 'authenticated']],
                ],
                'deny_mode' => 'message',
            ],
            'elements' => [
                ['type' => 'heading', 'id' => 'secret2', 'settings' => ['text' => 'LEAK']],
            ],
        ],
    ],
];
$filtered2 = $svc->filterLayout($layout2, null, false);
$shell = $filtered2['elements'][0] ?? [];
assert_true(($shell['id'] ?? '') === 'ac2', 'message mode keeps shell');
assert_true(($shell['elements'] ?? null) === [], 'message mode strips children');
assert_true(($shell['settings']['_access_denied'] ?? false) === true, 'message mode sets _access_denied');
$blob = json_encode($filtered2);
assert_true(!str_contains((string) $blob, 'LEAK'), 'secret text not in filtered layout');

// —— staff bypass ——
$bypass = $svc->filterLayout($layout2, null, true);
assert_true(count($bypass['elements'][0]['elements'] ?? []) === 1, 'staff bypass keeps children');

$reg2 = new AccessProviderRegistry();
$reg2->register(new AuthAccessProvider());
assert_true($reg2->has('auth'), 'registry has auth after register');
