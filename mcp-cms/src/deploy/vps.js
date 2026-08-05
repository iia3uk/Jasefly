/**
 * VPS (Node runtime) atomic deploy via SSH.
 * Secrets only from env refs — never returned to tool listings.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../gate.js';

/**
 * @typedef {{
 *   id: string,
 *   runtime?: string,
 *   deployment?: string,
 *   deployPath?: string,
 *   sshHost?: string,
 *   sshUser?: string,
 *   sshKeyPath?: string,
 *   restartCommand?: string,
 *   healthcheckUrl?: string,
 *   url: string,
 * }} VpsSite
 */

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: false,
    timeout: opts.timeoutMs ?? 10 * 60 * 1000,
    env: process.env,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').slice(-8000),
    stderr: (r.stderr || '').slice(-8000),
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

/** Reject path segments that break single-quoted remote shell fragments. */
function assertSafeRemoteToken(value, label) {
  if (!value || /['"\\;\s`$|&<>]/.test(value)) {
    throw new Error(`unsafe ${label} for remote shell`);
  }
  return value;
}

/**
 * HTTP healthcheck from the MCP host (not a remote claim).
 * @param {string} url
 * @param {{ timeoutMs?: number, retries?: number }} [opts]
 */
function probeHealth(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const retries = opts.retries ?? 5;
  let last = { ok: false, status: null, error: 'not attempted' };
  for (let i = 0; i < retries; i++) {
    const r = spawnSync(
      process.execPath,
      [
        '-e',
        `
const u = ${JSON.stringify(url)};
fetch(u, { signal: AbortSignal.timeout(${timeoutMs}) })
  .then(async (res) => {
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    const healthy = res.ok && json && (json.success === true || json.data?.status === 'ok');
    if (!healthy) {
      console.error(JSON.stringify({ status: res.status, body: text.slice(0, 300) }));
      process.exit(2);
    }
    process.exit(0);
  })
  .catch((e) => { console.error(String(e && e.message || e)); process.exit(3); });
`,
      ],
      { encoding: 'utf8', timeout: timeoutMs + 5000 },
    );
    last = {
      ok: r.status === 0,
      status: r.status,
      error: (r.stderr || r.stdout || '').slice(0, 500),
    };
    if (last.ok) return last;
    spawnSync(process.execPath, ['-e', 'const t=Date.now()+1500; while(Date.now()<t);'], {
      timeout: 5000,
    });
  }
  return last;
}

/** Build Node VPS artifact (tarball of runtime-node + frontend dist + contracts). */
export function buildVpsArtifact() {
  const root = repoRoot();
  const logs = [];
  const frontend = path.join(root, 'frontend');
  const rn = path.join(root, 'runtime-node');
  const release = path.join(root, 'release');
  fs.mkdirSync(release, { recursive: true });

  const fe2 = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: frontend,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 10 * 60 * 1000,
    env: { ...process.env, CI: '1' },
  });
  logs.push({ step: 'frontend_build', ok: fe2.status === 0, stderr: (fe2.stderr || '').slice(-4000) });
  if (fe2.status !== 0) {
    return { ok: false, step: 'frontend_build', logs };
  }

  const ni = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], {
    cwd: rn,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 10 * 60 * 1000,
    env: { ...process.env, CI: '1' },
  });
  if (ni.status !== 0) {
    const ni2 = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], {
      cwd: rn,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 10 * 60 * 1000,
    });
    logs.push({ step: 'runtime_node_install', ok: ni2.status === 0 });
    if (ni2.status !== 0) return { ok: false, step: 'runtime_node_install', logs };
  } else {
    logs.push({ step: 'runtime_node_install', ok: true });
  }

  const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: rn,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 10 * 60 * 1000,
  });
  logs.push({ step: 'runtime_node_build', ok: build.status === 0, stderr: (build.stderr || '').slice(-4000) });
  if (build.status !== 0) return { ok: false, step: 'runtime_node_build', logs };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stage = path.join(release, `vps-stage-${stamp}`);
  fs.mkdirSync(stage, { recursive: true });
  const stageRn = path.join(stage, 'runtime-node');
  // Production artifact: dist + manifests only (prod deps installed in stage)
  copyFiltered(path.join(rn, 'dist'), path.join(stageRn, 'dist'), () => false);
  for (const f of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(rn, f), path.join(stageRn, f));
  }
  copyFiltered(path.join(frontend, 'dist'), path.join(stage, 'frontend-dist'), () => false);
  copyFiltered(path.join(root, 'contracts'), path.join(stage, 'contracts'), () => false);
  const unitSrc = path.join(rn, 'deploy', 'jasefly-node.service');
  if (fs.existsSync(unitSrc)) {
    fs.mkdirSync(path.join(stage, 'deploy'), { recursive: true });
    fs.copyFileSync(unitSrc, path.join(stage, 'deploy', 'jasefly-node.service'));
  }

  const prodDeps = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev'], {
    cwd: stageRn,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 10 * 60 * 1000,
    env: { ...process.env, CI: '1' },
  });
  logs.push({
    step: 'runtime_node_prod_deps',
    ok: prodDeps.status === 0,
    stderr: (prodDeps.stderr || '').slice(-4000),
  });
  if (prodDeps.status !== 0) return { ok: false, step: 'runtime_node_prod_deps', logs };

  fs.writeFileSync(
    path.join(stage, 'release-meta.json'),
    JSON.stringify({
      target: 'vps',
      runtime: 'node-vps',
      stamp,
      built_at: new Date().toISOString(),
    }, null, 2),
  );

  const tarName = `jasefly-cms-vps-${stamp}.tgz`;
  const tarPath = path.join(release, tarName);
  const tar = spawnSync('tar', ['-czf', tarPath, '-C', stage, '.'], { encoding: 'utf8' });
  logs.push({ step: 'tar', ok: tar.status === 0, stderr: tar.stderr });
  if (tar.status !== 0) {
    // Windows fallback: zip via PowerShell
    const zipPath = tarPath.replace(/\.tgz$/, '.zip');
    const ps = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zipPath}' -Force`,
    ], { encoding: 'utf8' });
    logs.push({ step: 'zip_fallback', ok: ps.status === 0 });
    if (ps.status !== 0) return { ok: false, step: 'package', logs };
    return { ok: true, artifact: zipPath, stamp, logs, meta: { target: 'vps' } };
  }
  return { ok: true, artifact: tarPath, stamp, logs, meta: { target: 'vps' } };
}

