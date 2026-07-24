#!/usr/bin/env node
'use strict';

/**
 * Jasefly CMS — one-click shared-hosting packager (Windows-friendly).
 * Usage: node scripts/build-hosting.js [--mode=full|update] [--domain=...] [--api-url=...] [--demo=yes|no] [--yes]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BACKEND = path.join(ROOT, 'backend');
const RELEASE = path.join(ROOT, 'release');
const PACKAGE_DIR = path.join(RELEASE, 'hosting-package');
const PUBLIC_HTML = path.join(PACKAGE_DIR, 'public_html');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
};

const TAG = {
  ok: `${C.green}[OK]${C.reset}`,
  info: `${C.cyan}[..]${C.reset}`,
  warn: `${C.yellow}[!!]${C.reset}`,
  err: `${C.red}[XX]${C.reset}`,
};

function say(tag, msg) {
  console.log(`${tag} ${msg}`);
}

function fail(msg) {
  say(TAG.err, msg);
  process.exit(1);
}

function which(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(cmd, [name], { encoding: 'utf8', shell: true });
  if (r.status !== 0) return null;
  return r.stdout.trim().split(/\r?\n/)[0] || null;
}

function findPhp() {
  const fromEnv = (process.env.PHP_BIN || '').trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const inPath = which('php');
  if (inPath) return inPath;
  const candidates = [
    path.join(ROOT, '.tools', 'php', 'php.exe'),
    'C:\\xampp\\php\\php.exe',
    'C:\\laragon\\bin\\php\\php-8.3*\\php.exe',
    'C:\\laragon\\bin\\php\\php-8.2*\\php.exe',
    'C:\\php\\php.exe',
  ];
  for (const pattern of candidates) {
    if (pattern.includes('*')) {
      const dir = path.dirname(pattern.slice(0, pattern.indexOf('*')));
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir).sort().reverse()) {
        const hit = path.join(dir, entry, 'php.exe');
        if (fs.existsSync(hit)) return hit;
      }
    } else if (fs.existsSync(pattern)) {
      return pattern;
    }
  }
  return null;
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32' && /\.cmd$/i.test(cmd),
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function ask(question, defaultValue = '') {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(defaultValue);
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const hint = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${hint}: `, (ans) => {
      rl.close();
      resolve((ans || '').trim() || defaultValue);
    });
  });
}

function parseArgs(argv) {
  const out = {
    mode: null,
    domain: null,
    apiUrl: null,
    demo: null,
    yes: false,
  };
  for (const a of argv) {
    if (a === '--yes' || a === '-y') out.yes = true;
    else if (a.startsWith('--mode=')) out.mode = a.slice(7);
    else if (a.startsWith('--domain=')) out.domain = a.slice(9);
    else if (a.startsWith('--api-url=')) out.apiUrl = a.slice(10);
    else if (a.startsWith('--demo=')) out.demo = a.slice(7);
  }
  return out;
}

/**
 * Read build-hosting.config.json from the repo root, if present.
 * Lets you persist packaging answers (mode/domain/apiUrl/demo) so the
 * bat runs without prompts. Schema (all fields optional):
 *   { "mode": "full"|"update", "domain": "https://...", "apiUrl": "", "demo": "yes"|"no" }
 */
