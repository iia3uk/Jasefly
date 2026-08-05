import fs from 'node:fs';
import path from 'node:path';
import type { ModulePaths } from './ModulePaths.js';
import type { ModuleRegistry } from './ModuleRegistry.js';

export interface HealthResult {
  slug: string;
  ok: boolean;
  status: string;
  issues: string[];
  warnings: string[];
  folder_exists: boolean;
  registered: boolean;
}

export class ModuleHealth {
  constructor(
    private registry: ModuleRegistry,
    private paths: ModulePaths,
  ) {}

  async check(slug: string): Promise<HealthResult> {
    const issues: string[] = [];
    const warnings: string[] = [];

    const row = await this.registry.getBySlug(slug);
    if (row === null) {
      return {
        slug,
        ok: false,
        status: 'failed',
        issues: ['Module not registered'],
        warnings: [],
        folder_exists: false,
        registered: false,
      };
    }

    const moduleDir = this.paths.moduleRoot(slug);
    const folderExists = fs.existsSync(moduleDir) && fs.statSync(moduleDir).isDirectory();
    if (!folderExists) {
      issues.push(`Module folder missing: storage/modules/${slug}`);
    }

    const status = String(row.status ?? '');
    if (status === 'failed' || status === 'uninstalled') {
      issues.push(`Module status is ${status}`);
    }
    if (String(row.health_status ?? '') === 'failed') {
      issues.push('health_status is failed');
    }
    if (row.last_error) {
      warnings.push(String(row.last_error));
    }

    const manifestPath = path.join(moduleDir, 'module.json');
    if (folderExists && !fs.existsSync(manifestPath)) {
      issues.push('module.json missing in package root');
    } else if (folderExists) {
      try {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(raw) as Record<string, unknown>;
        if (manifest.slug && String(manifest.slug) !== slug) {
          issues.push(`Manifest slug mismatch: ${String(manifest.slug)}`);
        }
      } catch {
        issues.push('module.json invalid JSON');
      }
    }

    const healthStatus = issues.length === 0 ? 'ok' : 'failed';
    if (issues.length > 0) {
      await this.registry.setStatus(slug, status || 'installed', issues.join('; '), healthStatus);
    }

    return {
      slug,
      ok: issues.length === 0,
      status: healthStatus,
      issues,
      warnings,
      folder_exists: folderExists,
      registered: true,
    };
  }
}
