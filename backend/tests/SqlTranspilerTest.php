<?php
declare(strict_types=1);

/**
 * SqlTranspiler unit checks (no DB).
 */

use App\Core\Db\SqlTranspiler;

$t = new SqlTranspiler('sqlite');
$mysql = "DELETE rp FROM role_permissions rp\n"
    . "INNER JOIN roles r ON r.id = rp.role_id\n"
    . "INNER JOIN permissions p ON p.id = rp.permission_id\n"
    . "WHERE r.slug = 'admin' AND p.slug = 'system.manage'";

$out = $t->transpile($mysql);
assert_true(count($out) === 1, 'DELETE JOIN yields one sqlite statement');
assert_true(str_contains($out[0], 'DELETE FROM'), 'DELETE JOIN rewritten to DELETE FROM');
assert_true(str_contains($out[0], 'rowid IN'), 'DELETE JOIN uses rowid subquery on sqlite');
assert_true(str_contains($out[0], 'role_permissions'), 'DELETE JOIN keeps target table');

$pg = new SqlTranspiler('pgsql');
$pgOut = $pg->transpile($mysql);
assert_true(str_contains($pgOut[0] ?? '', 'ctid IN'), 'DELETE JOIN uses ctid on pgsql');

$mysqlPass = new SqlTranspiler('mysql');
$pass = $mysqlPass->transpile($mysql);
assert_true(($pass[0] ?? '') === $mysql || str_contains($pass[0] ?? '', 'DELETE rp FROM'), 'mysql dialect passes DELETE JOIN through');