function loadConfig() {
  const cfgPath = path.join(ROOT, 'build-hosting.config.json');
  if (!fs.existsSync(cfgPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    if (parsed.mode === 'full' || parsed.mode === 'update') out.mode = parsed.mode;
    if (typeof parsed.domain === 'string') out.domain = parsed.domain;
    if (typeof parsed.apiUrl === 'string') out.apiUrl = parsed.apiUrl;
    if (parsed.demo === 'yes' || parsed.demo === 'no') out.demo = parsed.demo;
    return out;
  } catch (e) {
    say(TAG.warn, `build-hosting.config.json: ${e.message}; ignoring file`);
    return {};
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function rmrf(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirFiltered(src, dest, shouldSkip) {
  if (!fs.existsSync(src)) return;
  mkdirp(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (shouldSkip(from, entry)) continue;
    if (entry.isDirectory()) copyDirFiltered(from, to, shouldSkip);
    else if (entry.isFile()) copyFile(from, to);
  }
}

function denyHtaccess() {
  return [
    'Options -Indexes',
    '<IfModule mod_authz_core.c>',
    '  Require all denied',
    '</IfModule>',
    '<IfModule !mod_authz_core.c>',
    '  Deny from all',
    '</IfModule>',
    '',
  ].join('\n');
}

/** Uploads may be readable via misconfig — never execute PHP there. */
function uploadsHtaccess() {
  return [
    '# Deny directory listing and PHP execution in uploads.',
    'Options -Indexes -ExecCGI',
    '<IfModule mod_php.c>',
    '  php_flag engine off',
    '</IfModule>',
    '<IfModule mod_php7.c>',
    '  php_flag engine off',
    '</IfModule>',
    '<IfModule mod_php8.c>',
    '  php_flag engine off',
    '</IfModule>',
    '<IfModule mod_mime.c>',
    '  RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .cgi .pl .py',
    '  RemoveType .php .phtml .php3 .php4 .php5 .php7 .php8 .phar',
    '  AddType text/plain .php .phtml .php3 .php4 .php5 .php7 .php8 .phar',
    '</IfModule>',
    '<FilesMatch "\\.(?i:php|phtml|php[3-8]|phar|cgi|pl|py|exe|sh)$">',
    '  <IfModule mod_authz_core.c>',
    '    Require all denied',
    '  </IfModule>',
    '  <IfModule !mod_authz_core.c>',
    '    Deny from all',
    '  </IfModule>',
    '</FilesMatch>',
    '',
  ].join('\n');
}

function publicApiHtaccess() {
  return [
    'Options -Indexes',
    '<IfModule mod_authz_core.c>',
    '  Require all granted',
    '</IfModule>',
    '<IfModule !mod_authz_core.c>',
    '  Allow from all',
    '</IfModule>',
    'RewriteEngine On',
    'RewriteCond %{HTTP:Authorization} .',
    'RewriteRule ^ - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]',
    'SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1',
    'RewriteCond %{REQUEST_FILENAME} !-f',
    'RewriteCond %{REQUEST_FILENAME} !-d',
    'RewriteRule ^ index.php [QSA,L]',
    '<IfModule mod_headers.c>',
    '  Header always set X-Content-Type-Options "nosniff"',
    '  Header always set X-Frame-Options "DENY"',
    '  Header always set Referrer-Policy "strict-origin-when-cross-origin"',
    '  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"',
    // Authenticated JSON must never be publicly cached (Beget/proxy + admin lists).
    '  Header always set Cache-Control "private, no-store, no-cache, must-revalidate"',
    '</IfModule>',
    '',
  ].join('\n');
}

function rootHtaccess() {
  return [
    'Options -Indexes',
    'DirectoryIndex index.php',
    'RewriteEngine On',
    'RewriteBase /',
    '',
    '# Canonical host: strip www in one hop (HTTPS enforced next if needed).',
    'RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]',
    'RewriteRule ^ https://%1%{REQUEST_URI} [R=301,L]',
    '',
    '# Force HTTPS (single hop). Skip if proxy already terminated TLS.',
    'RewriteCond %{HTTPS} !=on',
    'RewriteCond %{HTTP:X-Forwarded-Proto} !https [NC]',
    'RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]',
    '',
    '# Install guard: if the web installer is present and the CMS is not yet',
    '# installed (no api/storage/.installed lock), redirect every non-API',
    '# request to the installer. The installer self-deletes on success, so this',
    '# rule becomes inert after the first successful install.',
    'RewriteCond %{DOCUMENT_ROOT}/install.php -f',
    'RewriteCond %{DOCUMENT_ROOT}/api/storage/.installed !-f',
    'RewriteCond %{REQUEST_URI} !^/api/',
    'RewriteCond %{REQUEST_URI} !^/install\\.php$',
    'RewriteRule ^ /install.php [R=302,L]',
    '',
    '# Pass Authorization header through to PHP (JWT on CGI/FastCGI hosts)',
    'RewriteCond %{HTTP:Authorization} .',
    'RewriteRule ^ - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]',
    'SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1',
    '',
    '# Security: block sensitive backend paths if requested directly',
    'RewriteRule ^api/(config|src|migrations|storage|database|docs|routes)/ - [F,L]',
    'RewriteRule ^api/install\\.php$ - [F,L]',
    'RewriteRule ^api/router\\.php$ - [F,L]',
    'RewriteRule ^api/.*\\.(sql|md|env|log|bak)$ - [F,L]',
    '',
    '# Block .env and secrets anywhere under the site root',
    'RewriteRule (^|/)\\.env(\\..+)?$ - [F,L]',
    'RewriteRule (^|/)config\\.local\\.php$ - [F,L]',
    '',
    '<FilesMatch "(^|/)\\.env">',
    '  <IfModule mod_authz_core.c>',
    '    Require all denied',
    '  </IfModule>',
    '  <IfModule !mod_authz_core.c>',
    '    Deny from all',
    '  </IfModule>',
    '</FilesMatch>',
    '<FilesMatch "^\\.env">',
    '  <IfModule mod_authz_core.c>',
    '    Require all denied',
    '  </IfModule>',
    '  <IfModule !mod_authz_core.c>',
    '    Deny from all',
    '  </IfModule>',
    '</FilesMatch>',
    '',
    '# Prevent rewrite loop: never rewrite the PHP front controller onto itself',
    'RewriteRule ^api/public/ - [L]',
    '',
    '# One-shot PHP scripts under /api/ (importer, demo seeder) — do not send to REST router',
    'RewriteRule ^api/(import-content|seed-demo)\\.php$ - [L]',
    '',
    '# PHP REST API (/api/* -> api/public/index.php)',
    'RewriteCond %{REQUEST_URI} !^/api/public/',
    'RewriteRule ^api(?:/.*)?$ api/public/index.php [QSA,L]',
    '',
    '# SEO: sitemap & robots at site root',
    'RewriteRule ^sitemap\\.xml$ prerender.php?path=/sitemap.xml [L,QSA]',
    'RewriteRule ^robots\\.txt$ prerender.php?path=/robots.txt [L,QSA]',
    '',
    '# Never serve raw Vite shell — always go through index.php (SEO meta / bots)',
    'RewriteRule ^index\\.html$ index.php [L,QSA]',
    '',
    '# SEO: dynamic rendering for crawlers (HTML snapshot from DB)',
    '# Do not use !-f — `/` often maps to a static file and would skip bots.',
    'RewriteCond %{REQUEST_URI} !^/api/',
    'RewriteCond %{REQUEST_URI} !^/prerender\\.php',
    'RewriteCond %{REQUEST_URI} !^/index\\.php',
    'RewriteCond %{REQUEST_URI} !^/admin',
    // Exclude static .html (Yandex/Google webmaster verification at site root)
    'RewriteCond %{REQUEST_URI} !\\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map|txt|xml|html)$ [NC]',
    'RewriteCond %{HTTP_USER_AGENT} (googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|bytespider|gptbot|claudebot|google-inspectiontool|chrome-lighthouse|beget|site-?analyzer|screaming\\ frog|serpstat|megaindex|crawler|spider|preview|httpclient|python-requests) [NC]',
    'RewriteRule ^(.*)$ prerender.php?path=/$1 [L,QSA]',
    '',
    'RewriteCond %{QUERY_STRING} (^|&)(_escaped_fragment_|prerender=1)(&|$) [NC]',
    'RewriteCond %{REQUEST_URI} !^/api/',
    'RewriteCond %{REQUEST_URI} !^/prerender\\.php',
    'RewriteCond %{REQUEST_URI} !^/index\\.php',
    'RewriteCond %{REQUEST_URI} !\\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map)$ [NC]',
    'RewriteRule ^(.*)$ prerender.php?path=/$1&prerender=1 [L,QSA]',
    '',
    '# React SPA fallback → index.php (SEO-enriched shell)',
    'RewriteCond %{REQUEST_FILENAME} !-f',
    'RewriteCond %{REQUEST_FILENAME} !-d',
    'RewriteCond %{REQUEST_URI} !^/api/',
    'RewriteRule ^ index.php [L,QSA]',
    '',
    '<IfModule mod_deflate.c>',
    '  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json application/xml image/svg+xml',
    '</IfModule>',
    '',
    '<IfModule mod_headers.c>',
    '  Header always set X-Content-Type-Options "nosniff"',
    '  Header always set Referrer-Policy "strict-origin-when-cross-origin"',
    '  Header always set X-Frame-Options "SAMEORIGIN"',
    '  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"',
    '  Header always set Strict-Transport-Security "max-age=31536000"',
    // Compatible CSP: self + Google Fonts + same-origin API/media. No unsafe-eval.
    "  Header always set Content-Security-Policy \"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com; media-src 'self' blob: data:; worker-src 'self' blob:\"",
    '',
    '  <FilesMatch "\\.(?:js|css|woff2|woff|ttf|png|jpe?g|gif|webp|svg|ico|map)$">',
    '    Header set Cache-Control "public, max-age=31536000, immutable"',
    '  </FilesMatch>',
    '',
    '  SetEnvIf Request_URI "^/assets/" IMMUTABLE_ASSET',
    '  Header set Cache-Control "public, max-age=31536000, immutable" env=IMMUTABLE_ASSET',
    '',
    // HTML shell only. /api/* rewrites to api/public/index.php — must NOT inherit
    // public max-age (stale admin lists: contact-messages mark-read looked "frozen").
    '  SetEnvIf Request_URI "^/api/" IS_API',
    '  <Files "index.php">',
    '    Header set Cache-Control "public, max-age=300, must-revalidate" env=!IS_API',
    '  </Files>',
    '  <Files "spa.html">',
    '    Header set Cache-Control "public, max-age=300, must-revalidate"',
    '  </Files>',
    '  <Files "prerender.php">',
    '    Header set Cache-Control "public, max-age=300, must-revalidate"',
    '  </Files>',
    '</IfModule>',
    '',
  ].join('\n');
}

function apiRootHtaccess() {
  return [
    'Options -Indexes',
    '# Sensitive trees (config, src, migrations, storage, …) each have their own deny .htaccess.',
    '# Entry point is api/public/index.php via document-root rewrite of /api/*.',
    '',
  ].join('\n');
}

function productionConfigExample(domain) {
  const origin = domain ? domain.replace(/\/$/, '') : 'https://your-domain.com';
  return [
    '<?php',
    'declare(strict_types=1);',
    '/**',
    ' * Production configuration TEMPLATE — copy to config.local.php on the server',
    ' * OR run install.php once (recommended). Do not commit real secrets.',
    ' */',
    'return array(',
    "    'app_name' => 'Jasefly CMS',",
    `    'app_url' => '${origin}',`,
    "    'app_env' => 'production',",
    "    'jwt_secret' => 'REPLACE_WITH_LONG_RANDOM_SECRET_MIN_48_CHARS',",
    "    'jwt_ttl' => 3600,",
    "    'refresh_ttl' => 604800,",
    `    'cors_origins' => '${origin}',`,
    "    'upload_max_mb' => 10,",
    "    // Database driver: 'mysql' (default), 'sqlite' or 'pgsql'",
    "    'db_driver' => 'mysql',",
    "    'db_host' => 'localhost',",
    "    'db_name' => 'YOUR_DB_NAME',",
    "    'db_user' => 'YOUR_DB_USER',",
    "    'db_pass' => 'YOUR_DB_PASSWORD',",
    "    'db_charset' => 'utf8mb4',",
    "    // SQLite only (ignored for mysql/pgsql). Relative path resolves under api/storage/.",
    "    'db_path' => 'storage/sqlite/cms.sqlite',",
    ');',
    '',
  ].join('\n');
}

function envProductionExample(domain, apiUrl) {
  const origin = domain ? domain.replace(/\/$/, '') : 'https://your-domain.com';
  const api = apiUrl || origin;
  return [
    '# Frontend production build hints (used at build time only).',
    '# On shared hosting the SPA calls same-origin /api/v1 by default.',
    `# Domain: ${origin}`,
    `VITE_API_URL=${api === origin ? '' : api}`,
    '',
    '# Server-side DB credentials are NOT stored here — use install.php',
    '# or api/config/config.local.php on the host.',
    '',
  ].join('\n');
}

function installShim() {
  return [
    '<?php',
    'declare(strict_types=1);',
    '/**',
    ' * Web installer entry (full package only).',
    ' * After successful install: DELETE this file and lock/remove api/install.php',
    ' */',
    "require __DIR__ . '/api/install.php';",
    '',
  ].join('\n');
}

function deploymentRuMd(opts) {
  const domain = opts.domain || 'https://ваш-домен.ru';
  const apiUrl = opts.apiUrl || `${domain.replace(/\/$/, '')}/api/v1`;
  const isUpdate = opts.mode === 'update';
  const lines = [
    '# Развёртывание Jasefly CMS на обычный хостинг (Apache + PHP + MySQL)',
    '',
    isUpdate
      ? '> Это **пакет обновления**. Он не содержит установщик, медиафайлы и локальные секреты. Заливайте поверх существующей установки, не удаляя `storage/uploads` и базу данных.'
      : '> Это **полный установочный пакет**. После первой установки удалите установщик.',
    '',
    '## 1. Что загружать в `public_html`',
    '',
    'Распакуйте ZIP **прямо в корень** `public_html` (или `www` / `htdocs`).',
    'В архиве нет вложенной папки — сразу появятся `index.html`, `api/`, `.htaccess` и остальные файлы.',
    '',
    '- `index.html`, `assets/`, favicon и прочие статические файлы фронтенда',
    '- `.htaccess` (обязательно — маршрутизация SPA и API)',
    '- папку `api/` (PHP-бэкенд)',
    isUpdate ? '' : '- `install.php` (мастер первой установки — удалить после настройки)',
    isUpdate ? '- `migrate.php` (fallback; обычно не нужен — миграции накатываются сами из админки)' : '- `migrate.php` (fallback для апгрейда со старой БД)',
    '- `import-content.php` — загрузка content-pack.json (удалить после импорта)',
    '',
    'Документация (`DEPLOYMENT-RU.md`, `CONTENT_IMPORT.md`, `SECURITY.md`) лежит в репозитории / рядом с ZIP в `release/`, не в `public_html`.',
    '',
    'Структура на сервере после распаковки:',
    '',
    '```',
    'public_html/',
    '├── index.html',
    '├── assets/',
    '├── .htaccess',
    isUpdate ? '├── migrate.php         ← накат SQL после update' : '├── install.php          ← только при первой установке',
    isUpdate ? '' : '├── migrate.php',
    '└── api/',
    '    ├── public/index.php  ← точка входа API',
    '    ├── src/',
    '    ├── config/',
    '    ├── migrations/',
    '    └── storage/',
    '```',
    '',
    '## 2. Где лежит бэкенд',
    '',
    'Бэкенд размещается в `public_html/api/`. Запросы `/api/...` через `.htaccess` направляются в `api/public/index.php`.',
    'Прямой доступ к `config/`, `src/`, `migrations/`, `storage/` через HTTP закрыт.',
    '',
    '## 3. Создание базы MySQL',
    '',
    'В панели хостинга (phpMyAdmin / «Базы данных»):',
    '',
    '1. Создайте базу данных (например `jasefly_cms`).',
    '2. Создайте пользователя и пароль.',
    '3. Выдайте пользователю полные права на эту базу.',
    '4. Запомните: **хост** (часто `localhost`), **имя БД**, **логин**, **пароль**.',
    '',
    '## 4. Запуск установщика',
    '',
    isUpdate
      ? [
          'Пакет обновления **не включает** установщик. База и `config.local.php` уже должны существовать на сервере.',
          '',
          '### Миграции БД (автоматически)',
          '',
          'После заливки файлов просто зайдите в **админку**. CMS сама накатит pending SQL (`002`…`005_page_layouts.sql` и дальше).',
          '',
          'Если миграция упадёт — вверху админки появится **красная таблица** с файлом, текстом ошибки MySQL, куском SQL и кнопкой «Повторить миграции».',
          '',
          'Fallback (если админка недоступна):',
          '',
          `\`${domain.replace(/\/$/, '')}/migrate.php\``,
          '',
          'или по SSH: `cd public_html/api && php migrate.php`',
          '',
          'После успеха можно удалить `public_html/migrate.php` и `api/migrate.php`.',
        ].join('\n')
      : [
          'Откройте в браузере — при наличии `install.php` сайт сам перенаправит на установщик:',
          '',
          `\`${domain.replace(/\/$/, '')}/install.php\``,
          '',
          'Установщик — **многошаговый визард**:',
          '',
          '1. **Проверка окружения** (PHP, PDO-расширения, права на запись).',
          '2. **Выбор драйвера БД**: MySQL (по умолчанию), SQLite (файл, без сервера БД) или PostgreSQL.',
          '3. **Параметры БД** (для MySQL/PostgreSQL: хост, порт, имя БД, логин, пароль; для SQLite — путь к файлу).',
          '4. **Параметры сайта и администратора** (URL, email, демо-контент).',
          '',
          'После успешной установки визард **автоматически удалит** `install.php` и `api/install.php` с хостинга и создаст блокировку `api/storage/.installed`.',
          '',
          'Альтернатива (SSH):',
          '',
          '```bash',
          'cd public_html/api',
          `php install.php --driver=mysql --host=localhost --name=DB --user=USER --pass=PASS --url=${domain} --email=you@example.com --demo=0`,
          `# для SQLite:  php install.php --driver=sqlite --sqlite_path=storage/sqlite/cms.sqlite --url=${domain} --email=you@example.com --demo=0`,
          '```',
        ].join('\n'),
    '',
    '## 5. Какие каталоги должны быть доступны для записи',
    '',
    'Права записи (обычно `755` или `775`, иногда `777` на shared hosting):',
    '',
    '- `api/storage/`',
    '- `api/storage/uploads/`',
    '- `api/storage/thumbnails/`',
    '- `api/storage/backups/`',
    '- `api/storage/logs/`',
    '- `api/config/` (чтобы установщик мог создать `config.local.php`)',
    '',
    '## 6. Домен и API URL',
    '',
    `- Сайт: \`${domain}\``,
    `- API: \`${apiUrl}\` (фронтенд ходит на same-origin \`/api/v1\` по умолчанию)`,
    '- CORS и canonical URL задаются при установке (`app_url`, `cors_origins`).',
    '- Не оставляйте `localhost` в продакшен-конфиге.',
    '',
    '## 7. Админ-панель',
    '',
    `\`${domain.replace(/\/$/, '')}/admin/login\``,
    '',
    'После демо-установки пароль по умолчанию: **Admin123!** — смените сразу.',
    '',
    '## 8. Установщик удаляется автоматически',
    '',
    'После успешной установки визард **сам** удаляет `public_html/install.php` и `public_html/api/install.php`',
    'и создаёт блокировку `api/storage/.installed`. Дополнительно ничего делать не нужно.',
    '',
    'Если файлы по какой-то причине остались — удалите их вручную и убедитесь, что есть `api/storage/.installed`.',
    '',
    '## 9. SEO (prerender + enriched SPA shell)',
    '',
    'Вход на сайт — `index.php` (не пустой Vite `index.html`):',
    '- Посетители получают `spa.html` с вшитыми title / description / OG из БД.',
    '- Поисковые и соцботы (или `?prerender=1`) получают полный HTML с `<main>` из `prerender.php`.',
    '',
    '- Проверка meta: откройте исходник `https://ваш-домен/` — title не должен быть «Jasefly CMS».',
    '- Проверка контента для ботов: `https://ваш-домен/?prerender=1` — в исходнике `<h1>` и текст, `data-prerender="1"`.',
    '- Sitemap: `/sitemap.xml`, robots: `/robots.txt`.',
    '- В админке **SEO → Очистить кэш prerender** после крупных правок контента.',
    '',
    '## 10. Устранение неисправностей',
    '',
    '### 404 на маршрутах `/projects/...`, `/blog/...`, `/admin/login`',
    '- Проверьте, что загружен корневой `.htaccess`.',
    '- На хостинге должен быть включён `mod_rewrite` и `AllowOverride All`.',
    '',
    '### 404 / 500 на `/api/...`',
    '- Убедитесь, что есть `api/public/index.php`.',
    '- Смотрите логи PHP / `api/storage/logs`.',
    '- Проверьте версию PHP (≥ 8.2, рекомендуется 8.3) и расширение `pdo_mysql`.',
    '',
    '### CORS ошибки',
    '- В `api/config/config.local.php` укажите ваш реальный HTTPS-домен в `cors_origins` и `app_url`.',
    '',
    '### Ошибки БД',
    '- Проверьте хост/логин/пароль в `config.local.php`.',
    '- Убедитесь, что MySQL доступен с аккаунта сайта.',
    '',
    '## 11. Обновление сайта без потери медиа и БД',
    '',
    '### Способ A — из админки (рекомендуется)',
    '',
    '1. Соберите пакет: `build-hosting.bat` → Update (или `node scripts/build-hosting.js --mode=update`).',
    '2. В админке: **Система → Обновление CMS**.',
    '3. Загрузите `release/jasefly-cms-update-*.zip` и нажмите «Установить».',
    '4. Сайт сам распакует файлы, не тронет uploads / config.local.php / бэкапы, и накатит миграции.',
    '5. Обновите админку (Ctrl+F5).',
    '',
    'Нужно PHP-расширение `zip`. Если лимит загрузки маленький — поднимите `upload_max_filesize` / `post_max_size` в панели хостинга.',
    '',
    '### Способ B — вручную по FTP',
    '',
    '1. Соберите **пакет обновления** (`build-hosting.bat` → Update).',
    '2. Залейте поверх: статические файлы и `api/src`, `api/public`, новые миграции при необходимости.',
    '3. **Не удаляйте**: `api/storage/uploads`, `api/config/config.local.php`, базу MySQL.',
    '4. Не затирайте `.installed` без нужды.',
    '',
    '## 12. Безопасность (минимальный чеклист)',
    '',
    '### Уже в CMS',
    '',
    '- SQL только через PDO prepare (`Database::run`).',
    '- Пароли: Argon2id / `PASSWORD_DEFAULT` + rehash при входе.',
    '- 2FA (TOTP) в админке: **Система → Пароль**.',
    '- Загрузки: лимит размера, allowlist MIME; в `storage/uploads` PHP отключён.',
    '- Бэкапы: шифрованные файлы `*.sql.enc` в `api/storage/backups/` (ключ `backup_key` или `jwt_secret`).',
    '- Плагин **DDoS защита** (Cloudflare / DDoS-Guard / StormWall / Qrator) + origin shield.',
    '',
    '### На хостинге / VPS (сделайте вручную)',
    '',
    '1. **MySQL не слушает интернет** — `bind-address = 127.0.0.1`, remote MySQL выключен.',
    '2. **PHP не от root** — отдельный пользователь сайта.',
    '3. **Секреты вне публичного доступа** — `.env` / `config.local.php`, `.git`, логи и бэкапы не отдаются по HTTP (в пакете закрыты `.htaccess`; на VPS лучше вынести код выше `public_html`).',
    '4. **2FA** в панели хостинга, для SSH и в админке CMS.',
    '5. **SSH только по ключам**, `PermitRootLogin no`.',
    '6. Регулярные обновления PHP, ОС и зависимостей.',
    '7. **WAF + Anti-DDoS** перед сервером (edge), затем включите провайдера в плагине DDoS.',
    '8. Копируйте `*.sql.enc` в **отдельное** хранилище (не на тот же диск origin).',
    '9. Перед релизом — проход по OWASP Top 10 (см. `SECURITY.md` в репозитории).',
    '',
    '---',
    '',
    `Сборка: ${new Date().toISOString()} · режим: ${opts.mode}`,
    '',
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}

function validateProjectStructure() {
  const required = [
    'frontend/package.json',
    'frontend/vite.config.ts',
    'frontend/src/lib/api.ts',
    'backend/public/index.php',
    'backend/src/Bootstrap.php',
    'backend/config/app.php',
    'backend/install.php',
    'backend/migrations/001_schema.sql',
  ];
  for (const rel of required) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      fail(`Missing required project file: ${rel}`);
    }
  }
  say(TAG.ok, 'Project structure validated');
}

function shouldSkipBackend(absPath, entry) {
  const name = entry.name;
  const rel = path.relative(BACKEND, absPath).replace(/\\/g, '/');

  if (name === 'node_modules' || name === '.git' || name === '.dev') return true;
  if (name === 'config.local.php') return true;
  // Never ship live secrets; keep .env.example only
  if (name === '.env') return true;
  if (name.startsWith('.env.') && name !== '.env.example') return true;
  if (name === '.installed') return true;
  if (name === 'router.php') return true;
  if (name === 'README.md') return true;
  if (name === '.DS_Store' || name === 'Thumbs.db') return true;
  if (name.endsWith('.log') || name.endsWith('.bak')) return true;

  // Skip empty leftover folder and local dumps
  if (rel === 'api' || rel.startsWith('api/')) return true;

  // Skip storage contents (keep structure via explicit mkdir later)
  if (rel.startsWith('storage/uploads/') && name !== '.gitkeep') return true;
  if (rel.startsWith('storage/thumbnails/') && name !== '.gitkeep') return true;
  if (rel.startsWith('storage/backups/') && name !== '.gitkeep') return true;
  if (rel.startsWith('storage/logs/') && name !== '.gitkeep') return true;
  if (rel === 'storage') return true;

  // Skip docs except openapi.php (served by PHP)
  if (rel.startsWith('docs/') && name !== 'openapi.php') return true;

  return false;
}

function copyBackend(mode) {
  const dest = path.join(PUBLIC_HTML, 'api');
  say(TAG.info, 'Copying PHP backend runtime files → public_html/api/');
  copyDirFiltered(BACKEND, dest, shouldSkipBackend);

  if (mode === 'full') {
    // Storage skeleton (empty, writable) — full install only
    for (const sub of ['uploads', 'thumbnails', 'backups', 'logs', 'updates']) {
      const dir = path.join(dest, 'storage', sub);
      mkdirp(dir);
      writeFile(path.join(dir, '.gitkeep'), '');
    }
    writeFile(path.join(dest, 'storage', '.htaccess'), denyHtaccess());
    writeFile(path.join(dest, 'storage', 'uploads', '.htaccess'), uploadsHtaccess());
    writeFile(path.join(dest, 'storage', 'backups', '.htaccess'), denyHtaccess());
    writeFile(path.join(dest, 'storage', 'logs', '.htaccess'), denyHtaccess());
    writeFile(path.join(dest, 'storage', 'updates', '.htaccess'), denyHtaccess());
  } else {
    // Update packages must not touch existing media/storage on the server
    rmrf(path.join(dest, 'storage'));
  }

  writeFile(path.join(dest, '.htaccess'), apiRootHtaccess());
  writeFile(path.join(dest, 'public', '.htaccess'), publicApiHtaccess());
  writeFile(path.join(dest, 'config', '.htaccess'), denyHtaccess());
  writeFile(path.join(dest, 'src', '.htaccess'), denyHtaccess());
  writeFile(path.join(dest, 'migrations', '.htaccess'), denyHtaccess());
  if (fs.existsSync(path.join(dest, 'database'))) {
    writeFile(path.join(dest, 'database', '.htaccess'), denyHtaccess());
  }
  if (fs.existsSync(path.join(dest, 'docs'))) {
    writeFile(path.join(dest, 'docs', '.htaccess'), denyHtaccess());
  }
  if (fs.existsSync(path.join(dest, 'routes'))) {
    writeFile(path.join(dest, 'routes', '.htaccess'), denyHtaccess());
  }

  if (mode === 'update') {
    // Update packages must not ship installer or production config templates meant for first install
    const installPhp = path.join(dest, 'install.php');
    if (fs.existsSync(installPhp)) fs.unlinkSync(installPhp);
    for (const f of ['config.production.example.php', 'config.example.php']) {
      const p = path.join(dest, 'config', f);
      // keep config.example as safe empty template in update? User said exclude production configuration.
      // Keep app.php + database.php only; remove example templates to avoid confusion.
      if (f.includes('production') && fs.existsSync(p)) fs.unlinkSync(p);
    }
  }

  say(TAG.ok, 'Backend prepared');
}

function copyFrontendDist() {
  const dist = path.join(FRONTEND, 'dist');
  say(TAG.info, 'Copying compiled frontend → public_html/');
  for (const entry of fs.readdirSync(dist, { withFileTypes: true })) {
    const from = path.join(dist, entry.name);
    const to = path.join(PUBLIC_HTML, entry.name);
    if (entry.isDirectory()) {
      copyDirFiltered(from, to, () => false);
    } else {
      copyFile(from, to);
    }
  }
  // Rename Vite shell so DirectoryIndex cannot prefer an empty #root over index.php.
  // Keep a copy as index.html too (legacy zip markers / tools still probe for it).
  const builtIndex = path.join(PUBLIC_HTML, 'index.html');
  const spaHtml = path.join(PUBLIC_HTML, 'spa.html');
  if (fs.existsSync(builtIndex)) {
    if (fs.existsSync(spaHtml)) fs.unlinkSync(spaHtml);
    fs.renameSync(builtIndex, spaHtml);
    fs.copyFileSync(spaHtml, builtIndex);
    say(TAG.ok, 'Vite shell → spa.html (+ index.html copy for markers; entry is index.php)');
  }
  writeFile(path.join(PUBLIC_HTML, 'index.php'), rootIndexPhp());
  // Our generated root htaccess replaces any SPA-only dist one
  writeFile(path.join(PUBLIC_HTML, '.htaccess'), rootHtaccess());
  say(TAG.ok, 'Frontend dist copied');
}

/** Document-root entry: bots → prerender, humans → SPA with SEO meta from DB. */
function rootIndexPhp() {
  return `<?php
declare(strict_types=1);

/**
 * Public HTML entry (SEO).
 * - Search/social bots + ?prerender=1 → full HTML snapshot (PrerenderService)
 * - Humans / Webmaster "server response" → Vite spa.html with title/description/OG injected
 */

use App\\Bootstrap;
use App\\Services\\PrerenderService;

function jasefly_spa_path(): ?string
{
    foreach ([__DIR__ . '/spa.html', __DIR__ . '/index.html'] as $f) {
        if (is_file($f)) {
            return $f;
        }
    }
    return null;
}

function jasefly_spa_fail_open(): never
{
    $spa = jasefly_spa_path();
    header('Content-Type: text/html; charset=utf-8');
    if ($spa !== null) {
        readfile($spa);
        exit;
    }
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'SPA unavailable';
    exit;
}

try {
    require __DIR__ . '/api/src/Bootstrap.php';
    [$app, $db] = Bootstrap::init();

    $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
    $reqPath = parse_url($uri, PHP_URL_PATH);
    $reqPath = is_string($reqPath) && $reqPath !== '' ? $reqPath : '/';
    $path = '/' . trim(str_replace('\\\\', '/', $reqPath), '/');
    if ($path === '/index.php' || $path === '') {
        $path = '/';
    }

    $force = (isset($_GET['prerender']) && (string) $_GET['prerender'] === '1')
        || isset($_GET['_escaped_fragment_']);
    $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    $svc = new PrerenderService($db, $app);

    $sendCacheHeaders = static function (PrerenderService $svc, string $path): void {
        header('Cache-Control: public, max-age=300, must-revalidate');
        $lm = $svc->lastModifiedUnix($path);
        if ($lm !== null) {
            header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lm) . ' GMT');
            $ims = $_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? null;
            if (is_string($ims) && $ims !== '' && strtotime($ims) !== false && strtotime($ims) >= $lm) {
                http_response_code(304);
                exit;
            }
        }
    };

    if ($force || PrerenderService::isBot($ua)) {
        try {
            $result = $svc->render($path);
            if (!empty($result['redirect']) && in_array((int) $result['status'], [301, 302], true)) {
                header('Location: ' . $result['redirect'], true, (int) $result['status']);
                exit;
            }
            http_response_code((int) ($result['status'] ?? 200));
            header('Content-Type: text/html; charset=utf-8');
            $sendCacheHeaders($svc, $path);
            header('X-Prerender: ' . (!empty($result['cached']) ? 'cache' : 'fresh'));
            header('X-Robots-Tag: all');
            echo (string) ($result['html'] ?? '');
            exit;
        } catch (Throwable $preErr) {
            $logDir = __DIR__ . '/api/storage/logs';
            if (!is_dir($logDir)) {
                @mkdir($logDir, 0755, true);
            }
            @file_put_contents(
                $logDir . '/spa-index.log',
                date('c') . ' prerender ' . $preErr->getMessage() . "\\n",
                FILE_APPEND
            );
            // fall through to enriched SPA
        }
    }

    $spa = jasefly_spa_path();
    if ($spa === null) {
        jasefly_spa_fail_open();
    }
    $html = (string) file_get_contents($spa);
    header('Content-Type: text/html; charset=utf-8');
    $sendCacheHeaders($svc, $path);
    header('X-Jasefly-Shell: enriched');
    echo $svc->enrichSpaHtml($html, $path);
    exit;
} catch (Throwable $e) {
    $logDir = __DIR__ . '/api/storage/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    @file_put_contents(
        $logDir . '/spa-index.log',
        date('c') . ' ' . $e->getMessage() . "\\n",
        FILE_APPEND
    );
    jasefly_spa_fail_open();
}
`;
}

function collectFiles(dir, base = dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, base, list);
    else list.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return list;
}

function validatePackage(mode, opts) {
  say(TAG.info, 'Validating packaging output...');
  const errors = [];

  const mustExist = [
    'spa.html',
    'index.php',
    '.htaccess',
    'prerender.php',
    'api/public/index.php',
    'api/public/prerender.php',
    'api/src/Bootstrap.php',
    'api/src/Services/PrerenderService.php',
    'api/config/app.php',
    'api/import-content.php',
    'api/src/Support/ContentPackImporter.php',
    'api/content/content-pack.template.json',
    'import-content.php',
    '.env.production.example',
  ];

  if (mode === 'full') {
    mustExist.push('install.php');
    mustExist.push('api/install.php');
    mustExist.push('api/migrations/001_schema.sql');
    mustExist.push('api/config/config.production.example.php');
    mustExist.push('api/storage/uploads/.gitkeep');
    mustExist.push('migrate.php');
    mustExist.push('api/migrate.php');
  } else {
    mustExist.push('api/migrations/001_schema.sql');
    mustExist.push('migrate.php');
    mustExist.push('api/migrate.php');
  }

  // Schema increments required for current CMS features (page builder, etc.)
  mustExist.push('api/migrations/005_page_layouts.sql');

  for (const rel of mustExist) {
    if (!fs.existsSync(path.join(PUBLIC_HTML, rel))) {
      errors.push(`Missing required file: ${rel}`);
    }
  }

  // Assets from Vite
  const assetsDir = path.join(PUBLIC_HTML, 'assets');
  if (!fs.existsSync(assetsDir) || fs.readdirSync(assetsDir).length === 0) {
    errors.push('frontend/dist assets missing — compiled assets folder is empty');
  }

  // Forbidden
  const files = collectFiles(PUBLIC_HTML);
  const forbiddenPatterns = [
    /^.*\/node_modules\//,
    /(^|\/)config\.local\.php$/,
    /(^|\/)\.env$/,
    /(^|\/)\.env\.development(\.local)?$/,
    /(^|\/)\.env\.local$/,
    /(^|\/)\.installed$/,
    /(^|\/)\.git\//,
    /(^|\/)\.gitignore$/,
    /(^|\/)router\.php$/,
    /frontend\/src\//,
  ];

  for (const rel of files) {
    // Allow documented production templates
    if (rel === '.env.production.example' || rel.endsWith('/.env.production.example')) continue;
    if (rel.endsWith('config.production.example.php')) continue;
    for (const re of forbiddenPatterns) {
      if (re.test(rel)) errors.push(`Forbidden file included: ${rel}`);
    }
  }

  // Scan for hard-coded local API/dev URLs (ignore libraries mentioning "localhost" as a TLD label)
  const suspiciousPorts = /https?:\/\/(localhost|127\.0\.0\.1):(5173|8080|3000)\b/i;
  for (const rel of collectFiles(PUBLIC_HTML)) {
    if (!/\.(js|css|html|json|php)$/i.test(rel)) continue;
    const norm = String(rel).replace(/\\/g, '/');
    // Installer + config templates intentionally mention localhost as form/CLI defaults
    if (/(^|\/)install\.php$/i.test(norm)) continue;
    if (/config\.(example|production\.example)\.php$/i.test(norm)) continue;
    if (norm.includes('DEPLOYMENT')) continue;
    const content = fs.readFileSync(path.join(PUBLIC_HTML, rel), 'utf8');
    if (suspiciousPorts.test(content)) {
      errors.push(`Localhost dev URL found in package file: public_html/${norm}`);
      continue;
    }
    if (/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\b/i.test(content)) {
      errors.push(`Localhost API URL found in package file: public_html/${norm}`);
    }
  }

  // Mode-specific: update must not include installer
  if (mode === 'update') {
    if (fs.existsSync(path.join(PUBLIC_HTML, 'install.php'))) {
      errors.push('Update package must not include public_html/install.php');
    }
    if (fs.existsSync(path.join(PUBLIC_HTML, 'api', 'install.php'))) {
      errors.push('Update package must not include api/install.php');
    }
  }

  if (errors.length) {
    for (const e of errors) say(TAG.err, e);
    fail(`Validation failed (${errors.length} issue(s)). ZIP not created.`);
  }

  say(TAG.ok, 'Package validation passed');
}

function createZip(zipPath) {
  say(TAG.info, `Creating ZIP (flat public_html root): ${path.basename(zipPath)}`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Pack ONLY contents of public_html/ so unzip lands in hosting public_html root.
  // Windows 10+ tar: -C public_html + . puts index.html, api/, … at ZIP root.
  const r = run('tar', ['-a', '-c', '-f', zipPath, '-C', PUBLIC_HTML, '.']);
  if (!r.ok || !fs.existsSync(zipPath)) {
    const ps = [
      `$src = Join-Path '${PUBLIC_HTML.replace(/'/g, "''")}' '*'`,
      `$dest = '${zipPath.replace(/'/g, "''")}'`,
      `if (Test-Path $dest) { Remove-Item $dest -Force }`,
      `Compress-Archive -Path $src -DestinationPath $dest -CompressionLevel Optimal`,
    ].join('; ');
    const r2 = run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
    if (!r2.ok || !fs.existsSync(zipPath)) {
      fail(`ZIP creation failed. tar: ${r.stderr || r.stdout}; powershell: ${r2.stderr || r2.stdout}`);
    }
  }

  // Sanity: archive root must contain spa.html + index.php (not nested public_html/)
  const list = run('tar', ['-tf', zipPath]);
  const names = (list.stdout || '').split(/\r?\n/).filter(Boolean);
  const hasNested = names.some((n) => /^(hosting-package|public_html)\//i.test(n.replace(/^\.\//, '')));
  const norm = (n) => n.replace(/^\.\//, '').replace(/\\/g, '/');
  const hasSpa = names.some((n) => {
    const x = norm(n);
    return x === 'spa.html' || /(^|\/)spa\.html$/i.test(x);
  });
  const hasIndexPhp = names.some((n) => {
    const x = norm(n);
    return x === 'index.php' || /(^|\/)index\.php$/i.test(x);
  });
  if (hasNested) {
    fail('ZIP incorrectly nests hosting-package/ or public_html/ — expected flat root.');
  }
  if (!hasSpa || !hasIndexPhp) {
    fail('ZIP missing spa.html and/or index.php at archive root.');
  }

  const size = fs.statSync(zipPath).size;
  say(TAG.ok, `ZIP ready (${(size / 1024 / 1024).toFixed(2)} MB) — extract into public_html/`);
  return size;
}

async function promptOptions(cli) {
  console.log('');
  console.log(`${C.bold}${C.white}  Jasefly CMS — Production Hosting Packager${C.reset}`);
  console.log(`${C.dim}  ───────────────────────────────────────────${C.reset}`);
  console.log('');

  // Config file (build-hosting.config.json in repo root) is the single
  // place to persist answers so you don't get prompted every run.
  // Precedence: CLI args > config file > interactive prompt.
  const cfg = loadConfig();
  const useConfig = Object.keys(cfg).length > 0;
  if (useConfig) {
    say(TAG.ok, `Loaded build-hosting.config.json (mode=${cfg.mode ?? '—'}, domain=${cfg.domain || '(relative)'}${cfg.apiUrl ? `, apiUrl=${cfg.apiUrl}` : ''})`);
  }

  let mode = cli.mode ?? cfg.mode;
  if (!mode) {
    if (cli.yes) mode = 'full';
    else {
      const ans = await ask('Build mode: [1] Full install  [2] Update', '1');
      mode = ans === '2' || /^u/i.test(ans) ? 'update' : 'full';
    }
  }
  if (mode !== 'full' && mode !== 'update') fail(`Invalid mode: ${mode}`);

  let domain = cli.domain ?? cfg.domain;
  if (domain == null) {
    domain = cli.yes ? '' : await ask('Production domain (https://example.com, empty = relative /api)', '');
  }
  domain = (domain || '').replace(/\/$/, '');

  let apiUrl = cli.apiUrl ?? cfg.apiUrl;
  if (apiUrl == null) {
    if (cli.yes) apiUrl = '';
    else {
      const def = domain || '';
      apiUrl = await ask('API base origin for Vite build (empty = same-origin relative)', def);
    }
  }
  apiUrl = (apiUrl || '').replace(/\/$/, '');

  let demo = cli.demo ?? cfg.demo;
  if (mode === 'full' && demo == null) {
    if (cli.yes) demo = 'no';
    else {
      const ans = await ask('Include demo data hint in docs? (yes/no)', 'no');
      demo = /^y/i.test(ans) ? 'yes' : 'no';
    }
  }

  return { mode, domain, apiUrl, demo: demo || 'no' };
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const opts = await promptOptions(cli);

  say(TAG.info, `Mode: ${opts.mode}`);
  if (opts.domain) say(TAG.info, `Domain: ${opts.domain}`);
  say(TAG.info, `Vite VITE_API_URL: ${opts.apiUrl || '(empty → relative /api/v1)'}`);

  // 1–3 checks
  validateProjectStructure();

  if (!which('node')) fail('Node.js not found in PATH.');
  say(TAG.ok, `Node.js ${run('node', ['-v']).stdout}`);

  if (!which('npm')) fail('npm not found in PATH.');
  say(TAG.ok, `npm ${run(npmCmd(), ['-v']).stdout}`);

  const php = findPhp();
  if (!php) fail('PHP not found. Install XAMPP/Laragon or add php to PATH.');
  const phpVer = run(php, ['-r', 'echo PHP_VERSION;']).stdout;
  say(TAG.ok, `PHP ${phpVer}`);

  // 4 npm install if needed
  if (!fs.existsSync(path.join(FRONTEND, 'node_modules'))) {
    say(TAG.info, 'Installing frontend dependencies...');
    const ni = run(npmCmd(), ['install'], { cwd: FRONTEND, stdio: 'inherit' });
    if (!ni.ok) fail('npm install failed.');
  } else {
    say(TAG.ok, 'Frontend dependencies present');
  }

  // 5 production build
  say(TAG.info, 'Building frontend (production)...');
  const buildEnv = {};
  if (opts.apiUrl) buildEnv.VITE_API_URL = opts.apiUrl;
  else buildEnv.VITE_API_URL = '';

  const build = run(npmCmd(), ['run', 'build'], {
    cwd: FRONTEND,
    stdio: 'inherit',
    env: buildEnv,
  });
  if (!build.ok) fail('Frontend production build failed.');

  // 6 validate frontend build
  const distIndex = path.join(FRONTEND, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) fail('frontend/dist/index.html missing after build.');
  const distAssets = path.join(FRONTEND, 'dist', 'assets');
  if (!fs.existsSync(distAssets) || fs.readdirSync(distAssets).length === 0) {
    fail('frontend/dist/assets is missing or empty.');
  }
  say(TAG.ok, 'Frontend build validated');

  // Prepare package dir (delete previous temp package, keep old zips)
  mkdirp(RELEASE);
  rmrf(PACKAGE_DIR);
  mkdirp(PUBLIC_HTML);

  // 7–8 prepare backend + frontend into public_html
  copyBackend(opts.mode);
  copyFrontendDist();

  // Production templates + demo seeder + content importer
  const apiDest = path.join(PUBLIC_HTML, 'api');
  if (fs.existsSync(path.join(BACKEND, 'seed-demo.php'))) {
    copyFile(path.join(BACKEND, 'seed-demo.php'), path.join(apiDest, 'seed-demo.php'));
  }
  if (fs.existsSync(path.join(BACKEND, 'migrations', 'demo_content.php'))) {
    mkdirp(path.join(apiDest, 'migrations'));
    copyFile(
      path.join(BACKEND, 'migrations', 'demo_content.php'),
      path.join(apiDest, 'migrations', 'demo_content.php'),
    );
  }
  if (fs.existsSync(path.join(BACKEND, 'import-content.php'))) {
    copyFile(path.join(BACKEND, 'import-content.php'), path.join(apiDest, 'import-content.php'));
  }
  // Content pack templates (not under storage — update packages strip storage/)
  const contentSrc = path.join(ROOT, 'content');
  const contentDest = path.join(apiDest, 'content');
  mkdirp(contentDest);
  for (const name of ['content-pack.template.json', 'content-pack.example.json', 'content-pack.schema.json']) {
    const from = path.join(contentSrc, name);
    if (fs.existsSync(from)) copyFile(from, path.join(contentDest, name));
  }
  writeFile(path.join(PUBLIC_HTML, 'import-content.php'), [
    '<?php',
    'declare(strict_types=1);',
    '/** Content pack importer. Delete after use. */',
    "require __DIR__ . '/api/import-content.php';",
    '',
  ].join('\n'));

  if (opts.mode === 'full') {
    writeFile(
      path.join(PUBLIC_HTML, 'api', 'config', 'config.production.example.php'),
      productionConfigExample(opts.domain),
    );
    writeFile(
      path.join(PUBLIC_HTML, 'api', 'config', 'config.example.php'),
      productionConfigExample(opts.domain),
    );
    writeFile(path.join(PUBLIC_HTML, 'install.php'), installShim());
    writeFile(path.join(PUBLIC_HTML, 'seed-demo.php'), [
      '<?php',
      'declare(strict_types=1);',
      '/** One-shot demo seeder. Delete after use. */',
      "require __DIR__ . '/api/seed-demo.php';",
      '',
    ].join('\n'));
  } else {
    // Update: remove leftover first-install templates if any
    const prodEx = path.join(PUBLIC_HTML, 'api', 'config', 'config.production.example.php');
    if (fs.existsSync(prodEx)) fs.unlinkSync(prodEx);
  }

  writeFile(path.join(PUBLIC_HTML, '.env.production.example'), envProductionExample(opts.domain, opts.apiUrl));
  // Docs stay next to the ZIP in release/ — never in public_html (web root clutter + info leak)
  writeFile(path.join(RELEASE, 'DEPLOYMENT-RU.md'), deploymentRuMd(opts));
  if (fs.existsSync(path.join(ROOT, 'CONTENT_IMPORT.md'))) {
    copyFile(path.join(ROOT, 'CONTENT_IMPORT.md'), path.join(RELEASE, 'CONTENT_IMPORT.md'));
  }
  if (fs.existsSync(path.join(ROOT, 'SECURITY.md'))) {
    copyFile(path.join(ROOT, 'SECURITY.md'), path.join(RELEASE, 'SECURITY.md'));
  }

  // Incremental DB migrations helper (critical for update packages; also useful after full install upgrades)
  if (fs.existsSync(path.join(BACKEND, 'migrate.php'))) {
    copyFile(path.join(BACKEND, 'migrate.php'), path.join(apiDest, 'migrate.php'));
  }
  writeFile(path.join(PUBLIC_HTML, 'migrate.php'), [
    '<?php',
    'declare(strict_types=1);',
    '/** One-shot DB migrate. Delete after use. */',
    "require __DIR__ . '/api/migrate.php';",
    '',
  ].join('\n'));

  // Crawler HTML entry (root shim → api/public/prerender.php)
  writeFile(path.join(PUBLIC_HTML, 'prerender.php'), [
    '<?php',
    'declare(strict_types=1);',
    '/** Dynamic rendering for search / social bots. */',
    "require __DIR__ . '/api/public/prerender.php';",
    '',
  ].join('\n'));

  //  Validate before zip
  validatePackage(opts.mode, opts);

  const zipName = opts.mode === 'full'
    ? `jasefly-cms-install-${stamp()}.zip`
    : `jasefly-cms-update-${stamp()}.zip`;
  const zipPath = path.join(RELEASE, zipName);
  const size = createZip(zipPath);

  const site = opts.domain || 'https://YOUR-DOMAIN';
  const base = site.replace(/\/$/, '');

  console.log('');
  console.log(`${C.green}  ╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.green}  ║  Hosting package ready                              ║${C.reset}`);
  console.log(`${C.green}  ╠══════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.green}  ║${C.reset}  Mode:      ${opts.mode}`);
  console.log(`${C.green}  ║${C.reset}  ZIP:       release/${zipName}`);
  console.log(`${C.green}  ║${C.reset}  Size:      ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`${C.green}  ║${C.reset}  Preview:   release/hosting-package/public_html/`);
  console.log(`${C.green}  ║${C.reset}  Unzip to:  hosting public_html/ (flat — no subfolder)`);
  console.log(`${C.green}  ╠══════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.green}  ║${C.reset}  Site:      ${base}/`);
  console.log(`${C.green}  ║${C.reset}  API:       ${base}/api/v1`);
  console.log(`${C.green}  ║${C.reset}  Installer: ${opts.mode === 'full' ? `${base}/install.php` : '(n/a — update package)'}`);
  console.log(`${C.green}  ║${C.reset}  Admin:     ${base}/admin/login`);
  if (opts.mode === 'update') {
    console.log(`${C.green}  ║${C.reset}  Update UI: ${base}/admin/updates  ← залей ZIP в админке`);
  }
  console.log(`${C.green}  ╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}Docs (not in ZIP web root): release/DEPLOYMENT-RU.md${C.reset}`);
  console.log('');
}

main().catch((err) => {
  say(TAG.err, err.stack || err.message);
  process.exit(1);
});
