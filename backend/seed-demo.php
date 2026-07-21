<?php
declare(strict_types=1);

/**
 * Load demo content into an already-installed Jasefly CMS.
 *
 * Browser:  /seed-demo.php   (or /api/seed-demo.php)
 * CLI:      php seed-demo.php
 *
 * Safe: does NOT wipe admin users or config.local.php.
 * Deletes previous demo rows in content tables, then inserts [DEMO] samples.
 * Locks itself via storage/.demo_seeded — delete that file to re-run.
 */

$root = __DIR__;
$configFile = "$root/config/config.local.php";
$lock = "$root/storage/.demo_seeded";

if (is_file($lock) && PHP_SAPI !== 'cli' && (!isset($_GET['force']) || $_GET['force'] !== '1')) {
    http_response_code(403);
    exit('Demo already seeded. Open /seed-demo.php?force=1 to re-seed (content tables will be reset).');
}

if (!is_file($configFile)) {
    http_response_code(503);
    exit('config.local.php missing. Run install.php first.');
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
    http_response_code(500);
    exit('DB connection failed: ' . $e->getMessage());
}

function runSeedFile(PDO $pdo, string $file): void
{
    if (!is_file($file)) {
        throw new RuntimeException("Missing seed file: $file");
    }
    $sql = str_replace(["\r\n", "\r"], "\n", (string) file_get_contents($file));
    $sql = preg_replace('/^--.*$/m', '', $sql) ?? $sql;
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql) ?? $sql;
    $sql = preg_replace('/^\s*USE\s+.+?;\s*/mi', '', $sql) ?? $sql;
    $parts = preg_split('/\s*;\s*/', $sql) ?: [];
    foreach ($parts as $part) {
        $stmt = trim($part);
        if ($stmt === '' || preg_match('/^(--|#)/', $stmt)) {
            continue;
        }
        // Skip user inserts — keep the real admin account from install
        if (preg_match('/^(DELETE\s+FROM|INSERT\s+INTO)\s+`?users`?/i', $stmt)) {
            continue;
        }
        $pdo->exec($stmt);
    }
}

function clearContent(PDO $pdo): void
{
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $tables = [
        'project_tag_pivot', 'project_technologies', 'project_features', 'project_timeline', 'project_media',
        'blog_post_tags', 'blog_posts', 'blog_tags', 'blog_categories',
        'projects', 'project_categories', 'project_tags',
        'skills', 'skill_categories',
        'experience', 'education', 'services', 'testimonials', 'statistics', 'social_links',
        'navigation_items', 'homepage_sections', 'contact_messages',
    ];
    foreach ($tables as $t) {
        $pdo->exec("DELETE FROM `$t`");
    }
    // Reset AUTO_INCREMENT
    foreach ($tables as $t) {
        try {
            $pdo->exec("ALTER TABLE `$t` AUTO_INCREMENT = 1");
        } catch (Throwable $e) {
            // ignore
        }
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}

try {
    clearContent($pdo);

    $seedFile = is_file("$root/migrations/002_seed.sql")
        ? "$root/migrations/002_seed.sql"
        : "$root/database/seeds/001_seed.sql";

    // Demo payload is also embedded here for hosting where seed SQL may be outdated
    $demoPhp = "$root/migrations/demo_content.php";
    if (is_file($demoPhp)) {
        require $demoPhp;
        seedDemoContent($pdo);
    } else {
        runSeedFile($pdo, $seedFile);
        // Ensure singletons get demo values even if SQL used INSERT that skipped
        applySingletonDemo($pdo);
    }

    if (!is_dir("$root/storage")) {
        mkdir("$root/storage", 0755, true);
    }
    file_put_contents($lock, gmdate(DATE_ATOM));

    $msg = "Demo content loaded successfully.\nOpen / and /admin — then delete seed-demo.php.";
    if (PHP_SAPI === 'cli') {
        echo $msg . PHP_EOL;
    } else {
        echo '<pre>' . htmlspecialchars($msg) . '</pre>';
        echo '<p><a href="/">Open site</a> · <a href="/admin/login">Admin</a></p>';
        echo '<p><strong>Delete</strong> <code>/seed-demo.php</code> and <code>/api/seed-demo.php</code> after use.</p>';
    }
} catch (Throwable $e) {
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, $e->getMessage() . PHP_EOL);
        exit(1);
    }
    http_response_code(500);
    echo '<pre>' . htmlspecialchars($e->getMessage()) . '</pre>';
}

function applySingletonDemo(PDO $pdo): void
{
    $pdo->exec("UPDATE profile SET
        name='Jasefly Demo',
        job_title='Demo profile (delete me)',
        short_bio='[DEMO] Sample profile for exploring Jasefly CMS.',
        bio='<p><strong>[DEMO]</strong> Replace from the admin panel.</p>',
        location='Demo City',
        availability_status='Demo only',
        years_experience=1
      WHERE id=1");

    $pdo->exec("UPDATE hero_settings SET
        headline='[DEMO] Welcome to Jasefly CMS',
        subheadline='Sample homepage copy — replace in admin.',
        badge_text='Demo content',
        primary_cta_label='About', primary_cta_href='/about',
        secondary_cta_label='Privacy', secondary_cta_href='/privacy',
        show_scroll_indicator=1, animation_style='fade'
      WHERE id=1");

    $pdo->exec("UPDATE site_settings SET site_name='Jasefly CMS (Demo)', locale='en', posts_per_page=9, projects_per_page=12 WHERE id=1");

    $pdo->exec("UPDATE seo_settings SET
        site_title='Jasefly CMS — Demo',
        site_description='[DEMO] Modular AI-ready CMS sample site.',
        site_keywords='jasefly, cms, demo',
        og_title='Jasefly CMS — Demo',
        og_description='[DEMO] Sample site.'
      WHERE id=1");

    $pdo->exec("UPDATE contact_info SET
        email='demo@example.com', phone='', address='Demo only', city='',
        form_enabled=1, form_success_message='[DEMO] Configure real contact details in admin.'
      WHERE id=1");

    $pdo->exec("UPDATE footer_settings SET
        copyright_text='© {year} Jasefly CMS — Demo content',
        tagline='[DEMO] Modular AI-ready CMS',
        show_social=1
      WHERE id=1");

    $pdo->exec("UPDATE theme_settings SET
        preset='midnight', primary_color='#5b8cff', accent_color='#8eb6ff',
        background_color='#06080c', surface_color='#0e1219',
        text_color='#f4f6fa', muted_color='#8b95a8',
        font_display='Sora', font_body='DM Sans', border_radius='14px', glass_opacity=0.08
      WHERE id=1");
}
