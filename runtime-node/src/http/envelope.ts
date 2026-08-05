import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function ok(c: Context, data: unknown, status: ContentfulStatusCode = 200, meta: Record<string, unknown> = {}) {
  return c.json(
    {
      success: true,
      data,
      meta: { api_version: 'v1', ...meta },
    },
    status,
  );
}

export function fail(
  c: Context,
  error: string,
  status: ContentfulStatusCode = 400,
  errors: Record<string, unknown> | unknown[] | null = null,
  extra: Record<string, unknown> = {},
) {
  return c.json(
    {
      success: false,
      error,
      errors,
      data: null,
      meta: { api_version: 'v1' },
      ...extra,
    },
    status,
  );
}