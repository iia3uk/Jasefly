#!/usr/bin/env node
/**
 * Extract Node domain into modules-src/{slug}/backend/node/ as legacy ModuleContext package.
 * Usage: node scripts/extract-node-domain.mjs <slug>|--all [--force]
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

function extractOne(slug) {
  const srcFile = path.join(root, 'runtime-node/src/modules', `${slug}.ts`);
  const helpersSrc = path.join(root, 'runtime-node/src/modules/_helpers.ts');
  const pkgRoot = path.join(root, 'modules-src', slug);
  const outDir = path.join(pkgRoot, 'backend', 'node');
  const domainOut = path.join(outDir, 'domain.ts');
  const indexOut = path.join(outDir, 'index.ts');
  const helpersOut = path.join(outDir, '_helpers.ts');
  const manifestPath = path.join(pkgRoot, 'module.json');

  if (!fs.existsSync(srcFile)) {
    console.error('missing module', srcFile);
    return false;
  }
  if (!fs.existsSync(manifestPath)) {
    console.error('missing manifest', manifestPath);
    return false;
  }
  if (fs.existsSync(indexOut) && !force) {
    console.log('skip', slug);
    return true;
  }

  fs.mkdirSync(outDir, { recursive: true });

  let domain = fs.readFileSync(srcFile, 'utf8');
  // Rewrite host imports → package-local or keep node builtins
  domain = domain.replace(
    /from ['"]\.\.\/core\/types\.js['"]/g,
    "from './types.js'",
  );
  domain = domain.replace(
    /from ['"]\.\.\/core\/authMiddleware\.js['"]/g,
    "from './authMiddleware.js'",
  );
  domain = domain.replace(
    /from ['"]\.\.\/core\/permissionMiddleware\.js['"]/g,
    "from './permissionMiddleware.js'",
  );
  domain = domain.replace(
    /from ['"]\.\.\/http\/envelope\.js['"]/g,
    "from './envelope.js'",
  );
  domain = domain.replace(
    /from ['"]\.\.\/db\/Database\.js['"]/g,
    "from './types.js'",
  );
  domain = domain.replace(
    /from ['"]\.\.\/plugins\/pluginState\.js['"]/g,
    "from './pluginState.js'",
  );
  domain = domain.replace(
    /from ['"]\.\.\/plugins\/softPluginGate\.js['"]/g,
    "from './softPluginGate.js'",
  );
  domain = domain.replace(
    /from ['"]\.\.\/support\/ssrfGuard\.js['"]/g,
    "from './ssrfGuard.js'",
  );
  domain = domain.replace(
    /from ['"]\.\.\/translate\/TranslateService\.js['"]/g,
    "from './TranslateService.js'",
  );
  domain = domain.replace(
    /from ['"]\.\/_helpers\.js['"]/g,
    "from './_helpers.js'",
  );

  fs.writeFileSync(domainOut, domain);

  // Local type stub for ModuleContext
  fs.writeFileSync(
    path.join(outDir, 'types.ts'),
    `import type { Hono } from 'hono';
export type Row = Record<string, unknown>;
export type Database = {
  tableExists(t: string): Promise<boolean>;
  columns(t: string): Promise<string[]>;
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  one(sql: string, params?: unknown[]): Promise<Row | null>;
  run(sql: string, params?: unknown[]): Promise<unknown>;
  lastInsertId(): Promise<number>;
  driver(): string;
};
export type ModuleContext = {
  app: Hono;
  db: Database;
  cfg: Record<string, unknown>;
  events: {
    subscribe(event: string, handler: (payload: Record<string, unknown>) => void | Promise<void>, priority?: number): void;
    publish(event: string, payload?: Record<string, unknown>): Promise<void>;
  };
  auth: unknown;
  crud: {
    list(c: unknown, resource: string): Promise<Response>;
    show(c: unknown, resource: string, id: string): Promise<Response>;
    create(c: unknown, resource: string): Promise<Response>;
    update(c: unknown, resource: string, id: string): Promise<Response>;
    remove(c: unknown, resource: string, id: string): Promise<Response>;
    publish(c: unknown, resource: string, id: string): Promise<Response>;
    reorder(c: unknown, resource: string): Promise<Response>;
  };
  apiPrefixes: string[];
};
`,
  );

  // Copy helper shims from runtime-node (thin re-exports compiled into package)
  const copyShim = (name, fromRel) => {
    const from = path.join(root, 'runtime-node/src', fromRel);
    const to = path.join(outDir, name);
    if (!fs.existsSync(from)) {
      console.warn('shim missing', from);
      return;
    }
    let text = fs.readFileSync(from, 'utf8');
    // Keep as local copy — rewrite internal imports to stay inside package when possible
    text = text.replace(/from ['"]\.\.\/db\/Database\.js['"]/g, "from './types.js'");
    text = text.replace(/from ['"]\.\.\/http\/envelope\.js['"]/g, "from './envelope.js'");
    text = text.replace(/from ['"]\.\/jwt\.js['"]/g, "from './jwt.js'");
    text = text.replace(/from ['"]\.\/password\.js['"]/g, "from './password.js'");
    fs.writeFileSync(to, text);
  };

  // envelope + helpers + auth middleware + soft gate + ssrf — copy needed files
  copyShim('envelope.ts', 'http/envelope.ts');
  let helpers = fs.readFileSync(helpersSrc, 'utf8');
  helpers = helpers.replace(/from ['"]\.\.\/db\/Database\.js['"]/g, "from './types.js'");
  helpers = helpers.replace(/from ['"]\.\.\/http\/envelope\.js['"]/g, "from './envelope.js'");
  fs.writeFileSync(helpersOut, helpers);

  copyShim('authMiddleware.ts', 'core/authMiddleware.ts');
  // Fix authMiddleware imports
  {
    let t = fs.readFileSync(path.join(outDir, 'authMiddleware.ts'), 'utf8');
    t = t.replace(/from ['"]\.\.\/auth\/AuthService\.js['"]/g, "from './types.js'");
    t = t.replace(/from ['"]\.\/envelope\.js['"]/g, "from './envelope.js'");
    t = t.replace(/from ['"]\.\.\/http\/envelope\.js['"]/g, "from './envelope.js'");
    // AuthService type — use unknown
    t = t.replace(/import type \{ AuthService \} from ['"].*['"];\r?\n/, '');
    t = t.replace(/AuthService/g, 'any');
    fs.writeFileSync(path.join(outDir, 'authMiddleware.ts'), t);
  }

  if (domain.includes('permissionMiddleware') || domain.includes('requirePermission')) {
    // Thin shim — host already enforced ACL at boundary; package uses admin gate.
    fs.writeFileSync(
      path.join(outDir, 'permissionMiddleware.ts'),
      `import type { MiddlewareHandler } from 'hono';
import { requireAdmin } from './authMiddleware.js';
export function requirePermission(auth: any, _capability?: string): MiddlewareHandler {
  return requireAdmin(auth);
}
`,
    );
  }

  if (domain.includes('softPluginGate') || domain.includes('pluginState')) {
    copyShim('softPluginGate.ts', 'plugins/softPluginGate.ts');
    copyShim('pluginState.ts', 'plugins/pluginState.ts');
    let t = fs.readFileSync(path.join(outDir, 'pluginState.ts'), 'utf8');
    t = t.replace(/from ['"]\.\.\/db\/Database\.js['"]/g, "from './types.js'");
    fs.writeFileSync(path.join(outDir, 'pluginState.ts'), t);
    t = fs.readFileSync(path.join(outDir, 'softPluginGate.ts'), 'utf8');
    t = t.replace(/from ['"]\.\.\/http\/envelope\.js['"]/g, "from './envelope.js'");
    fs.writeFileSync(path.join(outDir, 'softPluginGate.ts'), t);
  }

  if (domain.includes('ssrfGuard')) {
    copyShim('ssrfGuard.ts', 'support/ssrfGuard.ts');
  }

  if (domain.includes('TranslateService')) {
    // Copy translate service tree into package
    const tdir = path.join(root, 'runtime-node/src/translate');
    if (fs.existsSync(tdir)) {
      for (const f of fs.readdirSync(tdir)) {
        if (!f.endsWith('.ts')) continue;
        let t = fs.readFileSync(path.join(tdir, f), 'utf8');
        t = t.replace(/from ['"]\.\.\/db\/Database\.js['"]/g, "from './types.js'");
        t = t.replace(/from ['"]\.\/(.+)\.js['"]/g, "from './$1.js'");
        fs.writeFileSync(path.join(outDir, f), t);
      }
    }
  }

  fs.writeFileSync(
    indexOut,
    `/**
 * Node package entry for ${slug}.
 * registerLegacy: ModuleContext-style domain (bound by PackageLoader).
 */
export { register as registerLegacy } from './domain.js';
`,
  );

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.entrypoints = manifest.entrypoints || {};
  manifest.entrypoints.node = 'backend/node/index.ts';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log('extracted', slug);
  return true;
}

const list = all ? DOMAINS : single ? [single] : [];
if (!list.length) {
  console.error('Usage: node scripts/extract-node-domain.mjs <slug>|--all [--force]');
  process.exit(1);
}
let ok = true;
for (const slug of list) {
  if (!extractOne(slug)) ok = false;
}
process.exit(ok ? 0 : 1);
