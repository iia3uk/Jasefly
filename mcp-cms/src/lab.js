/**
 * Jasefly Lab MCP helpers — manage experiment metadata/content only.
 * Never write JS/TS/PHP code to production; entry_key must be whitelisted.
 */

const FORBIDDEN_KEYS = new Set([
  'php', 'script', 'code', 'path', 'module_path', 'file', 'js', 'tsx', 'ts',
]);

/**
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown>}
 */
export function sanitizeLabPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('data must be an object');
  }
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Field "${key}" is not allowed for Lab MCP tools`);
    }
  }
  if ('entry_key' in out && typeof out.entry_key === 'string') {
    if (!/^[a-z][a-z0-9_-]*$/.test(out.entry_key)) {
      throw new Error('Invalid entry_key format');
    }
  }
  for (const field of ['settings_json', 'content_json']) {
    if (field in out && out[field] != null) {
      assertJsonBlob(out[field], field);
    }
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {string} field
 */
function assertJsonBlob(value, field) {
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
    } catch {
      throw new Error(`${field} must be valid JSON`);
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(`${field} must be a JSON object/array`);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Field "${key}" is not allowed inside ${field}`);
      }
    }
  }
}
