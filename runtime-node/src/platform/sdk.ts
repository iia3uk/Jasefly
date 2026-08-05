/**
 * Platform SDK surface for Node ZIP/package modules (dual binding with PHP App\Platform).
 * Packages must depend on this contract — not Core internals.
 */
import type { Database } from '../db/Database.js';
import type { EventBus } from './events.js';
import { availableCapabilities, loadCapabilitiesDoc } from './capabilities.js';
import type { AppConfig } from '../config.js';

export interface PlatformContext {
  database(): Database;
  events(): EventBus;
  config(): AppConfig;
  capabilities(): {
    has(cap: string): boolean;
    list(): string[];
    baseline(): string[];
    extended(): string[];
  };
  runtime(): 'node-vps';
}

export function createPlatformContext(db: Database, events: EventBus, cfg: AppConfig): PlatformContext {
  const doc = loadCapabilitiesDoc();
  const available = new Set(availableCapabilities(cfg));
  return {
    database: () => db,
    events: () => events,
    config: () => cfg,
    runtime: () => 'node-vps',
    capabilities: () => ({
      has: (cap) => available.has(cap),
      list: () => [...available].sort(),
      baseline: () => [...doc.baseline],
      extended: () => [...doc.extended],
    }),
  };
}
