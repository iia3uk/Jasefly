#!/usr/bin/env node
/**
 * Post-migration cleanup for Node domain packages → pure PlatformContext.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAINS = [
  'webhooks', 'comments', 'analytics', 'notifications', 'newsletter', 'registration',
  'forms', 'automation', 'translate', 'support', 'blog', 'projects', 'products', 'orders', 'payments',
];

function syncSdk(slug) {
  const dest = path.join(root, 'modules-src', slug, 'backend', 'node', 'sdk');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of ['helpers.ts', 'platform-types.ts']) {
    const sdkRoot = [
      path.join(root, 'Jasefly-Modules', 'package-sdk', 'node'),
      path.join(root, 'package-sdk', 'node'),
    ].find((p) => fs.existsSync(p));
    if (!sdkRoot) throw new Error('package-sdk/node not found (Jasefly-Modules or Core)');
    fs.copyFileSync(path.join(sdkRoot, f), path.join(dest, f));
  }
}

function ensureDbLikeImport(t) {
  if (!/\bDbLike\b/.test(t)) return t;
  if (/import\s+type\s*\{[^}]*\bDbLike\b/.test(t) || /import\s*\{[^}]*\bDbLike\b/.test(t)) {
    return t;
  }
  // Prefer adding to helpers import
  if (/from '\.\/sdk\/helpers\.js'/.test(t)) {
    if (/import\s*\{[\s\S]*?\}\s*from '\.\/sdk\/helpers\.js'/.test(t)) {
      return t.replace(
        /import\s*\{([\s\S]*?)\}\s*from '\.\/sdk\/helpers\.js';/,
        (m, inner) => {
          if (/\bDbLike\b/.test(inner)) return m;
          const cleaned = inner.replace(/\s+$/, '');
          const needsNl = cleaned.includes('\n');
          if (needsNl) {
            return `import type { DbLike } from './sdk/helpers.js';\nimport {${cleaned}} from './sdk/helpers.js';`;
          }
          return `import type { DbLike } from './sdk/helpers.js';\nimport {${cleaned} } from './sdk/helpers.js';`;
        },
      );
    }
  }
  return `import type { DbLike } from './sdk/helpers.js';\n${t}`;
}

function simplifyFetchTypes(t) {
  const complex =
    /PlatformContext\["http"\] extends \(\) => infer H \? H\["fetch"\] : never/g;
  if (!complex.test(t)) return t;
  t = t.replace(complex, 'FetchFn');
  if (!t.includes('type FetchFn =')) {
    t = t.replace(
      /import type \{ PlatformContext \} from '\.\/sdk\/platform-types\.js';/,
      `import type { PlatformContext } from './sdk/platform-types.js';\n\ntype FetchFn = ReturnType<PlatformContext['http']>['fetch'];`,
    );
  }
  return t;
}

for (const slug of DOMAINS) {
  const dir = path.join(root, 'modules-src', slug, 'backend', 'node');
  const p = path.join(dir, 'domain.ts');
  if (!fs.existsSync(p)) {
    console.log('skip missing', slug);
    continue;
  }
  syncSdk(slug);
  let t = fs.readFileSync(p, 'utf8');

  t = ensureDbLikeImport(t);
  t = simplifyFetchTypes(t);
  t = t.replace(/\bModuleContext\b/g, 'PlatformContext');
  t = t.replace(/\bmoduleSettings\(/g, 'loadModuleSettings(');

  if (slug === 'translate') {
    // Remove dead renamed local settings helper
    t = t.replace(
      /async function _unused_local_settings\(db: DbLike\): Promise<Record<string, unknown>> \{[\s\S]*?\n\}\n*/,
      '',
    );
    t = t.replace(/loadModuleSettings\(db\)/g, "loadModuleSettings(db, 'translate')");
  }

  if (slug === 'webhooks') {
    // Ensure subscribe uses fetchFn injection (already done if present)
    if (!t.includes('const manage = http.permission')) {
      console.warn('webhooks: manage permission missing');
    }
  }

  if (slug === 'projects') {
    // Remove unused softGate helper if call sites use ctx.plugins directly
    if (t.includes('async function softGate') && !/\bsoftGate\(ctx,/.test(t) && !/\bsoftGate\(c,/.test(t)) {
      t = t.replace(/async function softGate\([\s\S]*?\n\}\n*/, '');
    }
  }

  if (slug === 'support') {
    if (t.includes('async function supportSoftGate') && !/\bsupportSoftGate\(/.test(t.replace(/async function supportSoftGate[\s\S]*?\n\}/, ''))) {
      t = t.replace(/async function supportSoftGate\([\s\S]*?\n\}\n*/, '');
    }
  }

  // payments: fix broken typeof ok leftovers
  t = t.replace(/typeof httpOk_unused/g, 'never');
  t = t.replace(
    /Parameters<PlatformContext\["http"\] extends \(\) => infer H \? H\["ok"\] : never>/g,
    'Parameters<ReturnType<PlatformContext["http"]>["ok"]>',
  );

  fs.writeFileSync(p, t);

  // index must export register only
  const indexPath = path.join(dir, 'index.ts');
  fs.writeFileSync(
    indexPath,
    `/**
 * Node package entry for ${slug} — pure PlatformContext (no registerLegacy).
 */
export { register } from './domain.js';
`,
  );

  console.log('ok', slug);
}
