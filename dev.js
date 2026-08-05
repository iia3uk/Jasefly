#!/usr/bin/env node
'use strict';

/**
 * Jasefly CMS — unified local development launcher (Windows-friendly).
 * Usage: node dev.js [start|stop|restart|install]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT = __dirname;
const DEV_DIR = path.join(ROOT, '.dev');
const LOGS_DIR = path.join(DEV_DIR, 'logs');
const RUNTIME_FILE = path.join(DEV_DIR, 'runtime.json');
const DB_ENV_FILE = path.join(DEV_DIR, 'database.env');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');

// ── ANSI colors ──────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

const TAG = {
  ok: `${C.green}[OK]${C.reset}`,
  info: `${C.cyan}[..]${C.reset}`,
  warn: `${C.yellow}[!!]${C.reset}`,
  err: `${C.red}[XX]${C.reset}`,
  php: `${C.magenta}[PHP]${C.reset}`,
  vite: `${C.blue}[Vite]${C.reset}`,
};

// ── Logging ──────────────────────────────────────────────────────────────────

function ensureLogsDir() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function appendLog(file, line) {
  ensureLogsDir();
  fs.appendFileSync(path.join(LOGS_DIR, file), line + os.EOL, 'utf8');
}

function logLauncher(msg) {
  const line = `[${ts()}] ${stripAnsi(msg)}`;
  appendLog('launcher.log', line);
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}

function say(tag, msg) {
  const line = `${tag} ${msg}`;
  console.log(line);
  logLauncher(line);
}

function progress(step, total, msg) {
  say(TAG.info, `${C.bold}[${step}/${total}]${C.reset} ${msg}`);
}

// ── Shell helpers ──────────────────────────────────────────────────────────────

function commandExists(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(cmd, [name], { encoding: 'utf8', shell: true });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function which(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(cmd, [name], { encoding: 'utf8', shell: true });
  if (r.status !== 0) return null;
  return r.stdout.trim().split(/\r?\n/)[0] || null;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32' && /\.cmd$/i.test(cmd),
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function globLatest(patternBase) {
  const star = patternBase.indexOf('*');
  if (star === -1) {
    return fs.existsSync(patternBase) ? patternBase : null;
  }
  const dir = path.dirname(patternBase.slice(0, star));
  const suffix = patternBase.slice(star + 1);
  if (!fs.existsSync(dir)) return null;
  let best = null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = globLatest(path.join(full, suffix.replace(/^\*/, '')));
      if (hit && (!best || hit > best)) best = hit;
    } else if (suffix === '' || entry.name.endsWith(suffix.replace(/^\*/, ''))) {
      if (!best || full > best) best = full;
    }
  }
  return best;
}

function findPhp() {
  const portable = path.join(ROOT, '.tools', 'php', 'php.exe');
  if (fs.existsSync(portable)) return portable;
  if (process.env.PORTFOLIO_PHP && fs.existsSync(process.env.PORTFOLIO_PHP)) {
    return process.env.PORTFOLIO_PHP;
  }
  const inPath = which('php');
  if (inPath) return inPath;
  const candidates = [
    'C:\\xampp\\php\\php.exe',
    'C:\\laragon\\bin\\php\\php-8.3*\\php.exe',
    'C:\\laragon\\bin\\php\\php-8.2*\\php.exe',
    'C:\\php\\php.exe',
    'C:\\Program Files\\PHP\\*\\php.exe',
    'C:\\tools\\php\\php.exe',
  ];
  for (const c of candidates) {
    const hit = c.includes('*') ? globLatest(c) : (fs.existsSync(c) ? c : null);
    if (hit) return hit;
  }
  return null;
}

