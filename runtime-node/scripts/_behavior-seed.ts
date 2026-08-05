import { createDatabase } from '../src/db/Database.js';
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
  const force = ["automation","newsletter","notifications","analytics","comments"];
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
