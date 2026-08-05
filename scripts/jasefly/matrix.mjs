/**
 * Supported JASEFLY_RUNTIME × JASEFLY_TARGET combinations.
 * Product canon: shared hosting = PHP; VPS/cloud = Node.
 */

export const RUNTIMES = /** @type {const} */ (['node', 'php', 'dual']);
export const TARGETS = /** @type {const} */ (['local', 'shared', 'vps', 'docker', 'cloud']);

/** @typedef {'node'|'php'|'dual'} Runtime */
/** @typedef {'local'|'shared'|'vps'|'docker'|'cloud'} Target */

/**
 * true = supported. Missing / false = impossible.
 * @type {Record<Runtime, Record<Target, boolean>>}
 */
export const MATRIX = {
  node: { local: true, shared: false, vps: true, docker: true, cloud: true },
  php: { local: true, shared: true, vps: false, docker: true, cloud: false },
  dual: { local: true, shared: true, vps: true, docker: true, cloud: true },
};

/**
 * @param {string} runtime
 * @param {string} target
 * @returns {{ ok: true, runtime: Runtime, target: Target } | { ok: false, error: string }}
 */
export function assertCompatible(runtime, target) {
  const r = String(runtime || '').toLowerCase().trim();
  const t = String(target || '').toLowerCase().trim();

  if (!RUNTIMES.includes(/** @type {Runtime} */ (r))) {
    return {
      ok: false,
      error: `Invalid JASEFLY_RUNTIME="${runtime}". Allowed: ${RUNTIMES.join('|')}`,
    };
  }
  if (!TARGETS.includes(/** @type {Target} */ (t))) {
    return {
      ok: false,
      error: `Invalid JASEFLY_TARGET="${target}". Allowed: ${TARGETS.join('|')}`,
    };
  }

  const rt = /** @type {Runtime} */ (r);
  const tg = /** @type {Target} */ (t);
  if (!MATRIX[rt][tg]) {
    return {
      ok: false,
      error: incompatibleMessage(rt, tg),
    };
  }
  return { ok: true, runtime: rt, target: tg };
}

/**
 * Map MCP cms_local_build target (shared|vps) onto matrix target.
 * @param {'shared'|'vps'} mcpTarget
 * @param {string|undefined} runtimeEnv
 */
export function assertMcpBuild(mcpTarget, runtimeEnv) {
  if (!runtimeEnv || !String(runtimeEnv).trim()) {
    return { ok: true, skipped: true };
  }
  const target = mcpTarget === 'vps' ? 'vps' : 'shared';
  return assertCompatible(String(runtimeEnv).trim(), target);
}

/**
 * Dual production build always emits both artifact families.
 * Primary `--target` only selects packaging extras (docker/cloud stamps).
 * @param {Target} target
 * @returns {{ phpTarget: Target, nodeTarget: Target }}
 */
export function dualBuildTargets(target) {
  const phpTarget = target === 'docker' ? 'docker' : 'shared';
  let nodeTarget = target;
  if (target === 'shared' || target === 'local') nodeTarget = 'vps';
  else if (target === 'docker') nodeTarget = 'docker';
  return { phpTarget, nodeTarget };
}

/** @param {Runtime} runtime @param {Target} target */
function incompatibleMessage(runtime, target) {
  if (runtime === 'node' && target === 'shared') {
    return (
      'Impossible combination: runtime=node + target=shared. ' +
      'Shared hosting requires the PHP runtime (use --runtime=php --target=shared, or --runtime=node --target=vps).'
    );
  }
  if (runtime === 'php' && target === 'vps') {
    return (
      'Impossible combination: runtime=php + target=vps. ' +
      'VPS delivery uses the Node runtime (use --runtime=node --target=vps, or --runtime=php --target=shared).'
    );
  }
  if (runtime === 'php' && target === 'cloud') {
    return (
      'Impossible combination: runtime=php + target=cloud. ' +
      'Cloud target is Node-oriented (use --runtime=node --target=cloud, or --runtime=php --target=shared|docker).'
    );
  }
  return `Impossible combination: runtime=${runtime} + target=${target}. See docs/runtime-target-matrix.md`;
}

/**
 * Expected production artifact kinds for a resolved mode.
 * @param {Runtime} runtime
 * @param {Target} target
 * @returns {string[]}
 */
export function expectedArtifacts(runtime, target) {
  if (target === 'local') {
    return ['(no production package — local processes only)'];
  }
  /** @type {string[]} */
  const out = [];
  const needPhp = runtime === 'php' || runtime === 'dual';
  const needNode = runtime === 'node' || runtime === 'dual';

  if (needPhp && (target === 'shared' || target === 'docker' || runtime === 'dual')) {
    out.push('release/jasefly-cms-{install|update}-*.zip (PHP shared hosting)');
  }
  if (needNode && (target === 'vps' || target === 'cloud' || target === 'docker' || runtime === 'dual')) {
    out.push('release/jasefly-cms-vps-*.{tgz|zip} (Node VPS stage)');
  }
  if (target === 'docker') {
    out.push('deploy/docker image tags (jasefly-php / jasefly-node) when docker CLI available');
  }
  if (target === 'cloud' && needNode) {
    out.push('release-meta.json with target=cloud on Node artifact');
  }
  return out.length ? out : ['(none for this combination)'];
}

/**
 * Pipeline steps activated for doctor output.
 * @param {'dev'|'build'|'test'|'doctor'} command
 * @param {Runtime} runtime
 * @param {Target} target
 */
export function activePipelines(command, runtime, target) {
  /** @type {string[]} */
  const steps = [];
  if (command === 'doctor') {
    steps.push('dependency probe', 'matrix validation', 'artifact expectation');
    return steps;
  }
  if (command === 'dev') {
    if (runtime === 'php' || runtime === 'dual') steps.push('dev.js (PHP + Vite)');
    if (runtime === 'node' || runtime === 'dual') steps.push('runtime-node npm run dev');
    if (runtime === 'node') steps.push('frontend npm run dev (Vite)');
    return steps;
  }
  if (command === 'build') {
    if (runtime === 'php' || runtime === 'dual') steps.push('frontend build', 'scripts/build-hosting.js');
    if (runtime === 'node' || runtime === 'dual') steps.push('frontend build', 'buildVpsArtifact (runtime-node)');
    if (target === 'docker') steps.push('docker build (deploy/docker)');
    if (target === 'cloud' && (runtime === 'node' || runtime === 'dual')) {
      steps.push('stamp release-meta target=cloud');
    }
    return steps;
  }
  if (command === 'test') {
    if (runtime === 'dual') steps.push('scripts/behavior/run-all.mjs (parity gate 879)');
    if (runtime === 'node') steps.push('runtime-node npm test', 'scripts/vps/package-and-smoke.mjs');
    if (runtime === 'php') steps.push('backend/tests/run.php', 'frontend npm test (optional smoke)');
    return steps;
  }
  return steps;
}
