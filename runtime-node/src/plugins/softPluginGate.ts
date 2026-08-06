import type { Context } from 'hono';
import { fail, ok } from '../http/envelope.js';

export type SoftDecision = 'pass' | 'empty_list' | 'not_found' | 'plugin_disabled';

export function softDecide(pluginEnabled: boolean, method: string, isItem: boolean): SoftDecision {
  if (pluginEnabled) return 'pass';
  const m = method.toUpperCase();
  if (m === 'GET' && !isItem) return 'empty_list';
  if (m === 'GET') return 'not_found';
  return 'plugin_disabled';
}

/** Apply Design B soft response; returns Response when gated, null when pass. */
export function softRespond(
  c: Context,
  decision: SoftDecision,
  plugin: string,
): Response | null {
  if (decision === 'pass') return null;
  if (decision === 'empty_list') return ok(c, []);
  if (decision === 'not_found') return fail(c, 'Not found', 404);
  return fail(c, 'Plugin disabled', 409, null, { code: 'plugin_disabled', plugin });
}
