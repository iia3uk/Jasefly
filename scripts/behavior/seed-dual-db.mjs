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
// Baseline inventory for PHP↔Node parity (default-off world: missing row = OFF on PHP).
// Exclude template (ships enabled()=false permanently). UPSERT every other baseline name.
const forceEnable = [
  'system', 'users', 'module-manager', 'content', 'media', 'seo', 'blog', 'projects', 'portfolio',
  'forms', 'scheduler', 'support', 'payments', 'orders', 'products', 'newsletter', 'comments',
  'analytics', 'notifications', 'automation', 'webhooks', 'mail', 'translate', 'access',
  'registration', 'lab', 'ddos', 'overload', 'demo',
];
fs.writeFileSync(
  seedFile,
  `import { createDatabase } from '../src/db/Database.js';
import { hashPassword } from '../src/auth/password.js';
const db = await createDatabase({
  name:'t', url:'http://127.0.0.1', env:'test', timezone:'UTC', port:3081,
  jwtSecret: process.env.JWT_SECRET!, jwtTtl:3600, refreshTtl:86400,
  mcpApiToken: process.env.MCP_API_TOKEN!, mcpSigningSecret:'', mcpAuthMode:'legacy',
  mcpAllowedIps:'', mcpSkewSeconds:300,
  telegramDeployApprove:'0', telegramDeployBotToken:'', telegramDeployChatId:'',
  telegramDeployWebhookSecret:'', telegramDeployTtlSeconds:3600,
  corsOrigins:['*'],
  storagePath: process.env.STORAGE_PATH!, runtime:'node-vps',
  db:{ driver:'sqlite', host:'', port:0, name:'', user:'', pass:'', path: process.env.DB_PATH!, charset:'utf8mb4' }
});
const hash = await hashPassword('Admin123!');
try { await db.run('DELETE FROM users WHERE email=?', ['admin@parity.local']); } catch { /* ok */ }
// super_admin: full ACL so happy-get probes exercise handlers, not role gaps
await db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)',
  ['admin@parity.local', hash, 'Parity Admin', 'super_admin']);
// Same singleton rows Node creates at boot (ensureFirstAdmin) — before copy to PHP DB.
const { seedPlatformDefaults } = await import('../src/install/seedPlatformDefaults.js');
await seedPlatformDefaults(db);
// Default-off: UPDATE alone misses plugins never inserted — UPSERT full baseline ON.
if (await db.tableExists('modules')) {
  await db.run('UPDATE modules SET is_enabled=1');
  const force = ${JSON.stringify(forceEnable)};
  for (const name of force) {
    const row = await db.one('SELECT name FROM modules WHERE name=?', [name]);
    if (!row) await db.run('INSERT INTO modules (name, is_enabled) VALUES (?, 1)', [name]);
    else await db.run('UPDATE modules SET is_enabled=1 WHERE name=?', [name]);
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

// Mirror Node boot PackageSourceSync into node DB + storage BEFORE cloning to PHP,
// so PHP InstalledModuleLoader sees enabled packages under php-storage/modules.
console.error('== package source sync (parity) ==');
const syncFile = path.join(base, '_behavior-sync-packages.ts');
fs.writeFileSync(
  syncFile,
  `import { createDatabase } from '../src/db/Database.js';
import { syncPackageSources } from '../src/packages/PackageSourceSync.js';
import type { AppConfig } from '../src/config.js';
const cfg: AppConfig = {
  name:'t', url:'http://127.0.0.1', env:'test', timezone:'UTC', port:3081,
  jwtSecret: process.env.JWT_SECRET!, jwtTtl:3600, refreshTtl:86400,
  mcpApiToken: process.env.MCP_API_TOKEN!, mcpSigningSecret:'', mcpAuthMode:'legacy',
  mcpAllowedIps:'', mcpSkewSeconds:300,
  telegramDeployApprove:'0', telegramDeployBotToken:'', telegramDeployChatId:'',
  telegramDeployWebhookSecret:'', telegramDeployTtlSeconds:3600,
  corsOrigins:['*'],
  storagePath: process.env.STORAGE_PATH!, runtime:'node-vps',
  db:{ driver:'sqlite', host:'', port:0, name:'', user:'', pass:'', path: process.env.DB_PATH!, charset:'utf8mb4' }
};
const db = await createDatabase(cfg);
const results = await syncPackageSources(db, cfg, { enableMode: 'test-all' });
console.error('synced packages:', results.filter((r) => r.synced).length);
await db.close();
`,
);
const sync = spawnSync(process.execPath, ['--import', 'tsx', syncFile], {
  cwd: rn,
  env,
  encoding: 'utf8',
  timeout: 120000,
});
if (sync.status !== 0) {
  console.error(sync.stderr || sync.stdout);
  process.exit(1);
}
process.stderr.write(sync.stderr || '');

const nodeModules = path.join(nodeStorage, 'modules');
const phpModules = path.join(phpStorage, 'modules');
if (fs.existsSync(nodeModules)) {
  fs.cpSync(nodeModules, phpModules, { recursive: true });
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
