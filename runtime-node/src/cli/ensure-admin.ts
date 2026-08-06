/**
 * CLI: create first admin when users table is empty.
 *   node dist/cli/ensure-admin.js
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… node dist/cli/ensure-admin.js
 */
import { appConfig } from '../config.js';
import { createDatabase } from '../db/Database.js';
import { ensureFirstAdmin } from '../install/ensureAdmin.js';

const db = await createDatabase(appConfig);
const result = await ensureFirstAdmin(db);
console.log(JSON.stringify(result, null, 2));
await db.close();
if (!result.ok) process.exit(1);
