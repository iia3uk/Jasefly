<?php
declare(strict_types=1);

/**
 * Multi-step web installer for Jasefly CMS.
 * Supports MySQL (default), SQLite and PostgreSQL drivers.
 * On success it self-deletes all installer files from the host.
 */

$root = __DIR__;
$lock = "$root/storage/.installed";

if (is_file($lock)) {
    http_response_code(403);
    exit('Installer locked. Delete storage/.installed only if you intentionally need to reinstall.');
}

require __DIR__ . '/src/Core/Db/SqlTranspiler.php';

use App\Core\Db\SqlTranspiler;

/* INSTALLER_PLACEHOLDER */

function splitSql(string $sql): array
{
    $sql = str_replace(["\r\n", "\r"], "\n", $sql);
    $sql = preg_replace('/^--.*$/m', '', $sql) ?? $sql;
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql) ?? $sql;
    $sql = preg_replace('/^\s*USE\s+.+?;\s*/mi', '', $sql) ?? $sql;
    $parts = preg_split('/\s*;\s*/', $sql) ?: [];
    $out = [];
    foreach ($parts as $part) {
        $stmt = trim($part);
        if ($stmt === '' || preg_match('/^(--|#)/', $stmt)) {
            continue;
        }
        $out[] = $stmt;
    }
    return $out;
}

function driverAwareWipe(PDO $pdo, string $driver): void
{
    match ($driver) {
        'sqlite' => collectSqliteDrop($pdo),
        'pgsql' => pgsqlWipe($pdo),
        default => mysqlWipe($pdo),
    };
}

function mysqlWipe(PDO $pdo): void
{
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $rows = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_NUM);
    foreach ($rows as $row) {
        $name = str_replace('`', '``', (string) $row[0]);
        $pdo->exec("DROP TABLE IF EXISTS `$name`");
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}

function collectSqliteDrop(PDO $pdo): void
{
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN) as $t) {
        $pdo->exec('DROP TABLE IF EXISTS "' . str_replace('"', '""', (string) $t) . '"');
    }
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='trigger'")->fetchAll(PDO::FETCH_COLUMN) as $tr) {
        $pdo->exec('DROP TRIGGER IF EXISTS "' . str_replace('"', '""', (string) $tr) . '"');
    }
}

function pgsqlWipe(PDO $pdo): void
{
    $pdo->exec("SET session_replication_role = 'replica'");
    foreach ($pdo->query("SELECT tablename FROM pg_tables WHERE schemaname='public'")->fetchAll(PDO::FETCH_COLUMN) as $t) {
        $pdo->exec('DROP TABLE IF EXISTS "' . str_replace('"', '""', (string) $t) . '" CASCADE');
    }
    $pdo->exec("SET session_replication_role = 'origin'");
}

function runSqlFile(PDO $pdo, string $file, SqlTranspiler $t, bool $ignoreDuplicates = false): int
{
    if (!is_file($file)) {
        throw new RuntimeException("SQL file not found: $file");
    }
    $t->reset();
    $applied = 0;
    $i = 0;
    foreach (splitSql((string) file_get_contents($file)) as $statement) {
        $i++;
        foreach ($t->transpile($statement) as $out) {
            try {
                $pdo->exec($out);
                $applied++;
            } catch (Throwable $e) {
                $msg = strtolower($e->getMessage());
                if ($ignoreDuplicates && isIgnorableDup($msg)) {
                    continue;
                }
                $preview = substr(preg_replace('/\s+/', ' ', $out) ?? $out, 0, 180);
                throw new RuntimeException(
                    "SQL error in " . basename($file) . " (statement #$i):\n{$e->getMessage()}\n\nSQL: {$preview}",
                    0,
                    $e
                );
            }
        }
    }
    foreach ($t->drainTriggers() as $tr) {
        try { $pdo->exec($tr); $applied++; } catch (Throwable $e) {
            if (!isIgnorableDup(strtolower($e->getMessage()))) {
                throw new RuntimeException("Trigger error: " . $e->getMessage(), 0, $e);
            }
        }
    }
    return $applied;
}

function isIgnorableDup(string $msg): bool
{
    return str_contains($msg, 'duplicate column')
        || str_contains($msg, 'already exists')
        || str_contains($msg, 'duplicate key')
        || str_contains($msg, '1050') || str_contains($msg, '1060')
        || str_contains($msg, '1061') || str_contains($msg, '1062');
}