function findMysqlCli() {
  const inPath = which('mysql');
  if (inPath) return inPath;
  const candidates = [
    'C:\\xampp\\mysql\\bin\\mysql.exe',
    'C:\\laragon\\bin\\mysql\\mysql-*\\bin\\mysql.exe',
    'C:\\Program Files\\MySQL\\MySQL Server *\\bin\\mysql.exe',
    'C:\\Program Files\\MariaDB*\\bin\\mysql.exe',
  ];
  for (const c of candidates) {
    const hit = c.includes('*') ? globLatest(c) : (fs.existsSync(c) ? c : null);
    if (hit) return hit;
  }
  return null;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function getFreePort(start, span = 40) {
  for (let p = start; p < start + span; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`No free port found near ${start}`);
}

function waitHttp(url, timeoutSec = 60) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutSec * 1000;
    const tick = () => {
      if (Date.now() > deadline) return resolve(false);
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) resolve(true);
        else setTimeout(tick, 500);
      });
      req.on('error', () => setTimeout(tick, 500));
      req.on('timeout', () => { req.destroy(); setTimeout(tick, 500); });
    };
    tick();
  });
}

function newJwtSecret() {
  return crypto.randomBytes(48).toString('hex');
}

function readDbEnv() {
  const defaults = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_NAME: 'jasefly_cms',
    DB_USER: 'root',
    DB_PASS: '',
  };
  if (fs.existsSync(DB_ENV_FILE)) {
    for (const line of fs.readFileSync(DB_ENV_FILE, 'utf8').split(/\r?\n/)) {
      if (/^\s*#/.test(line) || !line.trim()) continue;
      const m = line.match(/^\s*([^=]+)=(.*)$/);
      if (m) defaults[m[1].trim()] = m[2].trim();
    }
  }
  return defaults;
}

function writeDbEnv(map) {
  fs.mkdirSync(DEV_DIR, { recursive: true });
  const lines = [
    '# Local database settings for DX scripts (edit if MySQL credentials differ)',
    `DB_HOST=${map.DB_HOST}`,
    `DB_PORT=${map.DB_PORT}`,
    `DB_NAME=${map.DB_NAME}`,
    `DB_USER=${map.DB_USER}`,
    `DB_PASS=${map.DB_PASS}`,
  ];
  fs.writeFileSync(DB_ENV_FILE, lines.join(os.EOL) + os.EOL, 'utf8');
}

function writeFrontendEnv(phpPort, vitePort) {
  const p = path.join(FRONTEND, '.env.development.local');
  const lines = [
    '# Auto-generated by dev.js — do not commit secrets',
    `VITE_API_URL=http://127.0.0.1:${phpPort}`,
    `VITE_DEV_PORT=${vitePort}`,
  ];
  fs.writeFileSync(p, lines.join(os.EOL) + os.EOL, 'utf8');
}

function writeBackendConfig(db, vitePort, jwtSecret) {
  const pass = db.DB_PASS.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const lines = [
    '<?php',
    'declare(strict_types=1);',
    '/** Auto-generated by dev.js for local development. */',
    'return array(',
    "    'app_name' => 'Jasefly CMS',",
    `    'app_url' => 'http://localhost:${vitePort}',`,
    "    'app_env' => 'local',",
    `    'jwt_secret' => '${jwtSecret}',`,
    "    'jwt_ttl' => 3600,",
    "    'refresh_ttl' => 604800,",
    `    'cors_origins' => 'http://localhost:${vitePort},http://127.0.0.1:${vitePort}',`,
    "    'upload_max_mb' => 10,",
    `    'db_host' => '${db.DB_HOST}',`,
    `    'db_name' => '${db.DB_NAME}',`,
    `    'db_user' => '${db.DB_USER}',`,
    `    'db_pass' => '${pass}',`,
    "    'db_charset' => 'utf8mb4',",
    ');',
    '',
  ];
  fs.writeFileSync(path.join(BACKEND, 'config', 'config.local.php'), lines.join(os.EOL), 'utf8');
}

function getOrCreateJwt() {
  const configPath = path.join(BACKEND, 'config', 'config.local.php');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const m = raw.match(/jwt_secret'\s*=>\s*'([^']+)'/);
    if (m && m[1] && m[1] !== 'change-me-to-a-long-random-string' && m[1].length >= 32) {
      return m[1];
    }
  }
  return newJwtSecret();
}

function ensureStorageDirs() {
  const dirs = [
    'backend/storage/uploads',
    'backend/storage/thumbnails',
    'backend/storage/backups',
    'backend/storage/logs',
  ];
  for (const rel of dirs) {
    const dir = path.join(ROOT, rel);
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '', 'utf8');
  }
}

