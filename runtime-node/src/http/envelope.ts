import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Match PHP App\Response::json / ::error envelopes.
 * - success responses: { success, data, meta }
 * - errors: always an array (PHP default []), never null
 */
export function ok(
  c: Context,
  data: unknown,
  status: ContentfulStatusCode = 200,
  meta: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  return c.json(
    {
      success: true,
      data,
      meta: { api_version: 'v1', ...meta },
      ...extra,
    },
    status,
  );
}

export function fail(
  c: Context,
  error: string,
  status: ContentfulStatusCode = 400,
  errors: Record<string, unknown> | unknown[] | null = [],
  extra: Record<string, unknown> = {},
) {
  const errList = errors == null ? [] : errors;
  return c.json(
    {
      success: false,
      error,
      errors: errList,
      data: null,
      meta: { api_version: 'v1' },
      ...extra,
    },
    status,
  );
}
