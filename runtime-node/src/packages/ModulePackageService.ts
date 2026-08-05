import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ModuleHealth } from './ModuleHealth.js';
import { ModulePaths } from './ModulePaths.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { extractZipSafe, isZipMagic, scanZip } from './zipSafe.js';
import type { Database } from '../db/Database.js';
import { assertModuleAllowedOnShared } from '../platform/capabilities.js';

export class ModulePackageService {
  readonly paths: ModulePaths;
  readonly registry: ModuleRegistry;
  readonly health: ModuleHealth;

  constructor(private db: Database, storagePath: string) {
    this.paths = new ModulePaths(storagePath);
    this.registry = new ModuleRegistry(db, this.paths);
    this.health = new ModuleHealth(this.registry, this.paths);
  }

  async uploadBuffer(originalName: string, buf: Buffer): Promise<{ package_id: string; path: string; size: number; original_name: string }> {
    if (!isZipMagic(buf)) {
      throw new Error('Invalid package ZIP (bad magic bytes)');
    }
    const scan = scanZip(buf);
    if (!scan.ok) {
      throw new Error(`Invalid package ZIP: ${scan.errors.join('; ')}`);
    }

    this.paths.ensureDir(this.paths.uploadsRoot());
    this.paths.ensureDir(this.paths.quarantineRoot());

    const packageId = crypto.randomBytes(16).toString('hex');
    const zipPath = path.join(this.paths.uploadsRoot(), `${packageId}.zip`);
    fs.writeFileSync(zipPath, buf);

    const quarantineDir = path.join(this.paths.quarantineRoot(), packageId);
    if (fs.existsSync(quarantineDir)) {
      fs.rmSync(quarantineDir, { recursive: true, force: true });
    }
    extractZipSafe(buf, quarantineDir, (root, target) => this.paths.assertContained(root, target));

    return {
      package_id: packageId,
      path: zipPath,
      size: buf.length,
      original_name: originalName,
    };
  }

  resolveQuarantineDir(packageId: string): string {
    if (!/^[a-f0-9]{32}$/.test(packageId)) {
      throw new Error('Invalid package_id');
    }
    const dir = path.join(this.paths.quarantineRoot(), packageId);
    if (!fs.existsSync(dir)) {
      throw new Error('Package not found in quarantine — upload first');
    }
    return dir;
  }

  readManifestFromDir(dir: string): Record<string, unknown> {
    const manifestPath = this.findManifestPath(dir);
    if (!manifestPath) {
      throw new Error('module.json not found in package');
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  }

  findManifestPath(root: string): string | null {
    const direct = path.join(root, 'module.json');
    if (fs.existsSync(direct)) return direct;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const nested = path.join(root, entry.name, 'module.json');
      if (fs.existsSync(nested)) return nested;
    }
    return null;
  }

