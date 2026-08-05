import { appConfig } from '../config.js';
import { createDatabase } from '../db/Database.js';
import { runMigrations } from '../db/migrate.js';

const install = process.argv.includes('--install');

const db = await createDatabase(appConfig);
const result = await runMigrations(db, { install });
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
await db.close();
