#!/usr/bin/env node
/**
 * Full behavioral parity gate:
 * 1) extract behavior manifests
 * 2) generate cases
 * 3) seed dual DBs
 * 4) boot Node + PHP (restart PHP each chunk — Windows php -S can stall)
 * 5) run behavior-runner in chunks
 * 6) frontend dual smoke + auto module status
 */
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
    shell: opts.shell,
  });
  if (r.status !== 0 && !opts.allowFail) {
    console.error(r.stdout || '');
    console.error(r.stderr || '');
    throw new Error(`fail: ${cmd} ${args.join(' ')}`);
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
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`port ${port} not ready`);
}

function freePort(preferred) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(preferred, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', () => {
      const s2 = net.createServer();
      s2.listen(0, '127.0.0.1', () => {
        const { port } = s2.address();
        s2.close(() => resolve(port));
      });
      s2.on('error', reject);
    });
  });
}

function killProc(proc) {
  if (!proc || proc.killed) return;
  try {
    proc.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  try {
    if (process.platform === 'win32' && proc.pid) {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    }
  } catch {
    /* ignore */
  }
}

function buildPhpArgs(phpBin, phpPort) {
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
  } else if (process.platform === 'win32') {
    try {
      const phpDir = path.dirname(
        phpBin === 'php' ? run(phpBin, ['-r', 'echo PHP_BINARY;']).stdout.trim() : phpBin,
      );
      const extDir = path.join(phpDir, 'ext');
      if (fs.existsSync(extDir)) {
        phpArgs.push(
          '-d',
          `extension_dir=${extDir}`,
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
    } catch {
      phpArgs.push('-d', 'extension=pdo_sqlite');
    }
  } else {
    phpArgs.push('-d', 'extension=pdo_sqlite');
  }
  phpArgs.push('-S', `127.0.0.1:${phpPort}`, path.join(root, 'scripts/behavior/php-router.php'));
  return phpArgs;
}

function countAuthCases() {
  const dir = path.join(root, 'tests/parity/generated');
  const scenarios = (process.env.BEHAVIOR_SCENARIOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (process.env.BEHAVIOR_MODULE && c.module !== process.env.BEHAVIOR_MODULE) continue;
    if (scenarios.length && !scenarios.some((s) => c.id.includes('::' + s))) continue;
    n++;
  }
  const max = Number(process.env.BEHAVIOR_MAX || 0);
  return max > 0 ? Math.min(n, max) : n;
}

async function main() {
  console.log('== extract behavior ==');
  run(nodeBin, ['scripts/behavior/extract-behavior.mjs']);

  console.log('== generate cases ==');
  run(nodeBin, ['scripts/behavior/generate-cases.mjs']);

  console.log('== seed dual db ==');
  const seed = run(nodeBin, ['scripts/behavior/seed-dual-db.mjs']);
  const metaLine = (seed.stdout || '').trim().split('\n').filter(Boolean).pop();
  const meta = JSON.parse(metaLine);
  fs.writeFileSync(path.join(meta.base, 'meta.json'), JSON.stringify(meta, null, 2));

  const nodePort = await freePort(3081);
  const phpPort = await freePort(3082);
  const phpBin = process.env.PHP_BIN || 'php';
  const chunkSize = Number(process.env.BEHAVIOR_CHUNK || (process.platform === 'win32' ? 150 : 400));

  const nodeEnv = {
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
  };

  console.log(`== boot Node :${nodePort} ==`);
  const nodeProc = spawn(nodeBin, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.join(root, 'runtime-node'),
    env: nodeEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  nodeProc.stderr.on('data', (d) => {
    if (process.env.BEHAVIOR_VERBOSE) process.stderr.write(d);
  });

  let phpProc = null;
  const bootPhp = () => {
    killProc(phpProc);
    const phpEnv = {
      ...process.env,
      BEHAVIOR_PHP_DB: meta.phpDb,
      BEHAVIOR_PHP_STORAGE: meta.phpStorage,
      BEHAVIOR_JWT_SECRET: meta.jwtSecret,
      BEHAVIOR_MCP_TOKEN: meta.mcpToken,
      BEHAVIOR_PHP_URL: `http://127.0.0.1:${phpPort}`,
    };
    const phpArgs = buildPhpArgs(phpBin, phpPort);
    console.log(`== boot PHP :${phpPort} ==`);
    phpProc = spawn(phpBin, phpArgs, { cwd: root, env: phpEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    phpProc.stderr.on('data', (d) => {
      if (process.env.BEHAVIOR_VERBOSE) process.stderr.write(d);
    });
    return phpProc;
  };

  const cleanup = () => {
    killProc(nodeProc);
    killProc(phpProc);
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  try {
    bootPhp();
    await waitPort(nodePort);
    await waitPort(phpPort);
    const h1 = await fetch(`http://127.0.0.1:${nodePort}/api/v1/health`);
    const h2 = await fetch(`http://127.0.0.1:${phpPort}/api/v1/health`);
    console.log(`health node=${h1.status} php=${h2.status}`);

    const totalCases = countAuthCases();
    const mergeFile = path.join(root, 'tmp', 'behavior-results', 'last.json');
    fs.mkdirSync(path.dirname(mergeFile), { recursive: true });
    if (fs.existsSync(mergeFile)) fs.unlinkSync(mergeFile);

    console.log(`== behavior runner (${totalCases} cases, chunk=${chunkSize}) ==`);
    let runnerOk = true;
    for (let offset = 0; offset < totalCases; offset += chunkSize) {
      if (offset > 0) {
        bootPhp();
        await waitPort(phpPort);
      }
      console.log(`-- chunk offset=${offset} limit=${chunkSize} --`);
      const runner = run(nodeBin, ['tests/parity/behavior-runner.mjs'], {
        env: {
          PHP_BASE: `http://127.0.0.1:${phpPort}/api/v1`,
          NODE_BASE: `http://127.0.0.1:${nodePort}/api/v1`,
          BEHAVIOR_META: path.join(meta.base, 'meta.json'),
          BEHAVIOR_MODULE: process.env.BEHAVIOR_MODULE || '',
          BEHAVIOR_MAX: process.env.BEHAVIOR_MAX || '',
          BEHAVIOR_OFFSET: String(offset),
          BEHAVIOR_LIMIT: String(chunkSize),
          BEHAVIOR_MERGE_INTO: mergeFile,
          BEHAVIOR_SCENARIOS: process.env.BEHAVIOR_SCENARIOS || '',
          BEHAVIOR_REQUIRE: 'all', // chunk exits on its own fails; final gate below
          BEHAVIOR_FAIL_FAST: process.env.BEHAVIOR_FAIL_FAST || '',
          BEHAVIOR_VERBOSE: process.env.BEHAVIOR_VERBOSE || '',
          BEHAVIOR_PROGRESS_EVERY: process.env.BEHAVIOR_PROGRESS_EVERY || '50',
        },
        allowFail: true,
        timeout: 60 * 60 * 1000,
      });
      process.stdout.write(runner.stdout || '');
      process.stderr.write(runner.stderr || '');
      if (runner.status !== 0) runnerOk = false;
    }

    // Final require-mode gate on merged summary
    const requireMode = process.env.BEHAVIOR_REQUIRE || 'all';
    if (fs.existsSync(mergeFile)) {
      const summary = JSON.parse(fs.readFileSync(mergeFile, 'utf8'));
      const authFailed = (summary.results || []).filter(
        (r) =>
          !r.ok &&
          (String(r.id).includes('::unauthenticated') || String(r.id).includes('::invalid-token')),
      );
      console.log(
        `merged: passed=${summary.passed} failed=${summary.failed} total=${summary.total} auth_failed=${authFailed.length}`,
      );
      if (requireMode === 'auth') runnerOk = authFailed.length === 0;
      else runnerOk = summary.failed === 0;
    }

    console.log('== frontend dual smoke ==');
    const fe = run(nodeBin, ['scripts/behavior/frontend-dual-smoke.mjs'], {
      env: {
        PHP_BASE: `http://127.0.0.1:${phpPort}/api/v1`,
        NODE_BASE: `http://127.0.0.1:${nodePort}/api/v1`,
      },
      allowFail: true,
    });
    process.stdout.write(fe.stdout || '');
    process.stderr.write(fe.stderr || '');

    console.log('== module status ==');
    run(nodeBin, ['scripts/behavior/module-status.mjs']);

    cleanup();
    process.exit(runnerOk && fe.status === 0 ? 0 : 1);
  } catch (e) {
    cleanup();
    console.error(e);
    process.exit(1);
  }
}

main();
