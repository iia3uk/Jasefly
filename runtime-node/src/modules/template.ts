import type { ModuleContext } from '../core/types.js';

/** Scaffold module — disabled in PHP; zero HTTP surface. */
export const name = 'template';
export const httpSurface = false;

export async function register(_ctx: ModuleContext) {
  // Intentionally no routes — see TemplateModule.php registerRoutes().
}
