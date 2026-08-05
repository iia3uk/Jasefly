import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { appConfig } from './config.js';
import { createDatabase } from './db/Database.js';
import { runMigrations } from './db/migrate.js';
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

  const app = await createApp(db, appConfig);
  console.log(
    `Jasefly Node runtime listening on :${appConfig.port} (${appConfig.runtime}) db=${appConfig.db.driver}`,
  );
  serve({ fetch: app.fetch, port: appConfig.port });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
