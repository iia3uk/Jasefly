<?php
/**
 * Example local config for Jasefly CMS.
 * Copy to config.local.php and replace YOUR_* placeholders.
 * NEVER commit config.local.php.
 */
return [
    'app_url' => 'https://YOUR_DOMAIN',
    'jwt_secret' => 'YOUR_SECRET',
    'jwt_ttl' => 3600,
    'refresh_ttl' => 604800,
    'cors_origins' => 'https://YOUR_DOMAIN',
    'upload_max_mb' => 10,
    'db_driver' => 'mysql',
    'db_host' => 'YOUR_DATABASE_HOST',
    'db_port' => '3306',
    'db_name' => 'YOUR_DATABASE_NAME',
    'db_user' => 'YOUR_DATABASE_USER',
    'db_pass' => 'YOUR_DATABASE_PASSWORD',
    'db_charset' => 'utf8mb4',
    // 'db_path' => 'storage/sqlite/cms.sqlite',
];
