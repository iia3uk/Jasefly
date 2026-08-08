import type { Hono } from 'hono';
import type { AppConfig } from '../config.js';
import type { AuthService } from '../auth/AuthService.js';
import type { AdminCrud } from '../crud/AdminCrud.js';
import type { Database } from '../db/Database.js';
import type { EventBus } from '../platform/events.js';
import type { PackageLoader } from '../packages/PackageLoader.js';

export interface ModuleContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: Hono<any>;
  db: Database;
  cfg: AppConfig;
  events: EventBus;
  auth: AuthService;
  crud: AdminCrud;
  apiPrefixes: string[];
  /** Generic ZIP package backend loader (parallel to legacy static modules). */
  packageLoader?: PackageLoader;
}

export interface JaseflyModule {
  name: string;
  /** false = register() intentionally registers no HTTP routes (metadata-only module). */
  httpSurface?: boolean;
  register(ctx: ModuleContext): void | Promise<void>;
}
