#!/usr/bin/env node
/**
 * VPS clean-boot smoke: stage Node runtime artifact, migrate sqlite, health probe.
 * Usage:
 *   node scripts/vps/package-and-smoke.mjs
 *   SKIP_FE=1 node scripts/vps/package-and-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const frontend = path.join(root, 'frontend');
const rn = path.join(root, 'runtime-node');
const release = path.join(root, 'release');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmShell = process.platform === 'win32';

function log(step, msg) {
  console.log(`[vps-smoke] ${step}: ${msg}`);
}

function run(step, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    encoding: 'utf8',
    shell: npmShell && cmd === npmCmd,
    timeout: opts.timeoutMs ?? 15 * 60 * 1000,
    env: { ...process.env, CI: '1', ...(opts.env ?? {}) },
  });
  const ok = r.status === 0;
  if (!ok) {
    const err = (r.stderr || r.stdout || r.error?.message || '').slice(-4000);
    throw new Error(`${step} failed (${r.status}): ${err}`);
  }
  log(step, 'ok');
  return r;
}

function copyFiltered(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(src)) return;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(ent.name, ent.isDirectory())) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyFiltered(from, to, skip);
    else fs.copyFileSync(from, to);
  }
}

function findPhpFiles(dir) {
  const hits = [];
  if (!fs.existsSync(dir)) return hits;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) hits.push(...findPhpFiles(p));
    else if (ent.name.endsWith('.php')) hits.push(p);
  }
  return hits;
}

function stageSkip(name, isDir) {
  return (
    name === 'node_modules' ||
    name === 'storage' ||
    name === '.env' ||
    name === 'tests' ||
    name === 'src' ||
    name === 'vitest.config.ts' ||
    name === 'tsconfig.json' ||
    (!isDir && name.endsWith('.ts') && !name.endsWith('.d.ts'))
  );
}

async function waitForHealth(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const json = await res.json();
      if (res.ok && json?.success === true && json?.data?.status === 'ok') return json;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`health timeout: ${url}`);
}

async function main() {
  fs.mkdirSync(release, { recursive: true });

  if (process.env.SKIP_FE !== '1') {
    log('frontend', 'npm run build');
    run('frontend_build', npmCmd, ['run', 'build'], { cwd: frontend });
  } else {
    log('frontend', 'skipped (SKIP_FE=1)');
  }

  if (process.env.SKIP_RN_CI === '1') {
    log('runtime_node', 'npm ci skipped (SKIP_RN_CI=1)');
  } else {
    try {
      run('runtime_node_ci', npmCmd, ['ci'], { cwd: rn });
    } catch (e) {
      if (fs.existsSync(path.join(rn, 'node_modules')) && fs.existsSync(path.join(rn, 'dist', 'index.js'))) {
        log('runtime_node_ci', `skipped after failure — using existing node_modules (${e.message})`);
      } else {
        throw e;
      }
    }
  }
  const distIndex = path.join(rn, 'dist', 'index.js');
  if (process.env.SKIP_RN_BUILD === '1' && fs.existsSync(distIndex)) {
    log('runtime_node_build', 'skipped (SKIP_RN_BUILD=1)');
  } else {
    run('runtime_node_build', npmCmd, ['run', 'build'], { cwd: rn });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stage = path.join(release, `vps-smoke-${stamp}`);
  fs.mkdirSync(stage, { recursive: true });

  copyFiltered(path.join(rn, 'dist'), path.join(stage, 'runtime-node', 'dist'), () => false);
  for (const f of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(rn, f), path.join(stage, 'runtime-node', f));
  }
  copyFiltered(path.join(root, 'contracts'), path.join(stage, 'contracts'), () => false);
  if (fs.existsSync(path.join(frontend, 'dist'))) {
    copyFiltered(path.join(frontend, 'dist'), path.join(stage, 'frontend-dist'), () => false);
  }
  const unitSrc = path.join(rn, 'deploy', 'jasefly-node.service');
  if (fs.existsSync(unitSrc)) {
    fs.mkdirSync(path.join(stage, 'deploy'), { recursive: true });
    fs.copyFileSync(unitSrc, path.join(stage, 'deploy', 'jasefly-node.service'));
  }

  const phpHits = findPhpFiles(stage);
  if (phpHits.length) {
    throw new Error(`PHP files in stage: ${phpHits.slice(0, 5).join(', ')}`);
  }
  log('php_scan', 'no .php in stage');

  const stageRn = path.join(stage, 'runtime-node');
  run('stage_prod_deps', npmCmd, ['ci', '--omit=dev'], { cwd: stageRn });

  const storage = path.join(stageRn, 'storage');
  fs.mkdirSync(path.join(storage, 'sqlite'), { recursive: true });
  const dbPath = path.join(storage, 'sqlite', 'cms.sqlite');
  const jwt = 'smoke-test-jwt-' + stamp.slice(-8);

  run('migrate', process.execPath, [path.join(stageRn, 'dist', 'cli', 'migrate.js'), '--install'], {
    cwd: stageRn,
    env: {
      JWT_SECRET: jwt,
      DB_DRIVER: 'sqlite',
      DB_PATH: dbPath,
      STORAGE_PATH: storage,
      PORT: '3099',
      APP_URL: 'http://127.0.0.1:3099',
    },
  });

  const port = 3099;
  const healthUrl = `http://127.0.0.1:${port}/api/v1/health`;
  const child = spawn(process.execPath, [path.join(stageRn, 'dist', 'index.js')], {
    cwd: stageRn,
    env: {
      ...process.env,
      JWT_SECRET: jwt,
      DB_DRIVER: 'sqlite',
      DB_PATH: dbPath,
      STORAGE_PATH: storage,
      PORT: String(port),
      APP_URL: `http://127.0.0.1:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let bootLog = '';
  child.stdout?.on('data', (d) => {
    bootLog += d;
  });
  child.stderr?.on('data', (d) => {
    bootLog += d;
  });

  try {
    const health = await waitForHealth(healthUrl);
    log('health', JSON.stringify(health.data));
  } finally {
    child.kill('SIGTERM');
    await new Promise((res) => child.on('close', res));
  }

  fs.writeFileSync(
    path.join(stage, 'smoke-meta.json'),
    JSON.stringify({ stamp, stage, health: healthUrl, boot_log_tail: bootLog.slice(-2000) }, null, 2),
  );

  console.log('OK vps-smoke', stage);
}

main().catch((e) => {
  console.error('[vps-smoke] FAIL', e.message || e);
  process.exit(1);
});
