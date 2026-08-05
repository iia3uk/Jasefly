#!/usr/bin/env node
/**
 * jasefly — unified runtime × deployment target CLI
 *
 *   jasefly dev|build|test|doctor [--runtime=node|php|dual] [--target=...]
 */

import { resolveConfig, printHelp } from './config.mjs';
import { runDoctor } from './doctor.mjs';
import * as php from './adapters/php.mjs';
import * as node from './adapters/node.mjs';
import * as dual from './adapters/dual.mjs';

async function main() {
  const cfg = resolveConfig(process.argv.slice(2));
  if ('error' in cfg) {
    console.error(cfg.error);
    printHelp();
    process.exit(2);
  }
  if (cfg.help || cfg.command === 'help') {
    printHelp();
    return;
  }

  // Propagate resolved mode into env for child processes / MCP
  process.env.JASEFLY_RUNTIME = cfg.runtime;
  process.env.JASEFLY_TARGET = cfg.target;

  console.log(
    `[jasefly] command=${cfg.command} runtime=${cfg.runtime}(${cfg.runtimeSource}) target=${cfg.target}(${cfg.targetSource})`,
  );

  if (cfg.command === 'doctor') {
    runDoctor(cfg);
    return;
  }

  const adapter = pick(cfg.runtime);

  if (cfg.command === 'dev') {
    await adapter.dev(cfg);
    return;
  }
  if (cfg.command === 'build') {
    await adapter.build(cfg);
    return;
  }
  if (cfg.command === 'test') {
    await adapter.test(cfg);
    return;
  }

  console.error(`Unhandled command: ${cfg.command}`);
  process.exit(2);
}

/** @param {import('./matrix.mjs').Runtime} runtime */
function pick(runtime) {
  if (runtime === 'php') {
    return { dev: php.devPhp, build: php.buildPhp, test: php.testPhp };
  }
  if (runtime === 'node') {
    return { dev: node.devNode, build: node.buildNode, test: node.testNode };
  }
  return { dev: dual.devDual, build: dual.buildDual, test: dual.testDual };
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(typeof e?.status === 'number' && e.status > 0 ? e.status : 1);
});
