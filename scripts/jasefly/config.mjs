/**
 * Resolve JASEFLY_RUNTIME / JASEFLY_TARGET from CLI flags and env.
 * Priority: CLI flag > env > command default (only where allowed).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompatible } from './matrix.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../..');

/**
 * @typedef {{
 *   command: string,
 *   runtime: import('./matrix.mjs').Runtime,
 *   target: import('./matrix.mjs').Target,
 *   runtimeSource: 'flag'|'env'|'default',
 *   targetSource: 'flag'|'env'|'default',
 *   mode: 'full'|'update',
 *   help: boolean,
 *   raw: string[],
 * }} ResolvedConfig
 */

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {ResolvedConfig | { error: string }}
 */
export function resolveConfig(argv) {
  const raw = [...argv];
  const flags = parseFlags(raw);
  if (flags.help || flags._[0] === 'help') {
    return {
      command: 'help',
      runtime: 'dual',
      target: 'local',
      runtimeSource: 'default',
      targetSource: 'default',
      mode: 'update',
      help: true,
      raw,
    };
  }

  const command = String(flags._[0] || '').toLowerCase();
  if (!['dev', 'build', 'test', 'doctor', 'help'].includes(command)) {
    return {
      error:
        `Unknown or missing command "${command || ''}". ` +
        `Usage: jasefly <dev|build|test|doctor> [--runtime=node|php|dual] [--target=local|shared|vps|docker|cloud]`,
    };
  }

  const envRuntime = (process.env.JASEFLY_RUNTIME || '').trim().toLowerCase();
  const envTarget = (process.env.JASEFLY_TARGET || '').trim().toLowerCase();

  /** Only string flag values count (bare `--runtime` → boolean true is invalid). */
  let runtime = typeof flags.runtime === 'string' ? flags.runtime.trim().toLowerCase() : '';
  /** @type {'flag'|'env'|'default'} */
  let runtimeSource = 'default';
  if (runtime) {
    runtimeSource = 'flag';
  } else if (envRuntime) {
    runtime = envRuntime;
    runtimeSource = 'env';
  } else if (command === 'build') {
    return {
      error:
        'Production build requires an explicit runtime. ' +
        'Set --runtime=node|php|dual or JASEFLY_RUNTIME. ' +
        '(Development default dual applies only to `jasefly dev` / `jasefly test` without env.)',
    };
  } else {
    runtime = 'dual';
    runtimeSource = 'default';
  }

  let target = typeof flags.target === 'string' ? flags.target.trim().toLowerCase() : '';
  /** @type {'flag'|'env'|'default'} */
  let targetSource = 'default';
  if (target) {
    targetSource = 'flag';
  } else if (envTarget) {
    target = envTarget;
    targetSource = 'env';
  } else if (command === 'dev' || command === 'doctor' || command === 'test') {
    target = 'local';
    targetSource = 'default';
  } else if (command === 'build') {
    if (runtime === 'php') target = 'shared';
    else if (runtime === 'node') target = 'vps';
    else target = 'shared';
    targetSource = 'default';
  }

  const check = assertCompatible(runtime, target);
  if (!check.ok) return { error: check.error };

  let mode = 'update';
  if (flags.mode !== undefined && flags.mode !== true) {
    const m = String(flags.mode).trim().toLowerCase();
    if (m !== 'full' && m !== 'update') {
      return { error: `Invalid --mode="${flags.mode}". Allowed: full|update` };
    }
    mode = m;
  }

  return {
    command,
    runtime: check.runtime,
    target: check.target,
    runtimeSource,
    targetSource,
    mode,
    help: false,
    raw,
  };
}

/**
 * @param {string[]} argv
 */
function parseFlags(argv) {
  /** @type {Record<string, string|boolean> & { _: string[] }} */
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        const key = a.slice(2, eq);
        out[key] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          out[key] = next;
          i++;
        } else {
          out[key] = true;
        }
      }
      continue;
    }
    out._.push(a);
  }
  return out;
}

export function printHelp() {
  console.log(`Jasefly CLI — runtime × deployment target

Usage:
  jasefly dev    [--runtime=node|php|dual] [--target=local|shared|vps|docker|cloud]
  jasefly build  --runtime=node|php|dual [--target=...] [--mode=full|update]
  jasefly test   [--runtime=node|php|dual] [--target=...]
  jasefly doctor [--runtime=...] [--target=...]

Env (overridden by flags):
  JASEFLY_RUNTIME=node|php|dual
  JASEFLY_TARGET=local|shared|vps|docker|cloud

Defaults:
  dev/test/doctor → runtime=dual, target=local (if unset)
  build           → runtime REQUIRED; target defaults by runtime (php→shared, node→vps, dual→shared)

Impossible pairs exit non-zero (e.g. node+shared, php+vps, php+cloud).
See docs/runtime-target-matrix.md`);
}
