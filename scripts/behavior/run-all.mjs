#!/usr/bin/env node
/**
 * Full behavioral parity gate:
 * 1) extract behavior manifests
 * 2) generate cases
 * 3) seed dual DBs
 * 4) boot Node + PHP (restart PHP each chunk — php -S can stall)
 * 5) run behavior-runner in chunks
 * 6) frontend dual smoke + auto module status
 *
 * Infra note: php -S writes an access line to stdout per request. If stdout is a
 * full pipe with no reader, the server blocks → fetch AbortController storms.
 * Always drain child stdout/stderr into a ring buffer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nodeBin = process.execPath;
const LOG_RING = 240;

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

/** Ring buffer of recent child log lines (for infra dumps). */
function createLogRing(capacity = LOG_RING) {
  const lines = [];
  return {
    push(tag, chunk) {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        lines.push(`[${tag}] ${line}`);
        if (lines.length > capacity) lines.shift();
      }
      if (process.env.BEHAVIOR_VERBOSE) {
        process.stderr.write(`[${tag}] ${text}`);
      }
    },
    dump(label = 'server-logs') {
      if (!lines.length) {
        console.error(`-- ${label}: (empty) --`);
        return;
      }
      console.error(`-- ${label} (last ${lines.length} lines) --`);
      for (const line of lines) console.error(line);
    },
    clear() {
      lines.length = 0;
    },
  };
}

function attachDrain(proc, name, ring) {
  if (!proc) return;
  if (proc.stdout) {
    proc.stdout.on('data', (d) => ring.push(`${name}:out`, d));
  }
  if (proc.stderr) {
    proc.stderr.on('data', (d) => ring.push(`${name}:err`, d));
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProc(proc, label = 'child') {
  if (!proc || !proc.pid) return;
  const pid = proc.pid;
  if (proc.killed && !pidAlive(pid)) return;
  try {
    proc.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    return;
  }
  // Linux/mac: escalate to SIGKILL if still alive (stuck on full pipe / hung syscall).
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline && pidAlive(pid)) {
    spawnSync(process.execPath, ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50)'], {
      stdio: 'ignore',
      timeout: 200,
    });
  }
  if (pidAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* ignore */
    }
    try {
      spawnSync('kill', ['-9', String(pid)], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  }
  if (pidAlive(pid)) {
    console.error(`[cleanup] WARN ${label} pid=${pid} still alive after SIGKILL`);
  }
}

