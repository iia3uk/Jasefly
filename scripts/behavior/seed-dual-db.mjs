#!/usr/bin/env node
/**
 * Create two identical SQLite DBs (php + node) with migrations + admin user.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = process.env.BEHAVIOR_STAMP || crypto.randomBytes(4).toString('hex');
const base = path.join(root, 'tmp', `behavior-${stamp}`);
fs.mkdirSync(base, { recursive: true });

const nodeDb = path.join(base, 'node.sqlite');
const phpDb = path.join(base, 'php.sqlite');
const nodeStorage = path.join(base, 'node-storage');
const phpStorage = path.join(base, 'php-storage');
fs.mkdirSync(nodeStorage, { recursive: true });
fs.mkdirSync(phpStorage, { recursive: true });
// Prevent PHP ModuleRegistry one-shot page seed from diverging page counts
// (Node does not run that boot path). Marker makes seedAll a no-op.
fs.writeFileSync(path.join(phpStorage, '.pages_seeded'), 'parity\n');
fs.writeFileSync(path.join(nodeStorage, '.pages_seeded'), 'parity\n');

const env = {
  ...process.env,
  DB_DRIVER: 'sqlite',
  DB_PATH: nodeDb,
  JWT_SECRET: 'behavior-parity-secret-32chars!!',
  MCP_API_TOKEN: 'behavior-mcp-token',
  STORAGE_PATH: nodeStorage,
  APP_URL: 'http://127.0.0.1:3081',
  PORT: '3081',
  TRANSLATE_PROVIDER: 'memory',
  APP_ENV: 'test',
};

const rn = path.join(root, 'runtime-node');
let migrate = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/migrate.ts', '--install'], {
  cwd: rn,
  env,
  encoding: 'utf8',
  timeout: 180000,
});
if (migrate.status !== 0) {
  migrate = spawnSync(process.execPath, ['dist/cli/migrate.js', '--install'], {
    cwd: rn,
    env,
    encoding: 'utf8',
    timeout: 180000,
  });
}
if (migrate.status !== 0) {
  console.error(migrate.stderr || migrate.stdout);
  process.exit(1);
}

console.error('== module migrations ==');
const modMig = spawnSync(process.execPath, ['scripts/behavior/apply-module-migrations.mjs', nodeDb], {
  cwd: root,
  env,
  encoding: 'utf8',
  timeout: 180000,
});
if (modMig.status !== 0) {
  console.error(modMig.stderr || modMig.stdout);
  process.exit(1);
}
process.stderr.write(modMig.stdout || '');

const seedFile = path.join(rn, 'scripts', '_behavior-seed.ts');
fs.mkdirSync(path.dirname(seedFile), { recursive: true });
// Modules that ship enabled()=false but are in baseline inventory — parity DB turns them ON.
const forceEnable = ['automation', 'newsletter', 'notifications', 'analytics', 'comments'];
fs.writeFileSync(
  seedFile,
  `import { createDatabase } from '../src/db/Database.js';
import { hashPassword } from '../src/auth/password.js';
const db = await createDatabase({
  name:'t', url:'http://127.0.0.1', env:'test', timezone:'UTC', port:3081,
  jwtSecret: process.env.JWT_SECRET!, jwtTtl:3600, refreshTtl:86400,
  mcpApiToken: process.env.MCP_API_TOKEN!, corsOrigins:['*'],
  storagePath: process.env.STORAGE_PATH!, runtime:'node-vps',
  db:{ driver:'sqlite', host:'', port:0, name:'', user:'', pass:'', path: process.env.DB_PATH!, charset:'utf8mb4' }
});
const hash = await hashPassword('Admin123!');
try { await db.run('DELETE FROM users WHERE email=?', ['admin@parity.local']); } catch { /* ok */ }
// super_admin: full ACL so happy-get probes exercise handlers, not role gaps
await db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)',
  ['admin@parity.local', hash, 'Parity Admin', 'super_admin']);
// Module SQL seeds often INSERT is_enabled=0 — parity DB turns every known plugin ON.
if (await db.tableExists('modules')) {
  await db.run('UPDATE modules SET is_enabled=1');
  const force = ${JSON.stringify(forceEnable)};
  for (const name of force) {
    const row = await db.one('SELECT name FROM modules WHERE name=?', [name]);
    if (!row) await db.run('INSERT INTO modules (name, is_enabled) VALUES (?, 1)', [name]);
  }
}
// Ensure system lazy-loader page exists (PHP /site exposes it when published).
if (await db.tableExists('pages')) {
  const lazy = await db.one("SELECT id FROM pages WHERE slug='lazy-loader' LIMIT 1");
  if (!lazy) {
    await db.run(
      "INSERT INTO pages (title, slug, status, template, is_home, seo_title, seo_description, layout_json) VALUES (?,?,?,?,?,?,?,?)",
      [
        'Lazy loader',
        'lazy-loader',
        'published',
        'system-loader',
        0,
        'Lazy loader',
        'Suspense loader',
        JSON.stringify({ version: 1, meta: { seed: true, useOnSite: true }, elements: [] }),
      ],
    );
  } else {
    await db.run("UPDATE pages SET status='published' WHERE slug='lazy-loader'");
  }
}
await db.close();
`,
);
const seed = spawnSync(process.execPath, ['--import', 'tsx', seedFile], {
  cwd: rn,
  env,
  encoding: 'utf8',
  timeout: 60000,
});
if (seed.status !== 0) {
  console.error(seed.stderr || seed.stdout);
  process.exit(1);
}

fs.copyFileSync(nodeDb, phpDb);

const meta = {
  stamp,
  base,
  nodeDb,
  phpDb,
  nodeStorage,
  phpStorage,
  adminEmail: 'admin@parity.local',
  adminPassword: 'Admin123!',
  jwtSecret: env.JWT_SECRET,
  mcpToken: env.MCP_API_TOKEN,
};
fs.writeFileSync(path.join(base, 'meta.json'), JSON.stringify(meta, null, 2));
// stdout: single JSON line for run-all parser
process.stdout.write(JSON.stringify(meta) + '\n');