function testMysqlConnection(db, phpExe) {
  const passEsc = db.DB_PASS.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const php = [
    '<?php',
    'try {',
    '  $pdo = new PDO(',
    `    "mysql:host=${db.DB_HOST};port=${db.DB_PORT};charset=utf8mb4",`,
    `    "${db.DB_USER}",`,
    `    "${passEsc}"`,
    '  );',
    '  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);',
    '  echo "OK";',
    '} catch (Throwable $ex) {',
    '  fwrite(STDERR, $ex->getMessage());',
    '  exit(1);',
    '}',
  ].join('\n');
  const tmp = path.join(os.tmpdir(), `jasefly-db-check-${crypto.randomUUID()}.php`);
  fs.writeFileSync(tmp, php, 'utf8');
  try {
    const r = run(phpExe, [tmp]);
    if (!r.ok) return { ok: false, error: r.stderr || r.stdout || 'Connection failed' };
    return { ok: true };
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function isDatabaseInstalled() {
  return fs.existsSync(path.join(BACKEND, 'storage', '.installed'));
}

function installDatabase(db, phpExe, vitePort) {
  if (isDatabaseInstalled()) {
    say(TAG.info, 'Database already installed (.installed present). Skipping schema.');
    return true;
  }
  say(TAG.info, 'Running backend installer (schema + demo seed)...');
  const args = [
    'install.php',
    `--host=${db.DB_HOST}`,
    `--name=${db.DB_NAME}`,
    `--user=${db.DB_USER}`,
    `--pass=${db.DB_PASS}`,
    `--url=http://localhost:${vitePort}`,
    `--cors=http://localhost:${vitePort},http://127.0.0.1:${vitePort}`,
    '--email=admin@example.com',
    '--password=Admin123!',
    '--demo=0',
  ];
  const r = run(phpExe, args, { cwd: BACKEND });
  if (!r.ok) {
    say(TAG.err, `Database installer failed: ${r.stderr || r.stdout}`);
    return false;
  }
  return true;
}

function npmInstall() {
  say(TAG.info, 'Running npm install in frontend/...');
  const r = run(npmCmd(), ['install'], {
    cwd: FRONTEND,
    stdio: 'inherit',
  });
  return r.ok;
}

function saveRuntime(data) {
  fs.mkdirSync(DEV_DIR, { recursive: true });
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify({ ...data, updated: new Date().toISOString() }, null, 2), 'utf8');
}

function loadRuntime() {
  if (!fs.existsSync(RUNTIME_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function clearRuntime() {
  try { fs.unlinkSync(RUNTIME_FILE); } catch (_) {}
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid, label = 'process') {
  if (!pid || !isAlive(pid)) return false;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch (e) {
    say(TAG.warn, `Could not stop ${label} (PID ${pid}): ${e.message}`);
    return false;
  }
}

function killByPort(port) {
  if (!port || process.platform !== 'win32') return [];
  const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: true });
  if (r.status !== 0) return [];
  const killed = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    if (!line.includes(`:${port} `) && !line.includes(`:${port}\t`)) continue;
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parseInt(parts[parts.length - 1], 10);
    if (pid > 0 && isAlive(pid)) {
      const proc = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', shell: true });
      const name = (proc.stdout || '').toLowerCase();
      if (name.includes('php') || name.includes('node')) {
        if (killPid(pid)) killed.push(`${pid}@${port}`);
      }
    }
  }
  return killed;
}

function stopAll() {
  const rt = loadRuntime();
  const killed = [];
  if (rt) {
    for (const [label, pid] of [['php', rt.phpPid], ['vite', rt.vitePid], ['launcher', rt.launcherPid]]) {
      if (killPid(pid, label)) killed.push(`${label}#${pid}`);
    }
    if (rt.phpPort) killed.push(...killByPort(rt.phpPort));
    if (rt.vitePort) killed.push(...killByPort(rt.vitePort));
  } else {
    killed.push(...killByPort(8080), ...killByPort(5173));
  }
  clearRuntime();
  return [...new Set(killed)];
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, process.platform === 'win32' ? ['', url] : [url], { shell: true, stdio: 'ignore', detached: true }).unref();
}

