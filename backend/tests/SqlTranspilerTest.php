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

// SQLite updated_at triggers must use rowid (tables without id: settings_kv, modules, _migration_state)
$trigT = new SqlTranspiler('sqlite');
$createKv = "CREATE TABLE settings_kv (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB";
$trigT->transpile($createKv);
$triggers = $trigT->drainTriggers();
assert_true(count($triggers) === 1, 'settings_kv yields one sqlite updated_at trigger');
assert_true(str_contains($triggers[0], 'rowid = OLD.rowid'), 'sqlite updated_at trigger uses rowid not id');
assert_true(!str_contains($triggers[0], 'OLD."id"'), 'sqlite updated_at trigger does not reference OLD.id');

// MODIFY without COLUMN is MySQL-only — sqlite no-op (014_project_media_url.sql)
$modT = new SqlTranspiler('sqlite');
$modOut = $modT->transpile('ALTER TABLE project_media MODIFY media_id INT UNSIGNED NULL');
assert_true($modOut === [], 'sqlite skips MODIFY without COLUMN keyword');
$modColOut = $modT->transpile('ALTER TABLE project_media MODIFY COLUMN media_id INT UNSIGNED NULL');
assert_true($modColOut === [], 'sqlite skips MODIFY COLUMN');

// MySQL index prefix lengths must be stripped for sqlite CREATE INDEX
$idxT = new SqlTranspiler('sqlite');
$idxCreate = "CREATE TABLE module_files (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module_slug VARCHAR(80) NOT NULL,
  relative_path VARCHAR(500) NOT NULL,
  UNIQUE KEY uq_module_file (module_slug, relative_path(191))
) ENGINE=InnoDB";
$idxOut = $idxT->transpile($idxCreate);
$idxSql = implode("\n", $idxOut);
assert_true(str_contains($idxSql, 'CREATE UNIQUE INDEX'), 'prefix-length KEY extracted to CREATE INDEX');
assert_true(!str_contains($idxSql, '(191)'), 'MySQL index prefix length stripped for sqlite');
assert_true(substr_count($idxSql, '(') === substr_count($idxSql, ')'), 'CREATE INDEX SQL has balanced parentheses');
