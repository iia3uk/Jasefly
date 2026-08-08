import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { PackageSurfaceRegistry } from '../src/platform/PackageSurfaceRegistry.js';
import { HOST_TRASHABLE, HOST_CONTENT_RESOURCES } from '../src/system/hostBaselines.js';
import { trashableMap } from '../src/system/helpers.js';
import { contentResources } from '../src/core/permissionMiddleware.js';

describe('PackageSurfaceRegistry architecture', () => {
  beforeEach(() => {
    PackageSurfaceRegistry.resetForTests();
  });

  it('unknown package contributes surfaces without host hardcodes', () => {
    PackageSurfaceRegistry.register('zed', {
      trash: [{ resource: 'zed-items', table: 'zed_items' }],
      content_acl: [{ resource: 'zed-items' }],
      schema: [{ table: 'zed_items', role: 'owner' }],
    });
    expect(trashableMap()['zed-items']).toBe('zed_items');
    expect(contentResources()).toContain('zed-items');
    expect(PackageSurfaceRegistry.schemaOwners().zed_items).toBe('zed');
    expect(HOST_TRASHABLE.blog).toBeUndefined();
    expect(HOST_TRASHABLE.projects).toBeUndefined();
    expect(HOST_CONTENT_RESOURCES).not.toContain('blog');
  });

  it('one schema owner per table across package identity surfaces', () => {
    const repo = path.join(process.cwd(), '..');
    const owners: Record<string, string> = {};
    for (const slug of ['blog', 'projects', 'products', 'orders', 'payments', 'comments']) {
      const candidates = [
        path.join(repo, 'Jasefly-Modules', 'modules-src', slug, 'module.json'),
        path.join(repo, 'modules-src', slug, 'module.json'),
        path.join(repo, 'release/catalog/manifests', `${slug}.json`),
        path.join(repo, 'backend/tests/fixtures/modules', slug, 'module.json'),
      ];
      const mfPath = candidates.find((p) => fs.existsSync(p));
      expect(mfPath, `identity for ${slug}`).toBeTruthy();
      const mf = JSON.parse(fs.readFileSync(mfPath!, 'utf8'));
      for (const row of mf.surfaces?.schema ?? []) {
        if (row.role !== 'owner') continue;
        expect(owners[row.table], `duplicate owner for ${row.table}`).toBeUndefined();
        owners[row.table] = slug;
      }
    }
    expect(owners.orders).toBe('orders');
    expect(owners.payments).toBe('payments');
  });

  it('host helpers/dashboard sources do not hardcode extracted blog/projects/products tables', () => {
    const helpers = fs.readFileSync(path.join(process.cwd(), 'src/system/helpers.ts'), 'utf8');
    const baselines = fs.readFileSync(path.join(process.cwd(), 'src/system/hostBaselines.ts'), 'utf8');
    const content = fs.readFileSync(path.join(process.cwd(), 'src/modules/content.ts'), 'utf8');
    expect(baselines).not.toMatch(/blog_posts/);
    expect(baselines).not.toMatch(/^\s*products:/m);
    expect(helpers).toContain('PackageSurfaceRegistry');
    expect(content).toContain('PackageSurfaceRegistry.sitemapEntries');
    // Sitemap path must be registry-driven (search may still probe optional tables).
    const sitemapFn = content.slice(content.indexOf('sitemap'));
    expect(sitemapFn.slice(0, 2500)).not.toMatch(/FROM blog_posts/);
    expect(sitemapFn.slice(0, 2500)).not.toMatch(/FROM projects /);
    expect(sitemapFn.slice(0, 2500)).not.toMatch(/FROM products /);
  });
});

