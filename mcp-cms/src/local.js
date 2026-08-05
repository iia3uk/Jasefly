/**
 * Local build / test runners for the deploy gate.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, markBuild, markTest, readGate, sha256File } from './gate.js';
import { buildVpsArtifact } from './deploy/vps.js';

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, timeoutMs?: number }} [opts]
 */
function run(cmd, args, opts = {}) {
  const cwd = opts.cwd || repoRoot();
  const timeout = opts.timeoutMs ?? 15 * 60 * 1000;
  const keepFull = Boolean(opts.fullOutput);
  const isWin = process.platform === 'win32';
  // On Windows, shell:true breaks paths with spaces (e.g. C:\Program Files\nodejs\node.exe).
  // Only use shell for .cmd/.bat shims like npm.cmd.
  const useShell = isWin && /\.(cmd|bat)$/i.test(cmd);
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: useShell,
    timeout,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    maxBuffer: 20 * 1024 * 1024,
  });
  const stdout = (r.stdout || '').trim();
  const stderr = (r.stderr || '').trim();
  return {
    ok: r.status === 0,
    status: r.status,
    // Truncating zip listings dropped early entries like ./spa.html and false-failed markers.
    stdout: keepFull ? stdout : stdout.slice(-12000),
    stderr: keepFull ? stderr : stderr.slice(-12000),
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

/** Resolve php CLI: PHP_BIN env, then common Windows paths, then `php` on PATH. */
function resolvePhpBin() {
  const fromEnv = (process.env.PHP_BIN || '').trim();
  const candidates = [
    fromEnv,
    path.join(repoRoot(), '.tools', 'php', 'php.exe'),
    'C:/xampp/php/php.exe',
    'C:/php/php.exe',
    'C:/laragon/bin/php/php.exe',
    'php',
  ].filter(Boolean);
  for (const bin of candidates) {
    if (bin === 'php') {
      const probe = run(bin, ['-v'], { timeoutMs: 8000 });
      if (probe.ok || /PHP/i.test(probe.stdout + probe.stderr)) return bin;
      continue;
    }
    if (fs.existsSync(bin)) return bin;
  }
  return fromEnv || 'php';
}

/**
 * List zip entry names via local file EOCD/central directory (no shell).
 * @param {string} zipPath
 * @returns {string[]}
 */
function listZipEntryNames(zipPath) {
  const fd = fs.openSync(zipPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 22) throw new Error('ZIP too small');
    const tailSize = Math.min(size, 65557 + 22);
    const tail = Buffer.alloc(tailSize);
    fs.readSync(fd, tail, 0, tailSize, size - tailSize);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('ZIP EOCD not found');
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    const totalEntries = tail.readUInt16LE(eocd + 10);
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
      throw new Error('ZIP64 not supported for marker check');
    }
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    /** @type {string[]} */
    const names = [];
    let off = 0;
    while (off + 46 <= cd.length && names.length < (totalEntries || 1_000_000)) {
      if (cd.readUInt32LE(off) !== 0x02014b50) break;
      const nameLen = cd.readUInt16LE(off + 28);
      const extraLen = cd.readUInt16LE(off + 30);
      const commentLen = cd.readUInt16LE(off + 32);
      names.push(cd.subarray(off + 46, off + 46 + nameLen).toString('utf8'));
      off += 46 + nameLen + extraLen + commentLen;
    }
    return names;
  } finally {
    fs.closeSync(fd);
  }
}

