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
  'csrf',
  'last_tick_at',
  'cron_stale',
  // support visitor session hash (random per runtime)
  'visitor_key',
  'public_id',
  // demo session id (random per start, same class as visitor_key)
  'session_id',
  'expires_at',
  // translate batch: provider id may differ between PHP (google) and Node (stub)
  'provider',
  'default_provider',
  'runtime',
  'content_hash',
  'caps_version',
  // migration warning text may differ slightly
  'warning',
  // SQLite page layout differs between PHP PDO and better-sqlite3 after identical DDL
  'database_size_bytes',
  'database_size_human',
  'generated_at',
  // Host/runtime env (CI Linux vs local Windows; php.ini; live loadavg)
  'storage_usage_bytes',
  'storage_usage_human',
  'cache_status',
  'gd_enabled',
  'web_root',
  'api_root',
  'php_upload_max',
  'php_post_max',
  'max_zip_mb',
  'zip_available',
  'hosting_layout',
  'load',
  'load_per_core',
  'overloaded',
  'quiet_until',
  'tripped',
  // Container CPU count (nproc vs os.cpus) shifts absolute thresholds.
  'cpus',
  'threshold_1m_absolute',
  'threshold_5m_absolute',
  // Prerender HTML is host/port/EOL dependent; keep path+status compared.
  'html_preview',
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
  // Empty errors array vs null — PHP always uses [].
  if (out.errors === null || out.errors === undefined) {
    out.errors = [];
  }
  // Node list wrappers {items} or {items,total,page…} → array (PHP AdminController returns rows[]).
  // Do NOT unwrap cart payloads that also carry cart_id / totals / currency.
  if (out.data && typeof out.data === 'object' && !Array.isArray(out.data)) {
    const keys = Object.keys(out.data);
    if (Array.isArray(out.data.items)) {
      const listMeta = new Set(['items', 'total', 'page', 'limit', 'offset', 'per_page']);
      const listOnly = keys.every((k) => listMeta.has(k));
      if (listOnly && (keys.includes('total') || keys.includes('page') || keys.length === 1)) {
        out.data = out.data.items;
      }
    }
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
        out[k] = '<scrubbed>';
        continue;
      }
      // prerender-preview: `bytes` is strlen(html); sibling of html_preview only.
      if (k === 'bytes' && Object.prototype.hasOwnProperty.call(value, 'html_preview')) {
        out[k] = '<scrubbed>';
        continue;
      }
      // Dual-runtime listen ports appear in robots/sitemap absolute URLs.
      if (typeof v === 'string' && (k === '_raw' || v.includes('127.0.0.1:'))) {
        out[k] = v
          .replace(/\r\n/g, '\n')
          .replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:<port>');
        continue;
      }
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}