  detectPackageRoot(stagingDir: string): string {
    if (fs.existsSync(path.join(stagingDir, 'module.json'))) return stagingDir;
    for (const entry of fs.readdirSync(stagingDir, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(stagingDir, entry.name, 'module.json'))) {
        return path.join(stagingDir, entry.name);
      }
    }
    return stagingDir;
  }

  async install(slugParam: string, packageId: string): Promise<Record<string, unknown>> {
    const quarantineDir = this.resolveQuarantineDir(packageId);
    const packageRoot = this.detectPackageRoot(quarantineDir);
    const manifest = this.readManifestFromDir(packageRoot);
    const slug = String(manifest.slug ?? '');
    if (!slug) throw new Error('Manifest slug missing');
    if (slugParam && slugParam !== slug) {
      throw new Error(`URL slug ${slugParam} does not match manifest slug ${slug}`);
    }
    this.paths.assertSlug(slug);

    const existing = await this.registry.getBySlug(slug);
    if (existing && !['failed', 'uninstalled'].includes(String(existing.status ?? ''))) {
      throw new Error('Module slug already registered');
    }

    const dest = this.paths.moduleRoot(slug);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    this.paths.ensureDir(path.dirname(dest));
    fs.cpSync(packageRoot, dest, { recursive: true });

    const name = String(manifest.name ?? slug);
    const version = String(manifest.version ?? '0.0.0');
    const frontend = manifest.frontend ?? null;
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(path.join(this.paths.uploadsRoot(), `${packageId}.zip`))).digest('hex');

    if (existing) {
      await this.registry.setStatus(slug, 'installed', null, 'unknown');
      await this.db.run(
        `UPDATE installed_modules SET name=?, installed_version=?, manifest_json=?, frontend_manifest_json=?, package_checksum=?, source='package' WHERE slug=?`,
        [name, version, JSON.stringify(manifest), frontend ? JSON.stringify(frontend) : null, checksum, slug],
      );
    } else {
      await this.registry.insert({
        slug,
        name,
        installed_version: version,
        status: 'installed',
        manifest_json: JSON.stringify(manifest),
        frontend_manifest_json: frontend ? JSON.stringify(frontend) : null,
        package_checksum: checksum,
      });
    }

    const health = await this.health.check(slug);
    return { ok: true, slug, status: 'installed', health };
  }

  async enable(slug: string): Promise<Record<string, unknown>> {
    const row = await this.registry.getBySlug(slug);
    if (!row) throw new Error('Module not found');
    await this.registry.setStatus(slug, 'enabled', null, 'unknown');
    await this.registry.mirrorPluginEnabled(slug, true);
    const health = await this.health.check(slug);
    return { ok: true, slug, status: 'enabled', health };
  }

  async disable(slug: string): Promise<Record<string, unknown>> {
    const row = await this.registry.getBySlug(slug);
    if (!row) throw new Error('Module not found');
    await this.registry.setStatus(slug, 'disabled', null, String(row.health_status ?? 'unknown'));
    await this.registry.mirrorPluginEnabled(slug, false);
    return { ok: true, slug, status: 'disabled' };
  }

  async rollback(slug: string): Promise<Record<string, unknown>> {
    const row = await this.registry.getBySlug(slug);
    if (!row) throw new Error('Module not found');

    const backupPath = await this.registry.findLatestBackupPath(slug);
    if (!backupPath) {
      const err = new Error('No rollback snapshot available');
      (err as Error & { status: number }).status = 409;
      throw err;
    }

    await this.registry.setStatus(slug, 'rolled_back', null, 'unknown');
    await this.registry.mirrorPluginEnabled(slug, false);
    return { ok: true, slug, status: 'rolled_back', backup_path: backupPath };
  }

  inspect(packageId: string): Record<string, unknown> {
    const quarantineDir = this.resolveQuarantineDir(packageId);
    const packageRoot = this.detectPackageRoot(quarantineDir);
    const zipPath = path.join(this.paths.uploadsRoot(), `${packageId}.zip`);
    const errors: string[] = [];
    const warnings: string[] = [];

    let manifest: Record<string, unknown>;
    try {
      manifest = this.readManifestFromDir(packageRoot);
    } catch (e) {
      return {
        ok: false,
        errors: [e instanceof Error ? e.message : 'Manifest read failed'],
        warnings,
      };
    }

    const slug = String(manifest.slug ?? '');
    if (!slug) errors.push('Manifest slug missing');

    const allowed = assertModuleAllowedOnShared(manifest as { runtime?: { baseline?: boolean; capabilities?: string[] } });
    if (!allowed.ok) errors.push(allowed.reason);

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      manifest,
      slug,
      operation: 'install',
      package_path: zipPath,
      package_checksum: fs.existsSync(zipPath)
        ? `sha256:${crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex')}`
        : null,
    };
  }

  async update(slugParam: string, packageId: string): Promise<Record<string, unknown>> {
    const inspect = this.inspect(packageId);
    if (!inspect.ok) {
      throw new Error(`Package inspection failed: ${(inspect.errors as string[]).join('; ')}`);
    }
    const slug = String(inspect.slug ?? '');
    if (slugParam && slugParam !== slug) {
      throw new Error(`URL slug ${slugParam} does not match manifest slug ${slug}`);
    }
    const row = await this.registry.getBySlug(slug);
    if (!row) throw new Error('Module not found — install first');

    const quarantineDir = this.resolveQuarantineDir(packageId);
    const packageRoot = this.detectPackageRoot(quarantineDir);
    const manifest = this.readManifestFromDir(packageRoot);
    const dest = this.paths.moduleRoot(slug);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    this.paths.ensureDir(path.dirname(dest));
    fs.cpSync(packageRoot, dest, { recursive: true });

    const version = String(manifest.version ?? '0.0.0');
    await this.db.run(
      `UPDATE installed_modules SET name=?, installed_version=?, manifest_json=?, updated_at=? WHERE slug=?`,
      [String(manifest.name ?? slug), version, JSON.stringify(manifest), nowIso(), slug],
    );
    const health = await this.health.check(slug);
    return { ok: true, slug, status: String(row.status ?? 'installed'), version, health };
  }

  async uninstall(slug: string, keepData = true): Promise<Record<string, unknown>> {
    const row = await this.registry.getBySlug(slug);
    if (!row) throw new Error('Module not found');

    const dest = this.paths.moduleRoot(slug);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });

    if (keepData) {
      await this.registry.setStatus(slug, 'uninstalled', null, 'unknown');
      await this.registry.mirrorPluginEnabled(slug, false);
    } else {
      await this.registry.deleteModule(slug);
      await this.registry.mirrorPluginEnabled(slug, false);
    }

    return { ok: true, slug, keep_data: keepData, status: keepData ? 'uninstalled' : 'deleted' };
  }

  async reconcilePluginMirror(dryRun = true): Promise<Record<string, unknown>> {
    const rows = await this.registry.listAll();
    const items: Record<string, unknown>[] = [];
    let divergent = 0;
    let repaired = 0;
    let unchanged = 0;

    for (const row of rows) {
      const slug = String(row.slug ?? '');
      const status = String(row.status ?? '');
      const wantEnabled = status === 'enabled' ? 1 : 0;
      let pluginEnabled: number | null = null;
      if (await this.db.tableExists('modules')) {
        const mod = await this.db.one('SELECT is_enabled FROM modules WHERE name=? LIMIT 1', [slug]);
        pluginEnabled = mod ? Number(mod.is_enabled ?? 0) : null;
      }
      const diverged = pluginEnabled !== null && pluginEnabled !== wantEnabled;
      if (diverged) {
        divergent += 1;
        if (!dryRun) {
          await this.registry.mirrorPluginEnabled(slug, wantEnabled === 1);
          repaired += 1;
        }
      } else {
        unchanged += 1;
      }
      items.push({ slug, status, plugin_enabled: pluginEnabled, expected: wantEnabled, diverged });
    }

    return {
      dry_run: dryRun,
      checked: rows.length,
      divergent,
      diverged: divergent,
      repaired,
      unchanged,
      items,
      failures: [],
    };
  }

  checkCompatibility(slug: string): Record<string, unknown> {
    this.paths.assertSlug(slug);
    const issues: string[] = [];
    const warnings: string[] = [];
    const moduleDir = this.paths.moduleRoot(slug);
    if (!fs.existsSync(moduleDir)) {
      issues.push('Module directory missing');
    } else {
      const manifestPath = path.join(moduleDir, 'module.json');
      if (!fs.existsSync(manifestPath)) issues.push('module.json missing');
      else {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
          if (manifest.slug && String(manifest.slug) !== slug) {
            issues.push(`Manifest slug mismatch: ${String(manifest.slug)}`);
          }
          const allowed = assertModuleAllowedOnShared(
            manifest as { runtime?: { baseline?: boolean; capabilities?: string[] } },
          );
          if (!allowed.ok) issues.push(allowed.reason);
        } catch {
          issues.push('module.json invalid JSON');
        }
      }
    }
    return { ok: issues.length === 0, issues, warnings, slug };
  }
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
