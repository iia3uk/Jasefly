<?php
declare(strict_types=1);

/**
 * Import a JSON content pack into an installed Jasefly CMS.
 *
 * Browser:  /import-content.php  or  /api/import-content.php
 * CLI:      php import-content.php [path/to/content-pack.json]
 *
 * Safe: does NOT wipe admin users or config.local.php.
 * Replaces list content tables and updates singletons (id=1).
 * Lock: storage/.content_imported — use ?force=1 or delete the lock to re-run.
 */

use App\Support\ContentPackImporter;

$root = __DIR__;
$configFile = "$root/config/config.local.php";
$lock = "$root/storage/.content_imported";
$defaultPack = "$root/storage/content-pack.json";
$isCli = PHP_SAPI === 'cli';
$force = $isCli || (isset($_GET['force']) && $_GET['force'] === '1') || (isset($_POST['force']) && $_POST['force'] === '1');

require_once "$root/src/Support/ContentPackImporter.php";

function importRespond(string $htmlOrText, int $code = 200, bool $cli = false): never
{
    if ($cli) {
        echo strip_tags(str_replace(['<br>', '<br/>', '<br />'], PHP_EOL, $htmlOrText)) . PHP_EOL;
        exit($code >= 400 ? 1 : 0);
    }
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>Импорт контента</title>';
    echo '<style>body{font-family:system-ui,sans-serif;background:#0a0a0b;color:#e8e8ea;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5}';
    echo 'a{color:#8eb6ff}code,pre{background:#16161a;padding:2px 6px;border-radius:6px}pre{padding:12px;overflow:auto}';
    echo 'form{margin-top:24px;padding:20px;border:1px solid #333;border-radius:12px}';
    echo 'button{background:#fff;color:#111;border:0;padding:10px 18px;border-radius:999px;font-weight:600;cursor:pointer}';
    echo 'input[type=file]{margin:12px 0;display:block}label{display:flex;gap:8px;align-items:center;margin:12px 0}.ok{color:#86efac}.err{color:#fca5a5}</style></head><body>';
    echo $htmlOrText;
    echo '</body></html>';
    exit;
}

function importRenderForm(string $message = '', bool $error = false): never
{
    $cls = $error ? 'err' : 'ok';
    $body = $message !== '' ? "<p class=\"$cls\">$message</p>" : '';
    $body .= <<<'HTML'
<h1>Импорт контент-пака</h1>
<p>Загрузите <code>content-pack.json</code> или положите файл в <code>api/storage/content-pack.json</code>.</p>
<p>Контент сайта будет <strong>перезаписан</strong>. Логин админа и config не меняются. Картинки потом — в медиатеке.</p>
<form method="post" enctype="multipart/form-data">
  <input type="hidden" name="force" value="1">
  <label>Файл JSON <input type="file" name="pack" accept="application/json,.json"></label>
  <label><input type="checkbox" name="use_storage" value="1"> Использовать storage/content-pack.json (если файл не выбран)</label>
  <button type="submit">Импортировать</button>
</form>
<p style="margin-top:24px;font-size:13px;color:#8f8f98">После импорта удалите <code>import-content.php</code> (и shim в корне, если есть).</p>
HTML;
    importRespond($body);
}

if (!$isCli && $_SERVER['REQUEST_METHOD'] !== 'POST' && empty($_GET['run'])) {
    if (is_file($lock) && !$force) {
        importRenderForm('Импорт уже выполнялся. Отметьте force или откройте с ?force=1 / загрузите файл снова.');
    }
    importRenderForm();
}

if (is_file($lock) && !$force) {
    $msg = 'Import already done. Use ?force=1 or delete storage/.content_imported';
    importRespond($isCli ? $msg : "<p class=\"err\">$msg</p>", 403, $isCli);
}

if (!is_file($configFile)) {
    importRespond($isCli ? 'config.local.php missing' : '<p class="err">config.local.php отсутствует. Сначала install.php.</p>', 503, $isCli);
}

$local = require $configFile;

try {
    $pdo = new PDO(
        sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            $local['db_host'] ?? 'localhost',
            $local['db_name'] ?? '',
            $local['db_charset'] ?? 'utf8mb4'
        ),
        $local['db_user'] ?? '',
        $local['db_pass'] ?? '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Throwable $e) {
    importRespond('DB connection failed: ' . $e->getMessage(), 500, $isCli);
}

// Resolve pack path / contents
$json = null;
$source = '';

if ($isCli) {
    $cliPath = $argv[1] ?? $defaultPack;
    if (!is_file($cliPath)) {
        importRespond("Pack file not found: $cliPath", 404, true);
    }
    $json = file_get_contents($cliPath);
    $source = $cliPath;
} elseif (!empty($_FILES['pack']['tmp_name']) && is_uploaded_file($_FILES['pack']['tmp_name'])) {
    $json = file_get_contents($_FILES['pack']['tmp_name']);
    $source = $_FILES['pack']['name'] ?? 'upload';
} elseif ((!empty($_POST['use_storage']) || !empty($_GET['run'])) && is_file($defaultPack)) {
    $json = file_get_contents($defaultPack);
    $source = $defaultPack;
} elseif (is_file($defaultPack) && ($_SERVER['REQUEST_METHOD'] === 'POST' || !empty($_GET['run']))) {
    $json = file_get_contents($defaultPack);
    $source = $defaultPack;
} else {
    importRenderForm('Укажите JSON-файл или положите его в storage/content-pack.json', true);
}

$pack = json_decode((string) $json, true);
if (!is_array($pack)) {
    importRespond('Invalid JSON: ' . json_last_error_msg(), 400, $isCli);
}

try {
    $importer = new ContentPackImporter($pdo);
    $report = $importer->import($pack);

    if (!is_dir("$root/storage")) {
        mkdir("$root/storage", 0755, true);
    }
    // Keep a copy of the last imported pack for reference
    if ($source !== $defaultPack && is_string($json)) {
        file_put_contents($defaultPack, $json);
    }
    file_put_contents($lock, gmdate(DATE_ATOM) . "\nsource=$source\n");

    $lines = ["OK: content imported from $source", ''];
    foreach ($report as $k => $v) {
        $lines[] = sprintf('%s: %d', $k, $v);
    }
    $lines[] = '';
    $lines[] = 'Next: open / and /admin — upload images in Media library.';
    $lines[] = 'Delete import-content.php when done.';

    if ($isCli) {
        echo implode(PHP_EOL, $lines) . PHP_EOL;
        exit(0);
    }

    $pre = htmlspecialchars(implode("\n", $lines));
    importRespond(
        "<h1 class=\"ok\">Импорт выполнен</h1><pre>$pre</pre>"
        . '<p><a href="/">Сайт</a> · <a href="/admin/login">Админка</a></p>'
        . '<p>Удалите <code>import-content.php</code> после использования.</p>'
    );
} catch (Throwable $e) {
    importRespond(($isCli ? '' : '<p class="err">') . htmlspecialchars($e->getMessage()) . ($isCli ? '' : '</p>'), 500, $isCli);
}