function listParityListenPids(ports) {
  if (process.platform === 'win32') return [];
  const found = [];
  for (const port of ports) {
    const r = spawnSync('bash', ['-lc', `ss -ltnp "sport = :${port}" 2>/dev/null || true`], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    for (const m of out.matchAll(/pid=(\d+)/g)) {
      found.push({ port, pid: Number(m[1]) });
    }
  }
  return found;
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

async function healthBoth(nodePort, phpPort) {
  const probe = async (label, url) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: ac.signal });
      return { label, ok: res.status === 200, status: res.status, ms: Date.now() - started };
    } catch (e) {
      return { label, ok: false, status: 0, ms: Date.now() - started, error: String(e.message || e) };
    } finally {
      clearTimeout(t);
    }
  };
  const [node, php] = await Promise.all([
    probe('node', `http://127.0.0.1:${nodePort}/api/v1/health`),
    probe('php', `http://127.0.0.1:${phpPort}/api/v1/health`),
  ]);
  return { node, php, ok: node.ok && php.ok };
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
  // CI sets BEHAVIOR_CHUNK=200. Default: smaller on Windows (php -S), larger elsewhere.
  const chunkSize = Number(process.env.BEHAVIOR_CHUNK || (process.platform === 'win32' ? 150 : 200));
  const logRing = createLogRing();

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
  attachDrain(nodeProc, 'node', logRing);
  console.log(`node pid=${nodeProc.pid} port=${nodePort}`);

  let phpProc = null;
  const bootPhp = async () => {
    killProc(phpProc, 'php');
    phpProc = null;
    // Ensure previous listener released the port before rebinding.
    const portWaitStart = Date.now();
    while (Date.now() - portWaitStart < 5000) {
      const busy = await new Promise((resolve) => {
        const s = net.createServer();
        s.once('error', () => resolve(true));
        s.listen(phpPort, '127.0.0.1', () => {
          s.close(() => resolve(false));
        });
      });
      if (!busy) break;
      await new Promise((r) => setTimeout(r, 100));
    }
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
    attachDrain(phpProc, 'php', logRing);
    console.log(`php pid=${phpProc.pid} port=${phpPort}`);
    phpProc.on('exit', (code, signal) => {
      // Expected on chunk restart (SIGTERM); keep off stdout noise unless verbose/error.
      if (process.env.BEHAVIOR_VERBOSE || (code !== 0 && code !== null && signal !== 'SIGTERM')) {
        console.error(`[php] exit code=${code} signal=${signal}`);
      }
    });
    return phpProc;
  };

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    killProc(nodeProc, 'node');
    killProc(phpProc, 'php');
    const leftover = listParityListenPids([nodePort, phpPort]);
    if (leftover.length) {
      console.error(`[cleanup] leftover listeners: ${JSON.stringify(leftover)}`);
      for (const row of leftover) {
        try {
          process.kill(row.pid, 'SIGKILL');
        } catch {
          /* ignore */
        }
      }
    } else {
      console.log(`[cleanup] ports ${nodePort}/${phpPort} clear (no leftover listeners)`);
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  let exitCode = 1;
  try {
    await bootPhp();
    await waitPort(nodePort);
    await waitPort(phpPort);
    const health0 = await healthBoth(nodePort, phpPort);
    console.log(
      `health node=${health0.node.status}/${health0.node.ms}ms php=${health0.php.status}/${health0.php.ms}ms pids node=${nodeProc.pid} php=${phpProc?.pid}`,
    );
    if (!health0.ok) {
      logRing.dump('boot-health-fail');
      throw new Error(
        `INFRA: boot health failed node=${JSON.stringify(health0.node)} php=${JSON.stringify(health0.php)}`,
      );
    }

    const totalCases = countAuthCases();
    const mergeFile = path.join(root, 'tmp', 'behavior-results', 'last.json');
    fs.mkdirSync(path.dirname(mergeFile), { recursive: true });
    if (fs.existsSync(mergeFile)) fs.unlinkSync(mergeFile);

    console.log(`== behavior runner (${totalCases} cases, chunk=${chunkSize}) ==`);
    console.log(
      `infra: fetch_ms=${process.env.BEHAVIOR_FETCH_MS || 20000} health_every=${process.env.BEHAVIOR_HEALTH_EVERY || 25} stdout/stderr drained=yes`,
    );
    let runnerOk = true;
    let infraFailed = false;

    for (let offset = 0; offset < totalCases; offset += chunkSize) {
      if (offset > 0) {
        await bootPhp();
        await waitPort(phpPort);
        const h = await healthBoth(nodePort, phpPort);
        console.log(
          `post-restart health node=${h.node.status}/${h.node.ms}ms php=${h.php.status}/${h.php.ms}ms php_pid=${phpProc?.pid}`,
        );
        if (!h.ok) {
          logRing.dump('chunk-restart-health-fail');
          console.error(
            `INFRA: health failed after PHP restart at offset=${offset}: node=${JSON.stringify(h.node)} php=${JSON.stringify(h.php)}`,
          );
          infraFailed = true;
          break;
        }
      }
      console.log(`-- chunk offset=${offset} limit=${chunkSize} --`);
      const chunkStarted = Date.now();
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
          BEHAVIOR_HEALTH_EVERY: process.env.BEHAVIOR_HEALTH_EVERY || '25',
          BEHAVIOR_FETCH_MS: process.env.BEHAVIOR_FETCH_MS || '20000',
          BEHAVIOR_NODE_PID: String(nodeProc.pid || ''),
          BEHAVIOR_PHP_PID: String(phpProc?.pid || ''),
        },
        allowFail: true,
        timeout: 60 * 60 * 1000,
      });
      process.stdout.write(runner.stdout || '');
      process.stderr.write(runner.stderr || '');
      console.log(`chunk offset=${offset} elapsed_ms=${Date.now() - chunkStarted} exit=${runner.status}`);

      if (runner.status === 2 || /INFRA[:\s]/i.test(`${runner.stdout || ''}\n${runner.stderr || ''}`)) {
        infraFailed = true;
        logRing.dump('infra-fail');
        console.error(
          `INFRA: behavior-runner aborted chunk offset=${offset} (exit=${runner.status}). Stopping remaining chunks.`,
        );
        break;
      }
      if (runner.status !== 0) runnerOk = false;

      // Between chunks: confirm no orphan listeners + both runtimes alive.
      const midHealth = await healthBoth(nodePort, phpPort);
      if (!midHealth.ok) {
        infraFailed = true;
        logRing.dump('between-chunk-health-fail');
        console.error(`INFRA: health failed after chunk offset=${offset}: ${JSON.stringify(midHealth)}`);
        break;
      }
    }

    if (infraFailed) {
      exitCode = 2;
    } else {
      // Final require-mode gate on merged summary
      const requireMode = process.env.BEHAVIOR_REQUIRE || 'all';
      if (fs.existsSync(mergeFile)) {
        const summary = JSON.parse(fs.readFileSync(mergeFile, 'utf8'));
        const authFailed = (summary.results || []).filter(
          (r) =>
            !r.ok &&
            (String(r.id).includes('::unauthenticated') || String(r.id).includes('::invalid-token')),
        );
        const infraCount = Number(summary.infra || 0);
        console.log(
          `merged: passed=${summary.passed} failed=${summary.failed} infra=${infraCount} total=${summary.total} auth_failed=${authFailed.length}`,
        );
        if (infraCount > 0) {
          console.error(
            'INFRA: merged summary contains infrastructure aborts — treating as infra failure',
          );
          exitCode = 2;
        } else if (requireMode === 'auth') {
          runnerOk = authFailed.length === 0;
          exitCode = runnerOk ? 0 : 1;
        } else {
          runnerOk = summary.failed === 0;
          exitCode = runnerOk ? 0 : 1;
        }
      } else {
        exitCode = runnerOk ? 0 : 1;
      }

      if (exitCode !== 2) {
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

        exitCode = exitCode === 0 && fe.status === 0 ? 0 : 1;
      }
    }
  } catch (e) {
    logRing.dump('fatal');
    console.error(e);
    exitCode = /INFRA/i.test(String(e && e.message)) ? 2 : 1;
  } finally {
    cleanup();
  }
  process.exit(exitCode);
}

main();
