#!/usr/bin/env node
/**
 * Derive release/catalog from committed identity manifests (+ optional external modules root).
 * Catalog is an index — not a second source of truth for package implementation.
 *
 * Identity resolution order per slug:
 *   1. JASEFLY_MODULES_ROOT / Jasefly-Modules/modules-src/{slug}/module.json
 *   2. release/catalog/manifests/{slug}.json   (committed identity snapshot)
 *   3. backend/tests/fixtures/modules/{slug}/module.json
 *
 * Usage: node scripts/build-package-catalog.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveModuleSrc } from './modules-root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/** Canonical extracted domain packages (must match live-package-verify EXTRACTED). */
const EXTRACTED = [
  'webhooks',
  'comments',
  'forms',
  'analytics',
  'newsletter',
  'automation',
  'notifications',
  'support',
  'translate',
  'products',
  'orders',
  'payments',
  'registration',
  'blog',
  'projects',
];

const outDir = path.join(root, 'release', 'catalog');
const runtimeDir = path.join(outDir, 'runtime');
const manifestsDir = path.join(outDir, 'manifests');

function resolveManifest(slug) {
  const fromModules = resolveModuleSrc(root, slug);
  const candidates = [
    fromModules ? path.join(fromModules, 'module.json') : null,
    path.join(manifestsDir, `${slug}.json`),
    path.join(root, 'backend', 'tests', 'fixtures', 'modules', slug, 'module.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
    }
  }
  throw new Error(`Missing identity manifest for ${slug} (Jasefly-Modules / catalog/manifests / fixtures)`);
}

function findArtifact(slug, version) {
  const exact = path.join(root, 'release', 'modules', `jasefly-module-${slug}-${version}.zip`);
  if (fs.existsSync(exact)) return path.relative(root, exact).replace(/\\/g, '/');
  const globDir = path.join(root, 'release', 'modules');
  if (!fs.existsSync(globDir)) return `release/modules/jasefly-module-${slug}-${version}.zip`;
  const matches = fs
    .readdirSync(globDir)
    .filter((n) => new RegExp(`^jasefly-module-${slug}-\\d+\\.\\d+\\.\\d+\\.zip$`).test(n))
    .sort()
    .reverse();
  return matches[0]
    ? path.join('release/modules', matches[0]).replace(/\\/g, '/')
    : `release/modules/jasefly-module-${slug}-${version}.zip`;
}

function entrypoints(mf) {
  const ep = mf.entrypoints && typeof mf.entrypoints === 'object' ? mf.entrypoints : {};
  return {
    php: ep.backend ? String(ep.backend) : null,
    node: ep.node ? String(ep.node) : null,
    frontend_manifest: ep.frontend_manifest ? String(ep.frontend_manifest) : null,
  };
}

function migrations(mf) {
  const m = mf.migrations && typeof mf.migrations === 'object' ? mf.migrations : null;
  if (!m) return null;
  return {
    path: m.path ? String(m.path) : 'migrations',
    uninstall_path: m.uninstall_path ? String(m.uninstall_path) : null,
    namespace: m.namespace ? String(m.namespace) : null,
  };
}

const packages = EXTRACTED.map((slug) => {
  const { path: mfPath, data: mf } = resolveManifest(slug);
  const version = String(mf.version ?? '0.0.0');
  const ep = entrypoints(mf);
  const artifact = findArtifact(slug, version);
  // Keep committed identity snapshot in sync when regenerating from local authoring
  fs.mkdirSync(manifestsDir, { recursive: true });
  fs.writeFileSync(path.join(manifestsDir, `${slug}.json`), JSON.stringify(mf, null, 2) + '\n');
  return {
    slug,
    name: String(mf.name ?? slug),
    version,
    sourceOwnership: 'external package/module distribution',
    externalRepository: 'Jasefly-Modules',
    identityManifest: path.relative(root, path.join(manifestsDir, `${slug}.json`)).replace(/\\/g, '/'),
    resolvedFrom: path.relative(root, mfPath).replace(/\\/g, '/'),
    artifact,
    artifactStrategy: 'release-storage / Module Hub (ZIP not versioned in Core git)',
    entrypoints: ep,
    runtime: {
      php: Boolean(ep.php),
      node: Boolean(ep.node),
      dual: Boolean(ep.php && ep.node),
    },
    frontend: Boolean(ep.frontend_manifest || mf.frontend),
    migrations: migrations(mf),
    surfaces: mf.surfaces && typeof mf.surfaces === 'object' ? mf.surfaces : null,
    capabilities: mf.capabilities ?? null,
    permissions: Array.isArray(mf.permissions) ? mf.permissions : [],
    dependencies: mf.dependencies ?? null,
    events: mf.events ?? null,
    jobs: mf.jobs ?? null,
  };
});