function copyFiltered(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(src)) return;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(ent.name)) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyFiltered(from, to, skip);
    else fs.copyFileSync(from, to);
  }
}

/**
 * Atomic SSH deploy: upload → releases/<stamp> → symlink current → restart → healthcheck.
 * @param {VpsSite} site
 * @param {string} artifactPath
 * @param {{ confirm?: boolean }} opts
 */
export function deployVpsAtomic(site, artifactPath, opts = {}) {
  if (!opts.confirm) {
    return { ok: false, error: 'VPS deploy requires confirm=true (destructive remote write)' };
  }
  if (!site.sshHost || !site.sshUser || !site.deployPath) {
    return {
      ok: false,
      error: 'VPS site missing SSH_HOST / SSH_USER / DEPLOY_PATH env (CMS_SITE_*_SSH_HOST etc.)',
    };
  }
  if (!fs.existsSync(artifactPath)) {
    return { ok: false, error: `artifact missing: ${artifactPath}` };
  }

  let stamp;
  let remoteBase;
  try {
    assertSafeRemoteToken(site.sshHost, 'sshHost');
    assertSafeRemoteToken(site.sshUser, 'sshUser');
    stamp = assertSafeRemoteToken(
      path.basename(artifactPath).replace(/\.(tgz|zip)$/, ''),
      'release stamp',
    );
    remoteBase = site.deployPath.replace(/\/$/, '');
    if (/['"\\;\s`$|&<>]/.test(remoteBase)) {
      return { ok: false, error: 'unsafe deployPath for remote shell' };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const keyArgs = site.sshKeyPath ? ['-i', site.sshKeyPath] : [];
  const sshTarget = `${site.sshUser}@${site.sshHost}`;
  const releaseDir = `${remoteBase}/releases/${stamp}`;
  const pkgName = assertSafeRemoteToken(path.basename(artifactPath), 'artifact name');

  const mkdir = run('ssh', [...keyArgs, sshTarget, `mkdir -p '${remoteBase}/releases' '${remoteBase}/shared/storage' '${remoteBase}/shared/config'`]);
  if (!mkdir.ok) return { ok: false, step: 'mkdir', ...mkdir };

  const remotePkg = `/tmp/${pkgName}`;
  const scp = run('scp', [...keyArgs, artifactPath, `${sshTarget}:${remotePkg}`]);
  if (!scp.ok) return { ok: false, step: 'scp', ...scp };

  const extractCmd = artifactPath.endsWith('.zip')
    ? `mkdir -p '${releaseDir}' && unzip -q '${remotePkg}' -d '${releaseDir}'`
    : `mkdir -p '${releaseDir}' && tar -xzf '${remotePkg}' -C '${releaseDir}'`;
  const extract = run('ssh', [...keyArgs, sshTarget, extractCmd]);
  if (!extract.ok) return { ok: false, step: 'extract', ...extract };

  const link = run('ssh', [
    ...keyArgs,
    sshTarget,
    `ln -sfn '${releaseDir}' '${remoteBase}/current.new' && mv -Tf '${remoteBase}/current.new' '${remoteBase}/current'`,
  ]);
  if (!link.ok) return { ok: false, step: 'symlink', ...link };

  if (site.restartCommand) {
    // restartCommand is operator-controlled; do not interpolate untrusted input into it
    const restart = run('ssh', [...keyArgs, sshTarget, site.restartCommand]);
    if (!restart.ok) return { ok: false, step: 'restart', ...restart, release: stamp };
  }

  const healthUrl = site.healthcheckUrl || `${site.url.replace(/\/$/, '')}/api/v1/health`;
  const health = probeHealth(healthUrl);
  if (!health.ok) {
    const rolled = rollbackVps(site, { confirm: true });
    return {
      ok: false,
      step: 'healthcheck',
      release: stamp,
      healthcheckUrl: healthUrl,
      health,
      rollback: rolled,
      error: 'healthcheck failed; attempted auto-rollback to previous release',
    };
  }
  return {
    ok: true,
    release: stamp,
    healthcheckUrl: healthUrl,
    health,
    deployPath: remoteBase,
  };
}

/**
 * Rollback current symlink to previous release.
 * @param {VpsSite} site
 * @param {{ confirm: boolean, to?: string }} opts
 */
export function rollbackVps(site, opts) {
  if (!opts.confirm) return { ok: false, error: 'rollback requires confirm=true' };
  if (!site.sshHost || !site.sshUser || !site.deployPath) {
    return { ok: false, error: 'VPS SSH/deploy_path not configured' };
  }
  const keyArgs = site.sshKeyPath ? ['-i', site.sshKeyPath] : [];
  const sshTarget = `${site.sshUser}@${site.sshHost}`;
  const base = site.deployPath.replace(/\/$/, '');
  const to = opts.to;
  const script = to
    ? `test -d '${base}/releases/${to}' && ln -sfn '${base}/releases/${to}' '${base}/current.new' && mv -Tf '${base}/current.new' '${base}/current'`
    : `prev=$(ls -1dt '${base}/releases'/* | sed -n '2p'); test -n "$prev" && ln -sfn "$prev" '${base}/current.new' && mv -Tf '${base}/current.new' '${base}/current' && echo "$prev"`;
  const r = run('ssh', [...keyArgs, sshTarget, script]);
  if (!r.ok) return { ok: false, step: 'rollback', ...r };
  if (site.restartCommand) {
    run('ssh', [...keyArgs, sshTarget, site.restartCommand]);
  }
  return { ok: true, stdout: r.stdout };
}

export function vpsStatus(site) {
  return {
    id: site.id,
    runtime: site.runtime || 'node-vps',
    deployment: site.deployment || 'vps',
    deploy_path: site.deployPath || null,
    ssh_configured: Boolean(site.sshHost && site.sshUser),
    healthcheck_url: site.healthcheckUrl || null,
    // never echo keys
  };
}
