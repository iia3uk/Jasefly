/**
 * Architecture assertions: extracted Node domains stay on pure PlatformContext.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../src/config.js';

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
] as const;

function read(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

/** Local authoring workspace (gitignored) or CI fixture — never require Core-tracked package source. */
function packageFile(slug: string, rel: string): string {
  const candidates = [
    path.join(REPO_ROOT, 'Jasefly-Modules', 'modules-src', slug, rel),
    path.join(REPO_ROOT, 'modules-src', slug, rel),
    path.join(REPO_ROOT, 'backend/tests/fixtures/modules', slug, rel),
  ];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) {
    throw new Error(`Missing package file for ${slug}: ${rel} (Jasefly-Modules / modules-src / fixtures)`);
  }
  return fs.readFileSync(hit, 'utf8');
}

describe('Node domain native SDK assertions', () => {
  it('extracted packages export register only when package source is available', () => {
    // Package implementations are external (modules-src gitignored). CI without a local
    // authoring workspace still proves host isolation via registerAll / zed / loader tests.
    const present = DOMAINS.filter((slug) => {
      try {
        packageFile(slug, 'backend/node/index.ts');
        packageFile(slug, 'backend/node/domain.ts');
        return true;
      } catch {
        return false;
      }
    });
    if (present.length === 0) {
      expect(fs.existsSync(path.join(REPO_ROOT, 'runtime-node/src/modules/webhooks.ts'))).toBe(false);
      return;
    }
    for (const slug of present) {
      const index = packageFile(slug, 'backend/node/index.ts');
      expect(index, slug).toMatch(/export\s*\{\s*register\s*\}/);
      expect(index, slug).not.toMatch(/export\s*\{[^}]*\bregisterLegacy\b/);
      expect(index, slug).not.toMatch(/\bregisterLegacy\s+as\b|\bas\s+registerLegacy\b/);
      expect(index, slug).not.toMatch(/export\s+(async\s+)?function\s+registerLegacy\b/);
      expect(index, slug).not.toMatch(/export\s*\{[^}]*\bregisterModule\b/);

      const domain = packageFile(slug, 'backend/node/domain.ts');
      expect(domain, slug).toMatch(/export\s+async\s+function\s+register\s*\(\s*ctx:\s*PlatformContext/);
      expect(domain, slug).not.toMatch(/export\s+(async\s+)?function\s+registerLegacy\b/);
      expect(domain, slug).not.toMatch(/\bModuleContext\b/);
      expect(domain, slug).not.toMatch(/runtime-node\/src\/modules/);
      expect(domain, slug).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/runtime-node/);
    }
  });

  it('PackageLoader has no legacy ModuleContext bridge', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'runtime-node/src/packages/legacyModuleBind.ts'))).toBe(false);
    const loader = read('runtime-node/src/packages/PackageLoader.ts');
    expect(loader).toMatch(/invokePackageEntry/);
    expect(loader).not.toMatch(/legacyModuleBind/);
    expect(loader).not.toMatch(/buildLegacyModuleContext/);
    const invoke = read('runtime-node/src/packages/invokePackageEntry.ts');
    expect(invoke).toMatch(/register\(platformContext\)/);
    expect(invoke).toMatch(/registerLegacy/);
  });

  it('registerAll / moduleNames stay host-only (no extracted domain static registration)', () => {
    const registerAll = read('runtime-node/src/modules/registerAll.ts');
    for (const slug of DOMAINS) {
      expect(registerAll, slug).not.toMatch(new RegExp(`from ['"]\\.\\/${slug}(\\.js)?['"]`));
      expect(fs.existsSync(path.join(REPO_ROOT, `runtime-node/src/modules/${slug}.ts`)), slug).toBe(false);
    }
  });

  it('host default job handlers do not silently noop package jobs', () => {
    const reg = read('runtime-node/src/scheduler/JobHandlerRegistry.ts');
    expect(reg).toMatch(/newsletter\.campaign\.send/);
    // Package jobs must not be registered as host noops anymore
    const defaults = reg.slice(reg.indexOf('registerDefaultHandlers'));
    expect(defaults).not.toMatch(/registerJobHandler\(\s*['"]newsletter\.campaign\.send['"]/);
    expect(defaults).not.toMatch(/registerJobHandler\(\s*['"]analytics\.retention['"]/);
    expect(defaults).not.toMatch(/registerJobHandler\(\s*['"]analytics\.aggregate['"]/);
    expect(defaults).not.toMatch(/registerJobHandler\(\s*['"]automation\.resume['"]/);
  });

  it('HOST_PLUGIN_ORDER does not whitelist extracted package slugs', () => {
    const site = read('runtime-node/src/modules/publicSite.ts');
    const block = site.slice(site.indexOf('HOST_PLUGIN_ORDER'), site.indexOf('] as const'));
    for (const slug of DOMAINS) {
      expect(block, slug).not.toMatch(new RegExp(`['"]${slug}['"]`));
    }
  });

  it('dual-runtime zed fixture declares PHP + Node entrypoints', () => {
    const mf = JSON.parse(read('runtime-node/tests/fixtures/modules/zed/module.json')) as {
      slug: string;
      entrypoints: Record<string, string>;
    };
    expect(mf.slug).toBe('zed');
    expect(mf.entrypoints.backend).toMatch(/ZedProbeModule\.php$/);
    expect(mf.entrypoints.node).toBeTruthy();
    expect(fs.existsSync(path.join(REPO_ROOT, 'runtime-node/tests/fixtures/modules/zed', mf.entrypoints.backend))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(REPO_ROOT, 'runtime-node/tests/fixtures/modules/zed', mf.entrypoints.node))).toBe(
      true,
    );
  });

  it('package config facade does not expose secrets', () => {
    const sdk = read('runtime-node/src/platform/sdk.ts');
    expect(sdk).toMatch(/PlatformPackageConfig/);
    expect(sdk).toMatch(/publicConfig/);
    // Must not return raw AppConfig to packages
    expect(sdk).not.toMatch(/config:\s*\(\)\s*=>\s*cfg\b/);
  });
});