function execSql(PDO $pdo, string $sql, SqlTranspiler $t): void
{
    foreach ($t->transpile($sql) as $out) {
        $pdo->exec($out);
    }
}

function connectDb(array $c): array
{
    $driver = $c['driver'] ?? 'mysql';
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
    if ($driver === 'sqlite') {
        $path = $c['sqlite_path'] ?? '';
        if ($path === '') {
            $path = __DIR__ . '/storage/sqlite/cms.sqlite';
        }
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $pdo = new PDO('sqlite:' . $path, '', '', $opts);
        $pdo->exec('PRAGMA foreign_keys = ON');
        return [$pdo, 'sqlite'];
    }
    if ($driver === 'pgsql') {
        $host = $c['host'] ?? 'localhost';
        $port = (string) ($c['port'] ?? '');
        $name = str_replace(['"', "'"], '', $c['name'] ?? '');
        $user = $c['user'] ?? '';
        $pass = $c['pass'] ?? '';
        $dsn = "pgsql:host={$host}" . ($port !== '' ? ";port={$port}" : '') . ";dbname={$name}";
        try {
            return [new PDO($dsn, $user, $pass, $opts), 'pgsql'];
        } catch (PDOException $e) {
            // DB may not exist yet — connect to default 'postgres' db and create it.
            $serverDsn = "pgsql:host={$host}" . ($port !== '' ? ";port={$port}" : '') . ";dbname=postgres";
            try {
                $server = new PDO($serverDsn, $user, $pass, $opts);
            } catch (PDOException $ex) {
                throw enhanceAuthException($ex, $c);
            }
            try {
                $server->exec('CREATE DATABASE "' . str_replace('"', '""', $name) . '"');
            } catch (Throwable $ex) {
                throw new RuntimeException(
                    "Cannot create database `{$name}`: " . $ex->getMessage()
                    . "\nCreate the database in the hosting panel first, then run the installer again."
                );
            }
            return [new PDO($dsn, $user, $pass, $opts), 'pgsql'];
        }
    }
    // mysql
    return [connectMysql($c), 'mysql'];
}

function pdoDsn(string $host, string $charset, string $dbName = '', string $port = ''): string
{
    $dsn = "mysql:host={$host};charset={$charset}";
    if ($port !== '' && $port !== '3306') {
        $dsn .= ";port={$port}";
    }
    if ($dbName !== '') {
        $dsn .= ';dbname=' . str_replace(['"', ';'], '', $dbName);
    }
    return $dsn;
}

function connectMysql(array $c): PDO
{
    $host = $c['host'];
    $user = $c['user'];
    $pass = $c['pass'] ?? '';
    $charset = $c['charset'] ?? 'utf8mb4';
    $port = (string) ($c['port'] ?? '');
    $dbName = str_replace('`', '', $c['name']);
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
    try {
        return new PDO(pdoDsn($host, $charset, $dbName, $port), $user, $pass, $opts);
    } catch (PDOException $directEx) {
        if (str_contains($directEx->getMessage(), '1045') || str_contains($directEx->getMessage(), 'Access denied')) {
            throw enhanceAuthException($directEx, $c);
        }
    }
    try {
        $server = new PDO(pdoDsn($host, $charset, '', $port), $user, $pass, $opts);
    } catch (PDOException $ex) {
        throw enhanceAuthException($ex, $c);
    }
    try {
        $server->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET $charset COLLATE {$charset}_unicode_ci");
    } catch (Throwable $ex) {
        throw new RuntimeException(
            "Cannot create database `{$dbName}`: " . $ex->getMessage()
            . "\nCreate the database in the hosting panel first, then run the installer again."
        );
    }
    return new PDO(pdoDsn($host, $charset, $dbName, $port), $user, $pass, $opts);
}

function enhanceAuthException(PDOException $ex, array $c): RuntimeException
{
    $msg = $ex->getMessage();
    $hint = '';
    if (str_contains($msg, '1045') || stripos($msg, 'Access denied') !== false) {
        $hint = "\n\nHints:\n1. Copy DB name/user/password again from the hosting panel.\n"
            . "2. If host is `localhost`, try `127.0.0.1`.\n"
            . "3. Passwords with % # & are supported — enter them exactly.\n"
            . "4. User tried: `{$c['user']}` @ `{$c['host']}` / database `{$c['name']}`.";
    }
    return new RuntimeException($msg . $hint, (int) $ex->getCode(), $ex);
}