/** Newest jasefly-cms-update-*.zip under release/ */
export function findLatestUpdateZip() {
  const release = path.join(repoRoot(), 'release');
  if (!fs.existsSync(release)) return null;
  const files = fs.readdirSync(release)
    .filter((f) => /^jasefly-cms-update-.*\.zip$/i.test(f))
    .map((f) => {
      const full = path.join(release, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.full ?? null;
}

/**
 * Step 1: build frontend + target package.
 * @param {{ target?: 'shared' | 'vps' }} [opts]
 * @returns {Record<string, unknown>}
 */
export function localBuild(opts = {}) {
  const target = opts.target === 'vps' ? 'vps' : 'shared';
  const root = repoRoot();
  const frontend = path.join(root, 'frontend');
  const logs = [];

  if (target === 'vps') {
    const res = buildVpsArtifact();
    logs.push(...(res.logs || []));
    if (!res.ok) {
      markBuild({ build_ok: false, build_log: JSON.stringify(logs), target: 'vps' });
      return { ok: false, step: res.step || 'vps_build', logs, gate: readGate(), target: 'vps' };
    }
    markBuild({
      build_ok: true,
      zip_path: res.artifact,
      zip_sha256: sha256File(res.artifact),
      build_log: 'ok',
      target: 'vps',
    });
    return { ok: true, target: 'vps', artifact: res.artifact, stamp: res.stamp, logs, gate: readGate() };
  }

  const buildFront = run(npmCmd(), ['run', 'build'], { cwd: frontend, timeoutMs: 10 * 60 * 1000 });
  logs.push({ step: 'frontend_build', ...buildFront });
  if (!buildFront.ok) {
    markBuild({ build_ok: false, build_log: JSON.stringify(logs) });
    return { ok: false, step: 'frontend_build', logs, gate: readGate() };
  }

  const pack = run(
    process.execPath,
    [path.join(root, 'scripts', 'build-hosting.js'), '--mode=update', '--yes'],
    { cwd: root, timeoutMs: 15 * 60 * 1000 },
  );
  logs.push({ step: 'hosting_package', ...pack });
  if (!pack.ok) {
    markBuild({ build_ok: false, build_log: JSON.stringify(logs) });
    return { ok: false, step: 'hosting_package', logs, gate: readGate() };
  }

  const zip = findLatestUpdateZip();
  if (!zip) {
    markBuild({ build_ok: false, build_log: JSON.stringify(logs) });
    return { ok: false, step: 'zip_missing', error: 'ZIP не найден в release/', logs, gate: readGate() };
  }

  markBuild({
    build_ok: true,
    zip_path: zip,
    zip_sha256: sha256File(zip),
    build_log: 'ok',
    target: 'shared',
  });

  return {
    ok: true,
    zip_path: zip,
    zip_sha256: sha256File(zip),
    zip_mb: +(fs.statSync(zip).size / 1048576).toFixed(2),
    next: 'cms_local_test',
    logs: logs.map((l) => ({ step: l.step, ok: l.ok, status: l.status })),
    gate: readGate(),
  };
}

/**
 * Step 2: lint + ZIP structure checks.
 * @returns {Record<string, unknown>}
 */
export function localTest() {
  const root = repoRoot();
  const frontend = path.join(root, 'frontend');
  const gate = readGate();
  if (!gate.build_ok || !gate.zip_path) {
    return {
      ok: false,
      error: 'Сначала cms_local_build.',
      gate,
    };
  }

  const checks = [];

  const lint = run(npmCmd(), ['run', 'lint'], { cwd: frontend, timeoutMs: 5 * 60 * 1000 });
  checks.push({ name: 'frontend_lint', ok: lint.ok, detail: lint.ok ? 'ok' : (lint.stderr || lint.stdout).slice(-2000) });
  // lint failure is soft-warn if oxlint not critical — still fail gate for safety
  if (!lint.ok) {
    markTest({ test_ok: false, test_log: JSON.stringify(checks) });
    return { ok: false, step: 'frontend_lint', checks, gate: readGate(), next: 'почини lint и снова cms_local_test' };
  }

  const feTest = run(npmCmd(), ['test'], { cwd: frontend, timeoutMs: 5 * 60 * 1000 });
  checks.push({
    name: 'frontend_unit',
    ok: feTest.ok,
    detail: feTest.ok ? 'ok' : (feTest.stderr || feTest.stdout).slice(-2000),
  });
  if (!feTest.ok) {
    markTest({ test_ok: false, test_log: JSON.stringify(checks) });
    return { ok: false, step: 'frontend_unit', checks, gate: readGate(), next: 'почини frontend tests и снова cms_local_test' };
  }

  const zip = String(gate.zip_path);
  if (!fs.existsSync(zip)) {
    markTest({ test_ok: false });
    return { ok: false, error: `ZIP пропал: ${zip}`, gate: readGate() };
  }

  // Pure Node central-directory listing — no PowerShell/tar (shell listings were flaky / truncated).
  let entryNames = [];
  try {
    entryNames = listZipEntryNames(zip);
  } catch (e) {
    const tarList = run('tar', ['-tf', zip], { cwd: root, timeoutMs: 120000, fullOutput: true });
    entryNames = tarList.ok
      ? tarList.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : [];
    checks.push({
      name: 'zip_list',
      ok: entryNames.length > 0,
      detail: entryNames.length
        ? 'tar fallback'
        : ((e instanceof Error ? e.message : String(e)) + ' | ' + (tarList.stderr || '')).slice(0, 500),
    });
  }

  const need = ['spa.html', 'index.php', 'api/src/Bootstrap.php', 'api/public/index.php'];
  const norms = new Set(
    entryNames
      .map((line) => line.replace(/^\.\//, '').replace(/\\/g, '/').replace(/^\/+/, '').trim())
      .filter(Boolean),
  );
  const miss = need.filter((n) => {
    if (norms.has(n)) return false;
    for (const e of norms) {
      if (e === n || e.endsWith('/' + n)) return false;
    }
    return false;
  });
  checks.push({
    name: 'zip_markers',
    ok: miss.length === 0,
    missing: miss,
    entries_sample: entryNames.slice(0, 15),
    entries_total: entryNames.length,
  });

  if (miss.length) {
    markTest({ test_ok: false, test_log: JSON.stringify(checks) });
    return { ok: false, step: 'zip_markers', checks, gate: readGate() };
  }

  // PHP syntax lint — mandatory when PHP_BIN/php available.
  // Lint the whole backend tree that ships in update ZIPs (modules/controllers/services…).
  // Skipping silently used to let ParseError reach production (SystemModule hotfix).
  const phpBin = resolvePhpBin();
  const phpRoots = [
    path.join(root, 'backend/src'),
    path.join(root, 'backend/migrations'),
  ];
  /** @type {string[]} */
  const phpFiles = [];
  for (const dir of phpRoots) {
    if (!fs.existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const name of fs.readdirSync(cur)) {
        const full = path.join(cur, name);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.isDirectory()) stack.push(full);
        else if (st.isFile() && name.endsWith('.php')) phpFiles.push(full);
      }
    }
  }
  // Always include install/migrate entrypoints if present
  for (const extra of ['backend/install.php', 'backend/migrate.php', 'backend/public/index.php']) {
    const full = path.join(root, extra);
    if (fs.existsSync(full) && !phpFiles.includes(full)) phpFiles.push(full);
  }

  let phpMissing = false;
  let phpFailed = null;
  let phpOkCount = 0;
  for (const f of phpFiles) {
    const r = run(phpBin, ['-l', f], { cwd: root, timeoutMs: 30000 });
    const missingPhp = Boolean(
      (r.error && /not recognized|ENOENT|не является|не распознан/i.test(r.error))
      || (!r.ok && /not recognized|ENOENT|не является|не распознан/i.test(`${r.stderr}\n${r.stdout}`)),
    );
    if (missingPhp) {
      phpMissing = true;
      break;
    }
    if (!r.ok) {
      phpFailed = { file: path.relative(root, f).replace(/\\/g, '/'), detail: (r.stdout || r.stderr || r.error || '').slice(0, 500) };
      break;
    }
    phpOkCount += 1;
  }

  if (phpMissing) {
    // Hard fail: without php -l we already shipped a ParseError to production once.
    markTest({ test_ok: false, test_log: JSON.stringify(checks) });
    checks.push({
      name: 'php_lint',
      ok: false,
      detail: 'php не найден. Задай PHP_BIN в mcp-cms/.env (напр. C:/xampp/php/php.exe). Без lint деплой запрещён.',
    });
    return { ok: false, step: 'php_lint', checks, gate: readGate(), next: 'поставь PHP_BIN и снова cms_local_test' };
  }

  if (phpFailed) {
    checks.push({ name: 'php_lint', ok: false, ...phpFailed });
    markTest({ test_ok: false, test_log: JSON.stringify(checks) });
    return { ok: false, step: 'php_lint', checks, gate: readGate(), next: 'почини PHP syntax и снова cms_local_test' };
  }

  checks.push({ name: 'php_lint', ok: true, files: phpOkCount, detail: `ok (${phpOkCount} files)` });

  // Lint critical PHP paths FROM THE ZIP (what the host actually receives)
  const zipCritical = [
    'api/src/Modules/System/SystemModule.php',
    'api/src/Core/ModuleRegistry.php',
    'api/src/Bootstrap.php',
    'api/public/index.php',
  ];
  const tmpLint = path.join(root, 'mcp-cms', '.tmp-php-lint');
  try {
    fs.rmSync(tmpLint, { recursive: true, force: true });
    fs.mkdirSync(tmpLint, { recursive: true });
    const extract = run('tar', ['-xf', zip, '-C', tmpLint, ...zipCritical], { cwd: root, timeoutMs: 60000 });
    if (!extract.ok) {
      // Windows tar may need ./ prefix
      const extract2 = run(
        'tar',
        ['-xf', zip, '-C', tmpLint, ...zipCritical.map((p) => `./${p}`)],
        { cwd: root, timeoutMs: 60000 },
      );
      if (!extract2.ok) {
        checks.push({ name: 'php_lint_zip_extract', ok: false, detail: (extract.stderr || extract2.stderr || 'extract failed').slice(0, 400) });
        markTest({ test_ok: false, test_log: JSON.stringify(checks) });
        return { ok: false, step: 'php_lint_zip', checks, gate: readGate() };
      }
    }
    for (const rel of zipCritical) {
      const candidates = [
        path.join(tmpLint, rel),
        path.join(tmpLint, rel.replace(/\//g, path.sep)),
      ];
      const full = candidates.find((c) => fs.existsSync(c));
      if (!full) {
        checks.push({ name: `php_lint_zip:${rel}`, ok: false, detail: 'файл не найден в ZIP' });
        markTest({ test_ok: false, test_log: JSON.stringify(checks) });
        return { ok: false, step: 'php_lint_zip', checks, gate: readGate() };
      }
      const r = run(phpBin, ['-l', full], { cwd: root, timeoutMs: 30000 });
      if (!r.ok) {
        checks.push({ name: `php_lint_zip:${rel}`, ok: false, detail: (r.stdout || r.stderr).slice(0, 500) });
        markTest({ test_ok: false, test_log: JSON.stringify(checks) });
        return { ok: false, step: 'php_lint_zip', checks, gate: readGate() };
      }
    }
    checks.push({ name: 'php_lint_zip', ok: true, detail: `ok (${zipCritical.length} critical files from ZIP)` });
  } finally {
    try { fs.rmSync(tmpLint, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  // PHP unit / smoke tests (same harness as CI job sdk)
  const phpTests = run(phpBin, ['backend/tests/run.php'], { cwd: root, timeoutMs: 5 * 60 * 1000 });
  checks.push({
    name: 'php_unit',
    ok: phpTests.ok,
    detail: phpTests.ok ? 'ok' : (phpTests.stderr || phpTests.stdout).slice(-3000),
  });
  if (!phpTests.ok) {
    markTest({ test_ok: false, test_log: JSON.stringify(checks) });
    return { ok: false, step: 'php_unit', checks, gate: readGate(), next: 'почини php backend/tests/run.php и снова cms_local_test' };
  }

  markTest({ test_ok: true, test_log: 'ok' });
  return {
    ok: true,
    zip_path: zip,
    zip_sha256: sha256File(zip),
    checks,
    next: 'cms_changelog',
    gate: readGate(),
  };
}
