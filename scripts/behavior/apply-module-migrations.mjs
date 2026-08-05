#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = process.env.DB_PATH || process.argv[2];
if (!dbPath) {
  console.error('DB_PATH or argv[2] required');
  process.exit(2);
}

const r = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/apply-module-migrations.ts'],
  {
    cwd: path.join(root, 'runtime-node'),
    env: { ...process.env, DB_PATH: dbPath },
    encoding: 'utf8',
    timeout: 180000,
  },
);
if (r.status !== 0) {
  console.error(r.stdout || '');
  console.error(r.stderr || '');
  process.exit(r.status || 1);
}
process.stdout.write(r.stdout || '');