function install(array $c): string
{
    global $root, $lock;
    $c = normalizeInstallInput($c);
    $driver = $c['driver'] ?? 'mysql';

    if ($driver === 'mysql' || $driver === 'pgsql') {
        foreach (['host', 'name', 'user'] as $k) {
            if (($c[$k] ?? '') === '') {
                throw new RuntimeException("Missing database $k");
            }
        }
    }

    [$pdo, $driver] = connectDb($c);
    $t = new SqlTranspiler($driver);

    driverAwareWipe($pdo, $driver);
    if ($driver === 'mysql') {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    }

    $schemaFile = is_file("$root/migrations/001_schema.sql")
        ? "$root/migrations/001_schema.sql"
        : "$root/database/migrations/001_schema.sql";
    runSqlFile($pdo, $schemaFile, $t, false);

    // Verify critical table exists.
    $usersOk = match ($driver) {
        'sqlite' => $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'")->fetch(),
        'pgsql' => $pdo->query("SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='users'")->fetch(),
        default => $pdo->query("SHOW TABLES LIKE 'users'")->fetch(),
    };
    if (!$usersOk) {
        throw new RuntimeException("Table `users` was not created from 001_schema.sql.");
    }

    foreach (['002_enterprise.sql', '003_site_templates.sql', '004_project_media.sql', '005_page_layouts.sql', '006_page_revisions.sql', '007_plugins.sql'] as $f) {
        $path = "$root/migrations/$f";
        if (is_file($path)) {
            runSqlFile($pdo, $path, $t, true);
        }
    }

    $seedFile = is_file("$root/migrations/002_seed.sql")
        ? "$root/migrations/002_seed.sql"
        : "$root/database/seeds/001_seed.sql";
    $demoPhp = "$root/migrations/demo_content.php";

    if (!empty($c['with_demo'])) {
        if (is_file($demoPhp)) {
            try {
                require_once $demoPhp;
                seedDemoContent($pdo);
            } catch (Throwable $e) {
                // Demo seeding is best-effort across drivers.
                @file_put_contents("$root/storage/.demo_error", $e->getMessage());
            }
        } elseif (is_file($seedFile)) {
            runSqlFile($pdo, $seedFile, $t, true);
            if (function_exists('applySingletonDemo')) {
                applySingletonDemo($pdo);
            }
        }
        @file_put_contents("$root/storage/.demo_seeded", gmdate(DATE_ATOM));
    } else {
        $cleanPhp = "$root/migrations/clean_base_seed.php";
        if (is_file($cleanPhp)) {
            try {
                require_once $cleanPhp;
                seedCleanInstall($pdo);
            } catch (Throwable $e) {
                @file_put_contents("$root/storage/.clean_seed_error", $e->getMessage());
                foreach (['profile', 'site_settings', 'theme_settings', 'seo_settings', 'footer_settings', 'hero_settings', 'contact_info', 'email_settings'] as $tbl) {
                    execSql($pdo, "INSERT INTO `$tbl` (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM `$tbl` WHERE id=1)", $t);
                }
            }
        } else {
            foreach (['profile', 'site_settings', 'theme_settings', 'seo_settings', 'footer_settings', 'hero_settings', 'contact_info', 'email_settings'] as $tbl) {
                execSql($pdo, "INSERT INTO `$tbl` (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM `$tbl` WHERE id=1)", $t);
            }
        }
    }

    if ($driver === 'mysql') {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    $adminEmail = strtolower(trim($c['admin_email'] ?? 'admin@example.com'));
    $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
    $hash = password_hash('Admin123!', $algo);
    $existing = $pdo->prepare('SELECT id FROM users WHERE email=?');
    $existing->execute([$adminEmail]);
    if ($existing->fetch()) {
        $pdo->prepare('UPDATE users SET password_hash=?, name=?, role=? WHERE email=?')
            ->execute([$hash, 'Administrator', 'super_admin', $adminEmail]);
    } else {
        $pdo->prepare('INSERT INTO users(email, password_hash, name, role) VALUES(?,?,?,?)')
            ->execute([$adminEmail, $hash, 'Administrator', 'super_admin']);
    }

    $appUrl = rtrim($c['app_url'] ?? '', '/') ?: 'https://your-domain.com';
    $local = [
        'app_url' => $appUrl,
        'jwt_secret' => bin2hex(random_bytes(48)),
        'jwt_ttl' => 3600,
        'refresh_ttl' => 604800,
        'cors_origins' => ($c['cors_origins'] ?? '') !== '' ? $c['cors_origins'] : $appUrl,
        'upload_max_mb' => 10,
        'db_driver' => $driver,
        'db_host' => $c['host'] ?? '',
        'db_port' => ($c['port'] ?? '') !== '' ? $c['port'] : '3306',
        'db_name' => str_replace('`', '', $c['name'] ?? ''),
        'db_user' => $c['user'] ?? '',
        'db_pass' => $c['pass'] ?? '',
        'db_charset' => $c['charset'] ?? 'utf8mb4',
        'db_path' => $driver === 'sqlite' ? ($c['sqlite_path'] ?? "$root/storage/sqlite/cms.sqlite") : '',
    ];

    if (!is_dir("$root/config")) {
        mkdir("$root/config", 0755, true);
    }
    if (!is_dir("$root/storage")) {
        mkdir("$root/storage", 0755, true);
    }

    file_put_contents("$root/config/config.local.php", "<?php\nreturn " . var_export($local, true) . ";\n", LOCK_EX);
    file_put_contents($lock, gmdate(DATE_ATOM));

    return "Installed successfully.\nDriver: {$driver}\nAdmin: {$adminEmail}\nPassword: Admin123!\nChange the password immediately after first login.";
}

function normalizeInstallInput(array $c): array
{
    $out = $c;
    foreach (['host', 'name', 'user', 'pass', 'app_url', 'cors_origins', 'admin_email', 'port', 'charset', 'driver', 'sqlite_path'] as $k) {
        if (array_key_exists($k, $out) && is_string($out[$k])) {
            $out[$k] = trim($out[$k]);
        }
    }
    $out['driver'] = in_array($out['driver'] ?? 'mysql', ['mysql', 'sqlite', 'pgsql'], true) ? ($out['driver'] ?? 'mysql') : 'mysql';
    $out['pass'] = (string) ($out['pass'] ?? '');
    $out['port'] = (string) ($out['port'] ?? '');
    $out['charset'] = ($out['charset'] ?? '') ?: 'utf8mb4';
    return $out;
}

/** Delete all installer files from the host after a successful install. */
function cleanupInstallerFiles(): void
{
    global $root;
    $targets = [
        "$root/install.php",
        "$root/api/install.php",
        "$root/install.html",
    ];
    foreach ($targets as $f) {
        if (is_file($f)) {
            @unlink($f);
        }
    }
}

function checkRequirements(): array
{
    $checks = [];
    $checks['PHP 8.1+'] = version_compare(PHP_VERSION, '8.1.0', '>=');
    $checks['PDO extension'] = extension_loaded('pdo');
    $checks['PDO MySQL'] = extension_loaded('pdo_mysql');
    $checks['PDO SQLite'] = extension_loaded('pdo_sqlite');
    $checks['PDO PostgreSQL'] = extension_loaded('pdo_pgsql');
    $checks['storage/ writable'] = is_writable(__DIR__ . '/storage') || @mkdir(__DIR__ . '/storage', 0775, true);
    $checks['config/ writable'] = is_writable(__DIR__ . '/config') || @mkdir(__DIR__ . '/config', 0755, true);
    return $checks;
}

function renderResult(bool $ok, string $msg): string
{
    $color = $ok ? '#3ddc84' : '#ff6b6b';
    $title = $ok ? 'Установка завершена' : 'Ошибка установки';
    $escaped = htmlspecialchars($msg);
    $body = $ok
        ? "<pre style=\"white-space:pre-wrap\">{$escaped}</pre>"
            . "<p style=\"color:#8b95a8\">Файлы установки были автоматически удалены с хостинга. "
            . "Откройте <code>/admin/login</code> и смените пароль администратора.</p>"
        : "<pre style=\"white-space:pre-wrap;color:#ffb4b4\">{$escaped}</pre>"
            . "<p style=\"color:#8b95a8\">Исправьте проблему и повторите установку. Файл <code>install.php</code> сохранён.</p>";
    return <<<HTML
<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{$title}</title>
<style>
body{font-family:ui-sans-serif,system-ui;background:#06080c;color:#f4f6fa;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
.card{width:min(560px,96vw);background:#0e1219;border:1px solid #1c2430;border-radius:16px;padding:28px}
h1{margin:0 0 12px;font-size:1.35rem;color:{$color}}
code{background:#0a0e14;padding:2px 6px;border-radius:6px}
</style></head><body>
<div class="card"><h1>{$title}</h1>{$body}</div></body></html>
HTML;
}

function renderWizard(): string
{
    $checks = checkRequirements();
    $checkRows = '';
    foreach ($checks as $label => $pass) {
        $icon = $pass ? '✓' : '✕';
        $c = $pass ? '#3ddc84' : '#ff6b6b';
        $checkRows .= "<li style=\"color:{$c}\">{$icon} {$label}</li>";
    }
    $allOk = !in_array(false, $checks, true);
    $disabled = $allOk ? '' : 'disabled';
    return <<<HTML
<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Jasefly CMS — Установка</title>
<style>
*{box-sizing:border-box}
body{font-family:ui-sans-serif,system-ui;background:#06080c;color:#f4f6fa;margin:0;padding:24px;display:flex;justify-content:center;min-height:100vh}
.wiz{width:min(560px,96vw);background:#0e1219;border:1px solid #1c2430;border-radius:16px;padding:28px}
h1{margin:0 0 4px;font-size:1.4rem}
.steps{display:flex;gap:6px;margin:0 0 20px}
.step{flex:1;height:4px;border-radius:2px;background:#1c2430}
.step.active{background:#5b8cff}
.step.done{background:#3ddc84}
.pane{display:none}.pane.show{display:grid;gap:12px}
label{font-size:12px;color:#8b95a8}
input,select{padding:11px 13px;border-radius:10px;border:1px solid #243044;background:#0a0e14;color:#fff;width:100%}
.row{display:grid;gap:6px}
.btns{display:flex;gap:8px;margin-top:6px}
button{padding:12px 16px;border-radius:10px;border:none;font-weight:600;cursor:pointer;width:100%}
.btn-primary{background:#5b8cff;color:#fff}
.btn-ghost{background:#1c2430;color:#cfd6e4}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.check{display:flex;gap:8px;align-items:center;font-size:14px;color:#cfd6e4}
.check input{width:auto}
.hint{margin:0;color:#8b95a8;font-size:13px;line-height:1.45}
ul{margin:0 0 12px;padding-left:0;list-style:none;font-size:13px}
.driver-opt{display:flex;gap:8px;flex-wrap:wrap}
.driver-opt label{flex:1;border:1px solid #243044;border-radius:10px;padding:10px;text-align:center;cursor:pointer;font-size:14px;color:#cfd6e4}
.driver-opt input{display:none}
.driver-opt input:checked+span{color:#5b8cff;font-weight:600}
.driver-opt label:has(input:checked){border-color:#5b8cff;background:#11192a}
</style></head><body>
<form method="post" class="wiz" autocomplete="off" id="f">
<h1>Установка Jasefly CMS</h1>
<div class="steps"><div class="step active" id="bar1"></div><div class="step" id="bar2"></div><div class="step" id="bar3"></div></div>

<div class="pane show" id="p1">
  <p class="hint">Проверка окружения сервера.</p>
  <ul>{$checkRows}</ul>
  <p class="hint">Выберите драйвер базы данных. MySQL — по умолчанию. SQLite хранит данные в файле (не требует сервера БД). PostgreSQL — для продвинутых развёртываний.</p>
  <div class="driver-opt">
    <label><input type="radio" name="driver" value="mysql" checked onclick="setDriver('mysql')"><span>MySQL</span></label>
    <label><input type="radio" name="driver" value="sqlite" onclick="setDriver('sqlite')"><span>SQLite</span></label>
    <label><input type="radio" name="driver" value="pgsql" onclick="setDriver('pgsql')"><span>PostgreSQL</span></label>
  </div>
  <div class="btns"><button type="button" class="btn-primary" onclick="go(2)" {$disabled}>Далее →</button></div>
</div>

<div class="pane" id="p2">
  <p class="hint">Параметры подключения к базе данных.</p>
  <div class="row" data-mysql data-pgsql><label>Хост</label><input name="host" value="localhost"></div>
  <div class="row" data-mysql data-pgsql><label>Порт (пусто = по умолчанию)</label><input name="port" placeholder="3306"></div>
  <div class="row" data-mysql data-pgsql><label>Имя базы данных</label><input name="name" placeholder="jasefly_cms"></div>
  <div class="row" data-mysql data-pgsql><label>Пользователь</label><input name="user" placeholder="root"></div>
  <div class="row" data-mysql data-pgsql><label>Пароль</label><input name="pass" type="password" placeholder="Пароль"></div>
  <div class="row" data-mysql><label>Кодировка</label><input name="charset" value="utf8mb4"></div>
  <div class="row" data-sqlite style="display:none"><label>Путь к файлу SQLite</label><input name="sqlite_path" placeholder="storage/sqlite/cms.sqlite"></div>
  <p class="hint" data-sqlite style="display:none">SQLite создаст файл автоматически. Каталог должен быть доступен для записи.</p>
  <p class="hint" data-mysql data-pgsql>Если ошибка 1045 — смените хост с <code>localhost</code> на <code>127.0.0.1</code>.</p>
  <div class="btns"><button type="button" class="btn-ghost" onclick="go(1)">← Назад</button><button type="button" class="btn-primary" onclick="go(3)">Далее →</button></div>
</div>

<div class="pane" id="p3">
  <p class="hint">Параметры сайта и администратора.</p>
  <div class="row"><label>URL сайта</label><input name="app_url" placeholder="https://example.com" required></div>
  <div class="row"><label>CORS origin (обычно = URL сайта)</label><input name="cors_origins" placeholder="https://example.com"></div>
  <div class="row"><label>Email администратора</label><input name="admin_email" type="email" placeholder="admin@example.com" required></div>
  <label class="check"><input type="checkbox" name="with_demo" value="1"> Загрузить демо-контент (Jasefly Demo — легко удалить)</label>
  <p class="hint">По умолчанию ставится чистый сайт: Jasefly CMS, пустая главная, About и Privacy. Пароль администратора: <code>Admin123!</code> — смените после входа.</p>
  <div class="btns"><button type="button" class="btn-ghost" onclick="go(2)">← Назад</button><button type="submit" class="btn-primary">Установить</button></div>
</div>

</form>
<script>
let cur=1;
function go(n){
  document.getElementById('p'+cur).classList.remove('show');
  document.getElementById('p'+n).classList.add('show');
  for(let i=1;i<=3;i++){const b=document.getElementById('bar'+i);b.className='step'+(i<n?' done':(i===n?' active':''));}
  cur=n; window.scrollTo(0,0);
}
function setDriver(d){
  document.querySelectorAll('[data-mysql],[data-pgsql],[data-sqlite]').forEach(el=>{
    const show=(el.dataset[d]!==undefined);
    el.style.display=show?'':'none';
  });
}
setDriver('mysql');
</script>
</body></html>
HTML;
}


if (PHP_SAPI === 'cli') {
    try {
        $args = [];
        foreach (array_slice($argv, 1) as $x) {
            [$k, $v] = array_pad(explode('=', $x, 2), 2, '1');
            $args[ltrim($k, '-')] = $v;
        }
        $cfg = [
            'driver' => $args['driver'] ?? 'mysql',
            'host' => $args['host'] ?? 'localhost',
            'port' => $args['port'] ?? '',
            'name' => $args['name'] ?? 'jasefly_cms',
            'user' => $args['user'] ?? 'root',
            'pass' => $args['pass'] ?? '',
            'sqlite_path' => $args['sqlite_path'] ?? '',
            'app_url' => $args['url'] ?? 'http://localhost:5173',
            'cors_origins' => $args['cors'] ?? ($args['url'] ?? 'http://localhost:5173'),
            'admin_email' => $args['email'] ?? 'admin@example.com',
            'with_demo' => isset($args['demo']) ? $args['demo'] : '0',
            'charset' => 'utf8mb4',
        ];
        echo install($cfg) . PHP_EOL;
        if (($args['keep'] ?? '0') !== '1') {
            cleanupInstallerFiles();
            echo "Installer files removed." . PHP_EOL;
        }
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . PHP_EOL);
        exit(1);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: text/html; charset=utf-8');
    try {
        $_POST['with_demo'] = isset($_POST['with_demo']) ? '1' : '';
        $result = install($_POST);
        cleanupInstallerFiles();
        echo renderResult(true, $result);
    } catch (Throwable $e) {
        http_response_code(400);
        echo renderResult(false, $e->getMessage());
    }
    exit;
}

// GET — render the wizard.
echo renderWizard();
exit;