const catalog = {
  generatedAt: new Date().toISOString(),
  architecture: {
    packageIdentity: 'module.json',
    sourceOwnership: 'external package/module distribution',
    externalRepository: 'Jasefly-Modules',
    coreRepoRole: 'contracts · loaders · catalog · tooling (not package implementation)',
    packageSourceRoot: 'Jasefly-Modules/modules-src/{slug} (or JASEFLY_MODULES_ROOT)',
    identitySnapshot: 'release/catalog/manifests/{slug}.json',
    artifact: 'release/modules/jasefly-module-{slug}-{version}.zip',
    artifactStorage: 'release-storage / Module Hub (not Core git)',
    runtimeModel: 'optional-entrypoints',
    principle: 'ONE PACKAGE · ONE IDENTITY · PHP and Node are adapters, not separate products',
  },
  counts: {
    packages: packages.length,
    php: packages.filter((p) => p.runtime.php).length,
    node: packages.filter((p) => p.runtime.node).length,
    dual: packages.filter((p) => p.runtime.dual).length,
  },
  packages,
};

fs.mkdirSync(runtimeDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'packages.json'), JSON.stringify(catalog, null, 2) + '\n');

function mdTable(rows) {
  const lines = [
    '| slug | version | artifact | PHP | Node | surfaces |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (p) =>
        `| ${p.slug} | ${p.version} | \`${path.basename(p.artifact)}\` | ${p.runtime.php ? 'yes' : 'no'} | ${p.runtime.node ? 'yes' : 'no'} | ${p.surfaces ? 'yes' : 'no'} |`,
    ),
  ];
  return lines.join('\n');
}

const packagesMd = `# Extracted domain packages (catalog)

> Derived index. **Implementation sources are external** (not bundled Core).
> Identity snapshots: \`release/catalog/manifests/{slug}.json\`
> Regenerate: \`node scripts/build-package-catalog.mjs\`

## Architecture

- **ONE PACKAGE** identity per slug (\`module.json\`)
- **Source ownership:** external package / Module Hub distribution
- **Core repo:** contracts · loaders · catalog · tooling (not package PHP/Node source)
- Local authoring workspace (optional, gitignored): \`modules-src/{slug}/\`
- Distributable ZIP: \`jasefly-module-{slug}-{version}.zip\` (release storage / Hub — not Core git)
- PHP / Node = optional runtime entrypoints on the **same** ZIP

## Packages (${packages.length})

${mdTable(packages)}

## Runtime views

- [runtime/php.md](runtime/php.md)
- [runtime/node.md](runtime/node.md)
- [runtime/dual-runtime.md](runtime/dual-runtime.md)

Machine-readable: [packages.json](packages.json)
`;

fs.writeFileSync(path.join(outDir, 'packages.md'), packagesMd);

const phpPkgs = packages.filter((p) => p.runtime.php);
const nodePkgs = packages.filter((p) => p.runtime.node);
const dualPkgs = packages.filter((p) => p.runtime.dual);

fs.writeFileSync(
  path.join(runtimeDir, 'php.md'),
  `# Packages with PHP entrypoint

Same canonical ZIP as Node. Identity = \`module.json\` (external package).

| slug | entrypoints.backend | artifact |
| --- | --- | --- |
${phpPkgs.map((p) => `| ${p.slug} | \`${p.entrypoints.php}\` | \`${path.basename(p.artifact)}\` |`).join('\n')}
`,
);

fs.writeFileSync(
  path.join(runtimeDir, 'node.md'),
  `# Packages with Node entrypoint

Same canonical ZIP as PHP. Identity = \`module.json\` (external package).

| slug | entrypoints.node | artifact |
| --- | --- | --- |
${nodePkgs.map((p) => `| ${p.slug} | \`${p.entrypoints.node}\` | \`${path.basename(p.artifact)}\` |`).join('\n')}
`,
);

fs.writeFileSync(
  path.join(runtimeDir, 'dual-runtime.md'),
  `# Dual-runtime packages (PHP + Node entrypoints)

One ZIP · one identity · two optional adapters · external distribution.

| slug | PHP | Node | artifact |
| --- | --- | --- | --- |
${dualPkgs
  .map(
    (p) =>
      `| ${p.slug} | \`${p.entrypoints.php}\` | \`${p.entrypoints.node}\` | \`${path.basename(p.artifact)}\` |`,
  )
  .join('\n')}

Synthetic proof fixture (not a product package): \`runtime-node/tests/fixtures/modules/zed/\`.
`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      out: path.relative(root, outDir).replace(/\\/g, '/'),
      counts: catalog.counts,
    },
    null,
    2,
  ),
);
