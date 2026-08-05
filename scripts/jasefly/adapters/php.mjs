/**
 * PHP runtime adapter — wraps existing shared-hosting pipelines.
 * Does not embed business logic.
 */

import fs from 'node:fs';
import { abs, npmCmd, phpBin, run, findLatestRelease } from '../run.mjs';
import { reportArtifacts } from '../artifact-report.mjs';

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function devPhp(cfg) {
  console.log(`[php] starting local stack via dev.js (target=${cfg.target})`);
  // Forward to existing launcher (blocking)
  run(process.execPath, [abs('dev.js'), 'start'], { timeoutMs: 0 });
}

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function buildPhp(cfg) {
  console.log(`[php] frontend build + build-hosting.js mode=${cfg.mode}`);
  run(npmCmd(), ['run', 'build'], { cwd: abs('frontend'), timeoutMs: 10 * 60 * 1000 });
  run(
    process.execPath,
    [abs('scripts', 'build-hosting.js'), `--mode=${cfg.mode}`, '--yes'],
    { timeoutMs: 15 * 60 * 1000 },
  );

  if (cfg.target === 'docker') {
    await buildPhpDockerImage();
  }

  const zip = findLatestRelease(/^jasefly-cms-(install|update)-.*\.zip$/i);
  if (!zip) throw new Error('[php] hosting ZIP not found in release/');
  console.log(`[php] artifact: ${zip.full} (${(zip.size / 1048576).toFixed(2)} MB)`);
  reportArtifacts(cfg);
  return { ok: true, artifact: zip.full };
}

/**
 * @param {import('../config.mjs').ResolvedConfig} cfg
 */
export async function testPhp(cfg) {
  console.log('[php] backend/tests/run.php');
  run(phpBin(), [abs('backend', 'tests', 'run.php')], { timeoutMs: 20 * 60 * 1000 });

  // Lightweight FE unit smoke (non-parity)
  if (fs.existsSync(abs('frontend', 'package.json'))) {
    console.log('[php] frontend npm test');
    run(npmCmd(), ['test'], {
      cwd: abs('frontend'),
      timeoutMs: 10 * 60 * 1000,
      allowFail: false,
    });
  }
  console.log('[php] tests ok');
  return { ok: true };
}

async function buildPhpDockerImage() {
  const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
  const r = run(docker, ['version'], { allowFail: true });
  if (!r.ok) {
    throw new Error(
      '[php] docker CLI not available. Install Docker or use --target=shared. See jasefly doctor.',
    );
  }
  console.log('[php] docker build -f deploy/docker/Dockerfile.php');
  run(docker, ['build', '-f', abs('deploy', 'docker', 'Dockerfile.php'), '-t', 'jasefly-php:local', abs('.')], {
    timeoutMs: 30 * 60 * 1000,
  });
}
