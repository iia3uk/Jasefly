/**
 * DB parity helpers (future row/table compare).
 * Export scrubRow for normalizing timestamps, tokens, and volatile columns.
 */
import { scrub as scrubValue } from './scrub.mjs';

/** Columns commonly ignored when comparing PHP vs Node DB rows. */
export const DEFAULT_IGNORE_COLS = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'last_login_at',
  'password_hash',
  'refresh_token',
  'access_token',
  'jti',
  'challenge_token',
  'remember_token',
  'email_verified_at',
]);

/**
 * Scrub one DB row for structural parity compare.
 * @param {Record<string, unknown>|null|undefined} row
 * @param {{ ignore?: Set<string>, coerce?: Record<string, (v: unknown) => unknown> }} [opts]
 */
export function scrubRow(row, opts = {}) {
  if (!row || typeof row !== 'object') return row;
  const ignore = opts.ignore ?? DEFAULT_IGNORE_COLS;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (ignore.has(k)) {
      out[k] = '<scrubbed>';
      continue;
    }
    if (opts.coerce?.[k]) {
      out[k] = opts.coerce[k](v);
      continue;
    }
    out[k] = scrubValue(v);
  }
  return out;
}

/**
 * Scrub many rows; sort by first key for stable order when ids are scrubbed.
 * @param {Array<Record<string, unknown>>} rows
 * @param {Parameters<typeof scrubRow>[1]} [opts]
 */
export function scrubRows(rows, opts) {
  const scrubbed = (rows || []).map((r) => scrubRow(r, opts));
  const sortKey = scrubbed[0] ? Object.keys(scrubbed[0]).find((k) => !DEFAULT_IGNORE_COLS.has(k)) : null;
  if (!sortKey) return scrubbed;
  return scrubbed.sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')));
}

/**
 * Deep JSON compare after scrub (for future table snapshots).
 * @param {unknown} a
 * @param {unknown} b
 */
export function deepEqualScrubbed(a, b) {
  return JSON.stringify(scrubValue(a)) === JSON.stringify(scrubValue(b));
}
