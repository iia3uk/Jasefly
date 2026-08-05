import type { ModuleContext } from '../core/types.js';

/**
 * Portfolio plugin — declarative metadata only in PHP (adminNav, blueprints, blocks).
 * REST routes live in Content/Projects/Blog modules; no HTTP surface here by design.
 */
export const name = 'portfolio';
export const httpSurface = false;

export async function register(_ctx: ModuleContext) {
  // Intentionally no routes — see PortfolioModule.php registerRoutes().
}
