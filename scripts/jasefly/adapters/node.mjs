/**
 * Node runtime adapter — wraps runtime-node + VPS packaging.
 * Does not embed business logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { abs, npmCmd, run } from '../run.mjs';
import { reportArtifacts } from '../artifact-report.mjs';

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function devNode(cfg) {
  console.log(`[node] starting Vite + runtime-node (target=${cfg.target})`);
  const vite = spawn(npmCmd(), ['run', 'dev'], {
    cwd: abs('frontend'),
    env: { ...process.env, BROWSER: 'none' },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  vite.on('error', (e) => console.error('[node] vite failed', e));
  try {
    run(npmCmd(), ['run', 'dev'], { cwd: abs('runtime-node'), timeoutMs: 0 });
  } finally {
    if (!vite.killed) vite.kill('SIGTERM');
  }
}

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function buildNode(cfg) {
  console.log('[node] buildVpsArtifact via mcp-cms deploy/vps.js');
  const { buildVpsArtifact } = await import(pathToFileURL(abs('mcp-cms', 'src', 'deploy', 'vps.js')).href);
  const res = buildVpsArtifact();
  if (!res.ok) {
    console.error(JSON.stringify(res.logs || res, null, 2));
    throw new Error(`[node] VPS build failed at step ${res.step || 'unknown'}`);
  }

  if (cfg.target === 'cloud' || cfg.target === 'docker') {
    stampCloudMeta(res, cfg);
  }
  if (cfg.target === 'docker') {
    await buildNodeDockerImage();
  }

  console.log(`[node] artifact: ${res.artifact}`);
  assertNoPhpInLatestStage();
  reportArtifacts(cfg);
  return { ok: true, artifact: res.artifact, stamp: res.stamp };
}

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function testNode(cfg) {
  console.log('[node] runtime-node npm test');
  run(npmCmd(), ['test'], { cwd: abs('runtime-node'), timeoutMs: 15 * 60 * 1000 });

  console.log('[node] scripts/vps/package-and-smoke.mjs');
  const distOk = fs.existsSync(abs('runtime-node', 'dist', 'index.js'));
  const modsOk = fs.existsSync(abs('runtime-node', 'node_modules'));
  run(process.execPath, [abs('scripts', 'vps', 'package-and-smoke.mjs')], {
    timeoutMs: 20 * 60 * 1000,
    env: {
      ...process.env,
      SKIP_FE: process.env.SKIP_FE || '0',
      // Avoid npm ci/rebuild wiping native bindings (better-sqlite3) on Windows/Node 24
      SKIP_RN_CI: process.env.SKIP_RN_CI || (modsOk ? '1' : '0'),
      SKIP_RN_BUILD: process.env.SKIP_RN_BUILD || (distOk ? '1' : '0'),
    },
  });
  console.log('[node] tests ok');
  return { ok: true };
}

function stampCloudMeta(_res, cfg) {
  const release = abs('release');
  const stages = fs
    .readdirSync(release)
    .filter((d) => d.startsWith('vps-stage-'))
    .map((d) => path.join(release, d))
    .sort()
    .reverse();
  const stage = stages[0];
  if (!stage) return;
  const metaPath = path.join(stage, 'release-meta.json');
  /** @type {Record<string, unknown>} */
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      meta = {};
    }
  }
  meta.target = cfg.target;
  meta.runtime = 'node';
  meta.jasefly_runtime = cfg.runtime;
  meta.jasefly_target = cfg.target;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`[node] stamped ${metaPath} target=${cfg.target}`);
}

function assertNoPhpInLatestStage() {
  const release = abs('release');
  if (!fs.existsSync(release)) return;
  const stages = fs
    .readdirSync(release)
    .filter((d) => d.startsWith('vps-stage-'))
    .map((d) => path.join(release, d))
    .sort()
    .reverse();
  const stage = stages[0];
  if (!stage) return;
  const stack = [stage];
  while (stack.length) {
    const cur = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        stack.push(p);
      } else if (e.name.endsWith('.php')) {
        throw new Error(`[node] PHP file leaked into VPS stage: ${p}`);
      }
    }
  }
}

async function buildNodeDockerImage() {
  const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
  const r = run(docker, ['version'], { allowFail: true });
  if (!r.ok) {
    throw new Error(
      '[node] docker CLI not available. Install Docker or use --target=vps. See jasefly doctor.',
    );
  }
  console.log('[node] docker build -f deploy/docker/Dockerfile.node');
  run(docker, ['build', '-f', abs('deploy', 'docker', 'Dockerfile.node'), '-t', 'jasefly-node:local', abs('.')], {
    timeoutMs: 30 * 60 * 1000,
  });
}
