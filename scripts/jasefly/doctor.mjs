import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import {
  MATRIX,
  expectedArtifacts,
  activePipelines,
  assertCompatible,
} from './matrix.mjs';
import { phpBin, npmCmd, which, abs } from './run.mjs';

/**
 * @param {import('./config.mjs').ResolvedConfig} cfg
 */
export function runDoctor(cfg) {
  const check = assertCompatible(cfg.runtime, cfg.target);
  const deps = probeDeps(cfg);

  const report = {
    runtime: cfg.runtime,
    target: cfg.target,
    runtime_source: cfg.runtimeSource,
    target_source: cfg.targetSource,
    matrix_ok: check.ok,
    matrix_error: check.ok ? null : check.error,
    matrix: MATRIX,
    dependencies: deps,
    missing_dependencies: deps.filter((d) => !d.present).map((d) => d.name),
    active_pipelines: {
      dev: activePipelines('dev', cfg.runtime, cfg.target),
      build: activePipelines('build', cfg.runtime, cfg.target),
      test: activePipelines('test', cfg.runtime, cfg.target),
    },
    expected_artifacts: expectedArtifacts(cfg.runtime, cfg.target),
    paths: {
      root: abs('.'),
      release: abs('release'),
      docker: abs('deploy', 'docker'),
      behavior: abs('scripts', 'behavior', 'run-all.mjs'),
    },
  };

  console.log('=== jasefly doctor ===');
  console.log(JSON.stringify(report, null, 2));
  if (!check.ok) {
    process.exitCode = 2;
  } else if (deps.some((d) => d.required && !d.present)) {
    process.exitCode = 1;
  }
  return report;
}

/**
 * @param {import('./config.mjs').ResolvedConfig} cfg
 */
function probeDeps(cfg) {
  /** @type {Array<{name:string, present:boolean, required:boolean, detail?:string}>} */
  const deps = [];

  const nodeV = process.version;
  deps.push({ name: 'node', present: true, required: true, detail: nodeV });

  const npmPath = which('npm') || which(npmCmd());
  deps.push({ name: 'npm', present: Boolean(npmPath), required: true, detail: npmPath || 'not found' });

  const needPhp = cfg.runtime === 'php' || cfg.runtime === 'dual';
  const phpPath = process.env.PHP_BIN || which('php');
  let phpDetail = phpPath || 'not found';
  if (phpPath) {
    const r = spawnSync(phpBin(), ['-v'], { encoding: 'utf8', shell: true });
    phpDetail = ((r.stdout || r.stderr || '') + '').split(/\r?\n/)[0] || phpPath;
  }
  deps.push({ name: 'php', present: Boolean(phpPath), required: needPhp, detail: phpDetail });

  const needRn = cfg.runtime === 'node' || cfg.runtime === 'dual';
  deps.push({
    name: 'runtime-node/package.json',
    present: fs.existsSync(abs('runtime-node', 'package.json')),
    required: needRn,
  });
  deps.push({
    name: 'frontend/package.json',
    present: fs.existsSync(abs('frontend', 'package.json')),
    required: true,
  });
  deps.push({
    name: 'backend/tests/run.php',
    present: fs.existsSync(abs('backend', 'tests', 'run.php')),
    required: needPhp,
  });

  const needDocker = cfg.target === 'docker';
  const dockerPath = which('docker');
  deps.push({
    name: 'docker',
    present: Boolean(dockerPath),
    required: needDocker,
    detail: dockerPath || 'not found (required for --target=docker builds)',
  });

  deps.push({
    name: 'deploy/docker templates',
    present: fs.existsSync(abs('deploy', 'docker', 'Dockerfile.node')),
    required: needDocker,
  });

  return deps;
}