function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} [y/N] `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

// ── Dev launcher ───────────────────────────────────────────────────────────────

class DevLauncher {
  constructor() {
    this.phpExe = null;
    this.phpProc = null;
    this.viteProc = null;
    this.phpPort = null;
    this.vitePort = null;
    this.db = null;
    this.jwt = null;
    this.watchers = [];
    this.restartTimer = null;
    this.monitorTimer = null;
    this.shuttingDown = false;
    this.interactive = false;
    this.backendLog = null;
    this.frontendLog = null;
  }

  clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1Bc' : '\x1b[2J\x1b[H');
  }

  banner() {
    console.log('');
    console.log(`${C.bold}${C.white}  Jasefly CMS — Development Launcher${C.reset}`);
    console.log(`${C.dim}  ─────────────────────────────────────${C.reset}`);
    console.log('');
  }

  detectTools(step = 1) {
    progress(step, 8, 'Detecting Node.js...');
    if (!commandExists('node')) {
      say(TAG.err, 'Node.js is not installed or not in PATH.');
      console.log(`  ${C.yellow}Download: https://nodejs.org/${C.reset}`);
      return false;
    }
    say(TAG.ok, `Node.js ${run('node', ['-v']).stdout}`);

    progress(step + 1, 8, 'Detecting npm...');
    if (!commandExists('npm')) {
      say(TAG.err, 'npm was not found. Reinstall Node.js with npm included.');
      return false;
    }
    say(TAG.ok, `npm ${run(npmCmd(), ['-v']).stdout}`);

    progress(step + 2, 8, 'Detecting PHP...');
    this.phpExe = findPhp();
    if (!this.phpExe) {
      say(TAG.err, 'PHP was not found. Install XAMPP, Laragon, or PHP for Windows.');
      return false;
    }
    const phpVer = run(this.phpExe, ['-r', 'echo PHP_VERSION;']).stdout;
    say(TAG.ok, `PHP ${phpVer} (${this.phpExe})`);
    const pdo = run(this.phpExe, ['-r', "echo extension_loaded('pdo_mysql') ? '1' : '0';"]).stdout;
    if (pdo !== '1') {
      say(TAG.err, 'PHP extension pdo_mysql is not enabled.');
      return false;
    }

    progress(step + 3, 8, 'Detecting MySQL...');
    const mysqlCli = findMysqlCli();
    if (mysqlCli) say(TAG.ok, `MySQL client: ${mysqlCli}`);
    else say(TAG.warn, 'MySQL CLI not found — connection tested via PHP PDO only.');

    progress(step + 4, 8, 'Detecting Git...');
    if (commandExists('git')) say(TAG.ok, `Git ${run('git', ['--version']).stdout}`);
    else say(TAG.warn, 'Git not found (optional for local dev).');

    return true;
  }

  async prepareEnvironment(installMode = false) {
    ensureLogsDir();
    ensureStorageDirs();
    this.db = readDbEnv();
    if (!fs.existsSync(DB_ENV_FILE)) writeDbEnv(this.db);

    const nodeModules = path.join(FRONTEND, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
      say(TAG.warn, 'node_modules missing — installing dependencies...');
      if (!npmInstall()) return false;
    } else {
      say(TAG.ok, 'Frontend dependencies present');
    }

    const configPath = path.join(BACKEND, 'config', 'config.local.php');
    const envPath = path.join(FRONTEND, '.env.development.local');
    this.jwt = getOrCreateJwt();

    if (!fs.existsSync(configPath) || !fs.existsSync(envPath)) {
      say(TAG.info, 'Generating missing config / env files...');
      writeBackendConfig(this.db, 5173, this.jwt);
      writeFrontendEnv(8080, 5173);
      say(TAG.ok, 'Generated config.local.php and .env.development.local');
    }

    say(TAG.info, 'Testing MySQL connection...');
    const probe = testMysqlConnection(this.db, this.phpExe);
    if (!probe.ok) {
      say(TAG.err, `Cannot connect to MySQL: ${probe.error}`);
      console.log(`  ${C.yellow}Edit credentials: .dev/database.env${C.reset}`);
      console.log(`  ${C.yellow}Ensure MySQL/MariaDB is running.${C.reset}`);
      return false;
    }
    say(TAG.ok, 'MySQL connection successful');

    if (!isDatabaseInstalled()) {
      if (installMode) {
        if (!installDatabase(this.db, this.phpExe, 5173)) return false;
      } else if (this.interactive && process.stdin.isTTY) {
        const yes = await promptYesNo('Database not initialized. Run installer now?');
        if (yes) {
          if (!installDatabase(this.db, this.phpExe, 5173)) return false;
        } else {
          say(TAG.warn, 'Continuing without DB install — API may fail until you run: node dev.js install');
        }
      } else {
        say(TAG.warn, 'Database not initialized. Run: node dev.js install (or install.bat)');
      }
    }

    return true;
  }

  async allocatePorts() {
    say(TAG.info, 'Finding free ports...');
    this.phpPort = await getFreePort(8080);
    this.vitePort = await getFreePort(5173);
    writeFrontendEnv(this.phpPort, this.vitePort);
    writeBackendConfig(this.db, this.vitePort, this.jwt);
    say(TAG.ok, `PHP API  → http://127.0.0.1:${this.phpPort}`);
    say(TAG.ok, `Vite App → http://localhost:${this.vitePort}`);
  }

  pipeOutput(proc, tag, logStream) {
    const write = (chunk) => {
      const text = chunk.toString();
      if (logStream) logStream.write(text);
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) console.log(`${tag} ${line}`);
      }
    };
    proc.stdout.on('data', write);
    proc.stderr.on('data', write);
  }

  startPhp() {
    say(TAG.info, 'Starting PHP backend...');
    const router = path.join(BACKEND, 'router.php');
    this.phpProc = spawn(this.phpExe, ['-S', `127.0.0.1:${this.phpPort}`, router], {
      cwd: BACKEND,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.pipeOutput(this.phpProc, TAG.php, this.backendLog);
    this.phpProc.on('exit', (code) => {
      if (!this.shuttingDown) {
        say(TAG.err, `PHP exited unexpectedly (code ${code}). Auto-restarting in 2s...`);
        logLauncher(`PHP crash code=${code}`);
        setTimeout(() => this.restartPhp('crash'), 2000);
      }
    });
    return this.phpProc;
  }

  startVite() {
    say(TAG.info, 'Starting Vite frontend...');
    const viteBin = path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!fs.existsSync(viteBin)) {
      throw new Error('Vite is not installed. Run: node dev.js install');
    }
    this.viteProc = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(this.vitePort), '--strictPort'], {
      cwd: FRONTEND,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, VITE_DEV_PORT: String(this.vitePort) },
    });
    this.pipeOutput(this.viteProc, TAG.vite, this.frontendLog);
    this.viteProc.on('exit', (code) => {
      if (!this.shuttingDown) {
        say(TAG.err, `Vite exited unexpectedly (code ${code}). Auto-restarting in 2s...`);
        logLauncher(`Vite crash code=${code}`);
        setTimeout(() => this.restartVite('crash'), 2000);
      }
    });
    return this.viteProc;
  }

  saveState() {
    saveRuntime({
      launcherPid: process.pid,
      phpPid: this.phpProc?.pid,
      vitePid: this.viteProc?.pid,
      phpPort: this.phpPort,
      vitePort: this.vitePort,
    });
  }

  stopPhp() {
    if (this.phpProc) {
      killPid(this.phpProc.pid, 'php');
      this.phpProc = null;
    }
  }

  stopVite() {
    if (this.viteProc) {
      killPid(this.viteProc.pid, 'vite');
      this.viteProc = null;
    }
  }

  restartPhp(reason = 'manual') {
    if (this.shuttingDown) return;
    say(TAG.info, `Restarting PHP backend (${reason})...`);
    this.stopPhp();
    this.startPhp();
    this.saveState();
  }

  restartVite(reason = 'manual') {
    if (this.shuttingDown) return;
    say(TAG.info, `Restarting Vite frontend (${reason})...`);
    this.stopVite();
    this.startVite();
    this.saveState();
  }

  restartAll() {
    say(TAG.info, 'Restarting all services...');
    this.stopPhp();
    this.stopVite();
    this.startPhp();
    this.startVite();
    this.saveState();
    this.waitReady(false);
  }

  watchBackend() {
    const dirs = [
      path.join(BACKEND, 'src'),
      path.join(BACKEND, 'routes'),
    ].filter((p) => fs.existsSync(p));
    const files = [
      path.join(BACKEND, 'router.php'),
      path.join(BACKEND, 'public', 'index.php'),
    ].filter((p) => fs.existsSync(p));

    const schedule = () => {
      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => this.restartPhp('file-change'), 400);
    };

    for (const target of dirs) {
      try {
        const w = fs.watch(target, { recursive: true }, (_ev, file) => {
          if (file && !/\.php$/i.test(file)) return;
          schedule();
        });
        this.watchers.push(w);
      } catch (_) {
        // non-fatal
      }
    }
    for (const target of files) {
      try {
        const w = fs.watch(target, () => schedule());
        this.watchers.push(w);
      } catch (_) {}
    }
    say(TAG.ok, 'Watching PHP backend for changes');
  }

  startMonitor() {
    this.monitorTimer = setInterval(() => {
      if (this.shuttingDown) return;
      if (this.phpProc && !isAlive(this.phpProc.pid)) {
        say(TAG.warn, 'PHP process missing — restarting...');
        this.restartPhp('monitor');
      }
      if (this.viteProc && !isAlive(this.viteProc.pid)) {
        say(TAG.warn, 'Vite process missing — restarting...');
        this.restartVite('monitor');
      }
    }, 3000);
  }

  async waitReady(openBrowserFlag = true) {
    say(TAG.info, 'Waiting for servers to come online...');
    let apiReady = await waitHttp(`http://127.0.0.1:${this.phpPort}/api/v1/health`, 45);
    if (!apiReady) apiReady = await waitHttp(`http://127.0.0.1:${this.phpPort}/api/health`, 15);
    const webReady = await waitHttp(`http://127.0.0.1:${this.vitePort}/`, 60);

    if (!apiReady) {
      say(TAG.err, 'PHP API did not become ready in time.');
      console.log(`  ${C.yellow}See: .dev/logs/backend.log${C.reset}`);
      return false;
    }
    say(TAG.ok, 'PHP API is ready');

    if (!webReady) {
      say(TAG.err, 'Vite frontend did not become ready in time.');
      console.log(`  ${C.yellow}See: .dev/logs/frontend.log${C.reset}`);
      return false;
    }
    say(TAG.ok, 'Vite frontend is ready');

    this.printRunningBox();
    if (openBrowserFlag) this.openSite();
    return true;
  }

  siteUrl() {
    return `http://localhost:${this.vitePort}`;
  }

  openSite() {
    const url = this.siteUrl();
    say(TAG.info, `Opening browser → ${url}`);
    openBrowser(url);
  }

  printRunningBox() {
    const url = this.siteUrl();
    console.log('');
    console.log(`${C.green}  ╔══════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.green}  ║  Jasefly CMS is running                          ║${C.reset}`);
    console.log(`${C.green}  ╠══════════════════════════════════════════════════╣${C.reset}`);
    console.log(`${C.green}  ║${C.reset}  Site:   ${url}`);
    console.log(`${C.green}  ║${C.reset}  Admin:  ${url}/admin/login`);
    console.log(`${C.green}  ║${C.reset}  API:    http://127.0.0.1:${this.phpPort}/api/v1`);
    console.log(`${C.green}  ╠══════════════════════════════════════════════════╣${C.reset}`);
    console.log(`${C.green}  ║${C.reset}  Hotkeys: ${C.bold}R${C.reset} restart · ${C.bold}O${C.reset} open · ${C.bold}C${C.reset} clear · ${C.bold}Q${C.reset} quit`);
    console.log(`${C.green}  ╚══════════════════════════════════════════════════╝${C.reset}`);
    console.log('');
    console.log(`${C.dim}  Logs: .dev/logs/{launcher,backend,frontend}.log${C.reset}`);
    console.log('');
  }

  setupHotkeys() {
    if (!process.stdin.isTTY) return;
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', (_str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        this.shutdown();
        return;
      }
      const k = (key.name || '').toLowerCase();
      if (k === 'r') this.restartAll();
      else if (k === 'o') this.openSite();
      else if (k === 'c') this.clearConsole();
      else if (k === 'q') this.shutdown();
    });
  }

  async shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    say(TAG.info, 'Shutting down gracefully...');
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    for (const w of this.watchers) { try { w.close(); } catch (_) {} }
    this.stopPhp();
    this.stopVite();
    clearRuntime();
    try { this.backendLog.end(); } catch (_) {}
    try { this.frontendLog.end(); } catch (_) {}
    if (process.stdin.setRawMode) process.stdin.setRawMode(false);
    say(TAG.ok, 'Stopped.');
    process.exit(0);
  }

  async start() {
    this.interactive = true;
    this.banner();
    stopAll();

    ensureLogsDir();
    for (const f of ['launcher.log', 'backend.log', 'frontend.log']) {
      fs.writeFileSync(path.join(LOGS_DIR, f), '', 'utf8');
    }
    this.backendLog = fs.createWriteStream(path.join(LOGS_DIR, 'backend.log'), { flags: 'a' });
    this.frontendLog = fs.createWriteStream(path.join(LOGS_DIR, 'frontend.log'), { flags: 'a' });

    if (!this.detectTools()) return 1;
    if (!(await this.prepareEnvironment(false))) return 1;

    progress(7, 8, 'Starting services...');
    await this.allocatePorts();
    this.startPhp();
    this.startVite();
    this.saveState();
    this.watchBackend();
    this.startMonitor();

    const ok = await this.waitReady(true);
    if (!ok) {
      await this.shutdown();
      return 1;
    }

    progress(8, 8, 'Development environment ready');
    this.setupHotkeys();

    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    if (process.platform === 'win32') {
      process.on('SIGHUP', () => this.shutdown());
    }

    await new Promise(() => {});
    return 0;
  }

  async install() {
    this.banner();
    console.log(`${C.bold}  Install / first-time setup${C.reset}`);
    console.log('');

    if (!this.detectTools(1)) return 1;
    this.phpExe = findPhp();

    progress(6, 6, 'Preparing environment...');
    writeDbEnv(readDbEnv());
    if (!(await this.prepareEnvironment(true))) return 1;

    if (!installDatabase(this.db, this.phpExe, 5173)) return 1;
    this.jwt = getOrCreateJwt();
    writeBackendConfig(this.db, 5173, this.jwt);
    writeFrontendEnv(8080, 5173);

    console.log('');
    say(TAG.ok, 'Install complete!');
    console.log('');
    console.log(`  ${C.white}Next: double-click start.bat${C.reset}`);
    console.log('');
    console.log(`  ${C.dim}Admin: admin@example.com / Admin123!${C.reset}`);
    console.log('');
    return 0;
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────────

async function main() {
  const cmd = (process.argv[2] || 'start').toLowerCase();

  if (cmd === 'stop') {
    say(TAG.info, 'Stopping development servers...');
    const killed = stopAll();
    if (killed.length) killed.forEach((k) => say(TAG.ok, `Stopped ${k}`));
    else say(TAG.warn, 'No running Jasefly CMS servers were found.');
    return 0;
  }

  if (cmd === 'restart') {
    stopAll();
    await new Promise((r) => setTimeout(r, 1000));
    const launcher = new DevLauncher();
    return launcher.start();
  }

  if (cmd === 'install') {
    const launcher = new DevLauncher();
    return launcher.install();
  }

  if (cmd === 'start') {
    const launcher = new DevLauncher();
    return launcher.start();
  }

  console.error(`Unknown command: ${cmd}. Use: start | stop | restart | install`);
  return 1;
}

main().then((code) => {
  if (code && code !== 0) process.exit(code);
}).catch((err) => {
  say(TAG.err, err.message);
  logLauncher(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
