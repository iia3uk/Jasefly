#!/usr/bin/env node
/** One-shot: seed + boot dual + print status/body for a few paths. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nodeBin = process.execPath;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || root,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: 'utf8',
    timeout: opts.timeout || 180000,
  });
  if (r.status !== 0) {
    console.error(r.stdout || '', r.stderr || '');
    throw new Error(`fail ${cmd}`);
  }
  return r;
}

async function waitPort(port, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const ok = await new Promise((resolve) => {
      const s = net.connect({ port, host: '127.0.0.1' }, () => {
        s.end();
        resolve(true);
      });
      s.on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`port ${port} not ready`);
}

function kill(proc) {
  if (!proc?.pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

const seed = run(nodeBin, ['scripts/behavior/seed-dual-db.mjs']);
const meta = JSON.parse((seed.stdout || '').trim().split('\n').filter(Boolean).pop());
const nodePort = 3091;
const phpPort = 3092;
const phpBin = process.env.PHP_BIN || 'php';
const phpArgs = [];
if (process.env.PHP_EXTENSION_DIR) {
  phpArgs.push(
    '-d',
    `extension_dir=${process.env.PHP_EXTENSION_DIR}`,
    '-d',
    'extension=pdo_sqlite',
    '-d',
    'extension=sqlite3',
    '-d',
    'extension=mbstring',
    '-d',
    'extension=openssl',
  );
}
phpArgs.push('-S', `127.0.0.1:${phpPort}`, path.join(root, 'scripts/behavior/php-router.php'));

const nodeProc = spawn(nodeBin, ['--import', 'tsx', 'src/index.ts'], {
  cwd: path.join(root, 'runtime-node'),
  env: {
    ...process.env,
    DB_DRIVER: 'sqlite',
    DB_PATH: meta.nodeDb,
    JWT_SECRET: meta.jwtSecret,
    MCP_API_TOKEN: meta.mcpToken,
    STORAGE_PATH: meta.nodeStorage,
    APP_URL: `http://127.0.0.1:${nodePort}`,
    PORT: String(nodePort),
    TRANSLATE_PROVIDER: 'memory',
    APP_ENV: 'test',
    BEHAVIOR_PARITY: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const phpProc = spawn(phpBin, phpArgs, {
  cwd: root,
  env: {
    ...process.env,
    BEHAVIOR_PHP_DB: meta.phpDb,
    BEHAVIOR_PHP_STORAGE: meta.phpStorage,
    BEHAVIOR_JWT_SECRET: meta.jwtSecret,
    BEHAVIOR_MCP_TOKEN: meta.mcpToken,
    BEHAVIOR_PHP_URL: `http://127.0.0.1:${phpPort}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const paths = [
  '/api/v1/support/tickets/999999001',
  '/api/v1/support/tickets/999999001/messages',
  '/api/v1/media/999999001',
  '/api/v1/admin/access/users/999999001/effective',
];

try {
  await waitPort(nodePort);
  await waitPort(phpPort);
  const login = await fetch(`http://127.0.0.1:${nodePort}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: meta.adminEmail, password: meta.adminPassword }),
  });
  const tok = (await login.json())?.data?.access_token;
  for (const p of paths) {
    for (const [name, port] of [
      ['php', phpPort],
      ['node', nodePort],
    ]) {
      const headers = { Accept: 'application/json' };
      if (p.includes('/admin/')) headers.Authorization = `Bearer ${tok}`;
      const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers });
      const text = await res.text();
      console.log(`${name} ${res.status} ${p} body=${JSON.stringify(text.slice(0, 220))}`);
    }
  }
} finally {
  kill(nodeProc);
  kill(phpProc);
}
