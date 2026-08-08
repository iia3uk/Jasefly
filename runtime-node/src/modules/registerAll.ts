import type { ModuleContext } from '../core/types.js';
import * as system from './system.js';
import * as content from './content.js';
import * as media from './media.js';
import * as users from './users.js';
import * as scheduler from './scheduler.js';
import * as mail from './mail.js';
import * as access from './access.js';
import * as seo from './seo.js';
import * as lab from './lab.js';
import * as module_manager from './module-manager.js';
import * as ddos from './ddos.js';
import * as overload from './overload.js';
import * as demo from './demo.js';
import * as portfolio from './portfolio.js';
import * as template from './template.js';

/**
 * Register host/core modules only.
 * Domain packages (blog, forms, …) load via PackageLoader from installed package storage.
 */
export async function registerAllModules(ctx: ModuleContext): Promise<void> {
  await system.register(ctx);
  await content.register(ctx);
  await media.register(ctx);
  await users.register(ctx);
  await scheduler.register(ctx);
  await mail.register(ctx);
  await access.register(ctx);
  await seo.register(ctx);
  await lab.register(ctx);
  await module_manager.register(ctx);
  await ddos.register(ctx);
  await overload.register(ctx);
  await demo.register(ctx);
  await portfolio.register(ctx);
  await template.register(ctx);
}
