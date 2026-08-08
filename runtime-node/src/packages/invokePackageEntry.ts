/**
 * Canonical Node package entry: register(platformContext) only.
 * No ModuleContext / registerLegacy compatibility path.
 */
import type { PlatformContext } from '../platform/sdk.js';

export async function invokePackageEntry(
  mod: Record<string, unknown>,
  pctx: PlatformContext,
): Promise<void> {
  if (typeof mod.registerLegacy === 'function' || typeof mod.registerModule === 'function') {
    throw new Error(
      `Package "${pctx.slug()}" exports registerLegacy/registerModule — migrate to register(platformContext)`,
    );
  }

  const platformRegister = mod.register;
  if (typeof platformRegister === 'function') {
    await (platformRegister as (c: PlatformContext) => Promise<void>)(pctx);
    return;
  }

  if (typeof mod.default === 'function') {
    await (mod.default as (c: PlatformContext) => Promise<void>)(pctx);
    return;
  }

  throw new Error('Package Node entry must export register(platformContext)');
}
