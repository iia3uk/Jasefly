import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { appConfig } from './config.js';
import { createDatabase } from './db/Database.js';
import { runMigrations } from './db/migrate.js';
import { ensureFirstAdmin } from './install/ensureAdmin.js';
import { createApp } from './app.js';

async function main() {
  if (!appConfig.jwtSecret) {
    console.error('JWT_SECRET is required');
    process.exit(1);
  }
  fs.mkdirSync(appConfig.storagePath, { recursive: true });

  const db = await createDatabase(appConfig);
  const install = !(await db.tableExists('users'));
  const mig = await runMigrations(db, { install });
  if (mig.just_applied.length) {
    console.log('migrations applied:', mig.just_applied.join(', '));
  }

  // Parity with PHP install.php admin step (Node has no web installer).
  const admin = await ensureFirstAdmin(db);
  if (!admin.ok) {
    console.error('first-admin bootstrap failed:', admin.error);
    process.exit(1);
  }
  if (admin.created) {
    console.log(`first admin created: ${admin.email}`);
  } else if (admin.reason.includes('not set')) {
    console.warn(
      'WARNING: no users in DB and ADMIN_EMAIL/ADMIN_PASSWORD unset — admin login unavailable until bootstrap',
    );
  }

  const app = await createApp(db, appConfig);
  const hostname = process.env.HOST || '0.0.0.0';
  console.log(
    `Jasefly Node runtime listening on ${hostname}:${appConfig.port} (${appConfig.runtime}) db=${appConfig.db.driver}`,
  );
  serve({ fetch: app.fetch, port: appConfig.port, hostname });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
