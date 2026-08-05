/** Shared response/DB scrubber for parity harness. */
const SCRUB_KEYS = new Set([
  'time',
  'created_at',
  'updated_at',
  'last_login_at',
  'expires_in',
  'access_token',
  'refresh_token',
  'jti',
  'challenge_token',
  // translate batch: provider id may differ between PHP (google) and Node (stub)
  'provider',
  'default_provider',
  'runtime',
  'content_hash',
  'caps_version',
  // migration warning text may differ slightly
  'warning',
]);

/** Normalize envelope shape before deep compare (PHP sometimes omits success on {data}). */
export function normalizeEnvelope(json) {
  if (!json || typeof json !== 'object') return json;
  const out = { ...json };
  // PHP often sends "error": null / "success": null on success — treat as absent.
  if (out.error === null || out.error === undefined) delete out.error;
  if (out.success === null) delete out.success;
  if ('data' in out && out.success === undefined && !('error' in out)) {
    out.success = true;
  }
  // Empty singleton {} vs null — same for happy-get shape.
  if (out.data && typeof out.data === 'object' && !Array.isArray(out.data) && Object.keys(out.data).length === 0) {
    out.data = null;
  }
  // Node list wrappers {items,total} → array (PHP AdminController returns rows[]).
  if (
    out.data &&
    typeof out.data === 'object' &&
    !Array.isArray(out.data) &&
    Array.isArray(out.data.items) &&
    ('total' in out.data || 'page' in out.data)
  ) {
    out.data = out.data.items;
  }
  return out;
}

/** Coerce SQLite/PHP bool-ish values so deep compare is stable. */
function coerce(k, v) {
  if (k === 'is_home' || k === 'is_visible' || k === 'is_enabled') {
    if (v === true || v === 1 || v === '1') return 1;
    if (v === false || v === 0 || v === '0') return 0;
  }
  return v;
}

export function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      const v = coerce(k, value[k]);
      if (SCRUB_KEYS.has(k)) {
        out[k] = typeof v === 'string' || typeof v === 'number' ? '<scrubbed>' : scrub(v);
        continue;
      }
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}
