/**
 * Load mcp-cms/.env (and optional repo .env) into process.env.
 * Does not override variables already set (e.g. by Cursor MCP config).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {string} filePath
 */
export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
  return true;
}

/** Load secrets for MCP — call once at process start. */
export function loadMcpEnv() {
  const mcpRoot = path.resolve(__dirname, '..');
  const repoRoot = process.env.CMS_REPO_ROOT
    ? path.resolve(process.env.CMS_REPO_ROOT)
    : path.resolve(mcpRoot, '..');

  const loaded = [];
  // Prefer mcp-cms/.env (local agent secrets)
  if (loadEnvFile(path.join(mcpRoot, '.env'))) loaded.push('mcp-cms/.env');
  // Optional monorepo root .env
  if (loadEnvFile(path.join(repoRoot, '.env'))) loaded.push('repo/.env');
  // Never print secret values
  return { loaded, mcpRoot, repoRoot };
}
