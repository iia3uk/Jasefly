import { createDatabase } from '../src/db/Database.js';
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
  const force = ["system","users","module-manager","content","media","seo","blog","projects","portfolio","forms","scheduler","support","payments","orders","products","newsletter","comments","analytics","notifications","automation","webhooks","mail","translate","access","registration","lab","ddos","overload","demo"];
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
