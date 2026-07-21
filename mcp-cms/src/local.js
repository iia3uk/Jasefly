/**
 * Local build / test runners for the deploy gate.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, markBuild, markTest, readGate, sha256File } from './gate.js';

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, timeoutMs?: number }} [opts]
 */
function run(cmd, args, opts = {}) {
  const cwd = opts.cwd || repoRoot();
  const timeout = opts.timeoutMs ?? 15 * 60 * 1000;
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
    stdout: stdout.slice(-12000),
    stderr: stderr.slice(-12000),
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
 * Step 1: build frontend + hosting update package.
 * @returns {Record<string, unknown>}
 */
export function localBuild() {
  const root = repoRoot();
  const frontend = path.join(root, 'frontend');
  const logs = [];

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

  const zip = String(gate.zip_path);
  if (!fs.existsSync(zip)) {
    markTest({ test_ok: false });
    return { ok: false, error: `ZIP пропал: ${zip}`, gate: readGate() };
  }

  // List zip entries via tar (Windows) or powershell
  let listing = '';
  const tarList = run('tar', ['-tf', zip], { cwd: root, timeoutMs: 120000 });
  if (tarList.ok) {
    listing = tarList.stdout;
  } else {
    const ps = run(
      'powershell',
      ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('${zip.replace(/'/g, "''")}').Entries | ForEach-Object { $_.FullName }`],
      { cwd: root, timeoutMs: 120000 },
    );
    listing = ps.ok ? ps.stdout : '';
    checks.push({ name: 'zip_list', ok: ps.ok || tarList.ok, detail: listing ? 'listed' : (ps.stderr || tarList.stderr).slice(0, 500) });
  }

  const need = ['index.html', 'api/src/Bootstrap.php', 'api/public/index.php'];
  const missing = need.filter((n) => {
    const re = new RegExp(`(^|[\\\\/])${n.replace(/\./g, '\\.')}$`, 'im');
    // tar may list as ./index.html or index.html
    return !listing.split(/\r?\n/).some((line) => {
      const norm = line.replace(/^\.\//, '').replace(/\\/g, '/');
      return norm === n || norm.endsWith('/' + n);
    }) && !listing.includes(n);
  });
  // simpler includes check
  const missing2 = need.filter((n) => !listing.replace(/\\/g, '/').includes(n));
  const miss = missing2;
  checks.push({
    name: 'zip_markers',
    ok: miss.length === 0,
    missing: miss,
    entries_sample: listing.split(/\r?\n/).filter(Boolean).slice(0, 15),
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
