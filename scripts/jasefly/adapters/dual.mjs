/**
 * Dual runtime adapter — both PHP + Node pipelines; parity gate for test.
 */

import { spawn } from 'node:child_process';
import { abs, npmCmd, run } from '../run.mjs';
import { dualBuildTargets } from '../matrix.mjs';
import { buildPhp } from './php.mjs';
import { buildNode } from './node.mjs';
import { reportArtifacts } from '../artifact-report.mjs';

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function devDual(cfg) {
  console.log(`[dual] starting PHP (dev.js) + runtime-node (target=${cfg.target})`);
  // Start runtime-node in background, then blocking PHP+Vite via dev.js
  const rn = spawn(npmCmd(), ['run', 'dev'], {
    cwd: abs('runtime-node'),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  rn.on('error', (e) => console.error('[dual] runtime-node failed to start', e));
  try {
    run(process.execPath, [abs('dev.js'), 'start'], { timeoutMs: 0 });
  } finally {
    if (!rn.killed) rn.kill('SIGTERM');
  }
}

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function buildDual(cfg) {
  console.log('[dual] building PHP shared ZIP + Node VPS artifact');
  const { phpTarget, nodeTarget } = dualBuildTargets(cfg.target);
  await buildPhp({ ...cfg, target: phpTarget });
  await buildNode({ ...cfg, target: nodeTarget });
  reportArtifacts(cfg);
  return { ok: true };
}

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function testDual(cfg) {
  console.log('[dual] scripts/behavior/run-all.mjs (parity gate)');
  run(process.execPath, [abs('scripts', 'behavior', 'run-all.mjs')], {
    timeoutMs: 60 * 60 * 1000,
    env: {
      ...process.env,
      BEHAVIOR_REQUIRE: process.env.BEHAVIOR_REQUIRE || 'all',
    },
  });
  console.log('[dual] parity suite completed');
  return { ok: true };
}
