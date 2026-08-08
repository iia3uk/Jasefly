#!/usr/bin/env node
/**
 * Migrate modules-src/{slug}/backend/node from registerLegacy/ModuleContext → pure PlatformContext.
 * Usage: node scripts/migrate-node-domain-to-platform.mjs --all [--force]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const force = process.argv.includes('--force');
const all = process.argv.includes('--all');
const single = process.argv.find((a) => !a.startsWith('--'));

const DOMAINS = [
  'webhooks',
  'comments',
  'analytics',
  'notifications',
  'newsletter',
  'registration',
  'forms',
  'automation',
  'translate',
  'support',
  'blog',
  'projects',
  'products',
  'orders',
  'payments',
];

const SDK_SRC = path.join(root, 'package-sdk', 'node');

function copySdk(outDir) {
  const dest = path.join(outDir, 'sdk');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(SDK_SRC)) {
    fs.copyFileSync(path.join(SDK_SRC, f), path.join(dest, f));
  }
}

function extractApiPrefixesBody(src) {
  const marker = 'for (const p of ctx.apiPrefixes)';
  const idx = src.indexOf(marker);
  if (idx < 0) return { before: src, body: null, after: '' };
  const braceStart = src.indexOf('{', idx);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('unbalanced apiPrefixes loop');
  return {
    before: src.slice(0, idx),
    body: src.slice(braceStart + 1, end),
    after: src.slice(end + 1),
  };
}

function rewriteBody(body) {
  let b = body;
  b = b.replace(/ctx\.app\.(get|post|put|delete|patch)\(`\$\{p\}(\/[^`]*)`/g, 'http.$1(\'$2\'');
  b = b.replace(/ctx\.app\.(get|post|put|delete|patch)\(`\$\{base\}(\/[^`]*)`/g, 'http.$1(`${baseRel}$2`');
  b = b.replace(/const base = `\$\{p\}(\/[^`]+)`/g, "const baseRel = '$1'");
  b = b.replace(/ctx\.app\.(get|post|put|delete|patch)\(base,/g, 'http.$1(baseRel,');
  b = b.replace(/ctx\.app\.(get|post|put|delete|patch)\(`\$\{base\}\/([^`]*)`/g, 'http.$1(`${baseRel}/$2`');
  b = b.replace(/ctx\.app\.(get|post|put|delete|patch)\(`\$\{p\}\/([^`]*)`/g, "http.$1('/$2'");

  b = b.replace(/\bctx\.db\b/g, 'db');
  b = b.replace(/\bctx\.events\b/g, 'events');
  b = b.replace(/\bctx\.crud\b/g, 'crud!');
  b = b.replace(/requireAdmin\(ctx\.auth\)/g, 'http.admin()');
  b = b.replace(/requirePermission\(ctx\.auth,\s*['"]([^'"]+)['"]\)/g, "http.permission('$1')");
  b = b.replace(/requireAuth\(ctx\.auth\)/g, 'http.auth()');
  b = b.replace(/const admin = http\.admin\(\);\s*\n\s*const admin = http\.admin\(\);/g, 'const admin = http.admin();\n');

  // ok/fail → http.ok/fail (avoid double http.http)
  b = b.replace(/(?<![\w.])ok\(/g, 'http.ok(');
  b = b.replace(/(?<![\w.])fail\(/g, 'http.fail(');

  b = b.replace(/await readJsonBody\(c\)/g, 'await readJsonBody(c, http.fail)');
  b = b.replace(/await moduleSettings\(db,/g, 'await loadModuleSettings(db,');
  b = b.replace(/await moduleSettings\(ctx\.db,/g, 'await loadModuleSettings(db,');
  b = b.replace(/\bmoduleSettings\(/g, 'loadModuleSettings(');
  b = b.replace(/\bsaveModuleSettings\(/g, 'saveModuleSettings(');

  b = b.replace(/await softGate\(c,\s*db,/g, 'await ctx.plugins().softGate(c,');
  b = b.replace(/await softGate\(c,\s*ctx\.db,/g, 'await ctx.plugins().softGate(c,');
  b = b.replace(/await supportSoftGate\(c,\s*db,/g, 'await ctx.plugins().softGate(c,');
  b = b.replace(/await isModuleEnabled\(db,\s*PLUGIN\)/g, 'await ctx.plugins().isEnabled()');
  b = b.replace(/await isModuleEnabled\(db,/g, 'await ctx.plugins().isEnabled(');

  b = b.replace(/safeFetch\(/g, 'http.fetch(');
  b = b.replace(/isSafeHttpUrl\(/g, '(async (u) => { try { await http.fetch(u); return true; } catch { return false; } })(');

  b = b.replace(/await hashPassword\(/g, 'await ctx.passwords().hash(');
  b = b.replace(/createRequire[\s\S]*?argon2[\s\S]*?\}/m, '');

  // Remove local softGate function bodies later via cleanup of imports
  return b;
}

function migrateOne(slug) {
  const outDir = path.join(root, 'modules-src', slug, 'backend', 'node');
  const domainPath = path.join(outDir, 'domain.ts');
  const indexPath = path.join(outDir, 'index.ts');
  if (!fs.existsSync(domainPath)) {
    console.error('missing', domainPath);
    return false;
  }
  const indexCur = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  if (indexCur.includes('export async function register') && !indexCur.includes('registerLegacy') && !force) {
    console.log('skip (already native):', slug);
    return true;
  }

  copySdk(outDir);

  let src = fs.readFileSync(domainPath, 'utf8');

  // Strip old imports
  src = src.replace(/^import .+ from ['"]\.\/types\.js['"];\r?\n/gm, '');
  src = src.replace(/^import .+ from ['"]\.\/authMiddleware\.js['"];\r?\n/gm, '');
  src = src.replace(/^import .+ from ['"]\.\/permissionMiddleware\.js['"];\r?\n/gm, '');
  src = src.replace(/^import .+ from ['"]\.\/envelope\.js['"];\r?\n/gm, '');
  src = src.replace(/^import .+ from ['"]\.\/pluginState\.js['"];\r?\n/gm, '');
  src = src.replace(/^import .+ from ['"]\.\/softPluginGate\.js['"];\r?\n/gm, '');
  src = src.replace(/^import .+ from ['"]\.\/ssrfGuard\.js['"];\r?\n/gm, '');
  src = src.replace(/^import .+ from ['"]\.\/_helpers\.js['"];\r?\n/gm, '');
  src = src.replace(/^import type \{ Context \} from ['"]hono['"];\r?\n/gm, "import type { Context } from 'hono';\n");
  src = src.replace(/^export const name = ['"][^'"]+['"];\r?\n/gm, '');

  // Remove inline hashPassword / getUserFromContext duplicates will stay if present — OK

  const { before, body, after } = extractApiPrefixesBody(src);
  if (!body) {
    console.warn(slug, ': no apiPrefixes loop — manual check');
  }

  let fnStart = before.replace(
    /export async function register\(ctx:\s*ModuleContext\)/,
    'export async function register(ctx: PlatformContext)',
  );

  // Remove local softGate helpers that use old imports (optional dead code)
  fnStart = fnStart.replace(/async function softGate\([\s\S]*?\n\}\r?\n/g, '');
  fnStart = fnStart.replace(/async function supportSoftGate\([\s\S]*?\n\}\r?\n/g, '');

  const preamble = `import type { Context } from 'hono';
import type { PlatformContext } from './sdk/platform-types.js';
import {
  nowSql,
  publicId,
  notDeletedClause,
  readJsonBody,
  loadModuleSettings,
  saveModuleSettings,
} from './sdk/helpers.js';

`;

  // Drop duplicate Context import from fnStart/body area
  fnStart = fnStart.replace(/^import type \{ Context \} from ['"]hono['"];\r?\n/gm, '');
  fnStart = fnStart.replace(/^import crypto from ['"]node:crypto['"];\r?\n/gm, "import crypto from 'node:crypto';\n");
  fnStart = fnStart.replace(/^import \{ createHash \} from ['"]node:crypto['"];\r?\n/gm, "import { createHash } from 'node:crypto';\n");
  fnStart = fnStart.replace(/^import fs from ['"]node:fs['"];\r?\n/gm, "import fs from 'node:fs';\n");
  fnStart = fnStart.replace(/^import path from ['"]node:path['"];\r?\n/gm, "import path from 'node:path';\n");
  fnStart = fnStart.replace(/^import \{ fileURLToPath \} from ['"]node:url['"];\r?\n/gm, "import { fileURLToPath } from 'node:url';\n");
  fnStart = fnStart.replace(/^import \{ TranslateService[^;]+;\r?\n/gm, (m) => m);

  let outBody = body ? rewriteBody(body) : '';
  const wrapper = body
    ? `export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;

${outBody}
}
`
    : fnStart.includes('export async function register')
      ? rewriteBody(fnStart)
      : fnStart;

  // Keep non-loop preamble (helpers, constants) from before the loop, minus old register signature
  let head = before
    .replace(/export async function register\(ctx:\s*ModuleContext\)\s*\{[\s\S]*$/, '')
    .replace(/^import type \{ Context \} from ['"]hono['"];\r?\n/gm, '')
    .replace(/from ['"]\.\/_helpers\.js['"]/g, "from './sdk/helpers.js'");

  // TranslateService import keep
  head = head.replace(/from ['"]\.\/TranslateService\.js['"]/g, "from './TranslateService.js'");

  // Remove dead async function hashPassword block if we replaced calls
  head = head.replace(
    /\/\*\* Resolve argon2[\s\S]*?async function hashPassword[\s\S]*?\n\}\r?\n/g,
    '',
  );
  head = head.replace(/async function hashPassword[\s\S]*?\n\}\r?\n/g, '');

  // function getUserFromContext — keep
  const finalSrc =
    preamble +
    head +
    (body
      ? wrapper
      : rewriteBody(
          fnStart.replace(
            /export async function register\(ctx:\s*ModuleContext\)/,
            'export async function register(ctx: PlatformContext)',
          ),
        )) +
    (body ? after.replace(/^\s*\}\s*$/m, '') : '');

  // Clean double register if before still had partial
  let cleaned = finalSrc;
  // If somehow two register functions, keep last
  const regMatches = [...cleaned.matchAll(/export async function register\(/g)];
  if (regMatches.length > 1) {
    const last = cleaned.lastIndexOf('export async function register(');
    const firstPart = cleaned.slice(0, regMatches[0].index);
    cleaned = firstPart + cleaned.slice(last);
  }

  fs.writeFileSync(domainPath, cleaned);
  fs.writeFileSync(
    indexPath,
    `/**
 * Node package entry for ${slug} — pure PlatformContext (no registerLegacy).
 */
export { register } from './domain.js';
`,
  );

  // Remove obsolete shims
  for (const dead of [
    'authMiddleware.ts',
    'permissionMiddleware.ts',
    'envelope.ts',
    'pluginState.ts',
    'softPluginGate.ts',
    'ssrfGuard.ts',
    '_helpers.ts',
    'types.ts',
    'password.ts',
  ]) {
    const p = path.join(outDir, dead);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  console.log('migrated', slug);
  return true;
}

const list = all ? DOMAINS : single ? [single] : [];
if (!list.length) {
  console.error('Usage: node scripts/migrate-node-domain-to-platform.mjs <slug>|--all [--force]');
  process.exit(1);
}
let ok = true;
for (const slug of list) {
  try {
    if (!migrateOne(slug)) ok = false;
  } catch (e) {
    console.error(slug, e);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
