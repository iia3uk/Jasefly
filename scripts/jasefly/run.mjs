import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

export function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function phpBin() {
  return process.env.PHP_BIN || 'php';
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string,string>, timeoutMs?: number, allowFail?: boolean, shell?: boolean }} [opts]
 */
export function run(cmd, args, opts = {}) {
  const isWin = process.platform === 'win32';
  // Only shell for .cmd/.bat — shell:true breaks "C:\Program Files\nodejs\node.exe"
  const useShell =
    opts.shell !== undefined
      ? opts.shell
      : isWin && /\.(cmd|bat)$/i.test(String(cmd));
  /** @type {import('node:child_process').SpawnSyncOptions} */
  const spawnOpts = {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: 'utf8',
    shell: useShell,
  };
  // timeoutMs 0 / null → no timeout (long-running dev servers)
  if (opts.timeoutMs !== 0 && opts.timeoutMs != null) {
    spawnOpts.timeout = opts.timeoutMs;
  } else if (opts.timeoutMs === undefined) {
    spawnOpts.timeout = 30 * 60 * 1000;
  }
  const r = spawnSync(cmd, args, spawnOpts);
  const ok = r.status === 0;
  if (!ok && !opts.allowFail) {
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    const err = new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`);
    /** @type {any} */ (err).status = r.status ?? 1;
    throw err;
  }
  return {
    ok,
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

/** @param {string} rel */
export function abs(...rel) {
  return path.join(ROOT, ...rel);
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/** Latest matching file in release/ by mtime. */
export function findLatestRelease(pattern) {
  const release = abs('release');
  if (!fs.existsSync(release)) return null;
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  const files = fs
    .readdirSync(release)
    .filter((f) => re.test(f))
    .map((f) => {
      const full = path.join(release, f);
      return { full, mtime: fs.statSync(full).mtimeMs, size: fs.statSync(full).size };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

export function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0) return null;
  const line = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return line || null;
}
