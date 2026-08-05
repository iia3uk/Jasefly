import fs from 'node:fs';
import path from 'node:path';

const SLUG_RE = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

/** Path jail for ZIP module packages under storage. */
export class ModulePaths {
  constructor(private storagePath: string) {}

  modulesRoot(): string {
    return path.join(this.storagePath, 'modules');
  }

  moduleRoot(slug: string): string {
    this.assertSlug(slug);
    return path.join(this.modulesRoot(), slug);
  }

  installerRoot(): string {
    return path.join(this.storagePath, 'module-installer');
  }

  uploadsRoot(): string {
    return path.join(this.installerRoot(), 'uploads');
  }

  stagingRoot(): string {
    return path.join(this.installerRoot(), 'staging');
  }

  quarantineRoot(): string {
    return path.join(this.installerRoot(), 'quarantine');
  }

  backupsRoot(): string {
    return path.join(this.installerRoot(), 'backups');
  }

  assertSlug(slug: string): void {
    if (!SLUG_RE.test(slug)) {
      throw new Error('Invalid module slug');
    }
  }

  /** Ensure resolved path stays inside root (zip-slip / path jail). */
  assertContained(root: string, target: string): string {
    const rootResolved = path.resolve(root);
    const targetResolved = path.resolve(target);
    const rel = path.relative(rootResolved, targetResolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Path escapes allowed root');
    }
    return targetResolved;
  }

  ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function isDangerousPath(name: string): boolean {
  const n = name.replace(/\\/g, '/');
  if (!n || n.includes('\0')) return true;
  if (n.startsWith('/') || /^[A-Za-z]:\//.test(n)) return true;
  for (const part of n.split('/')) {
    if (part === '..') return true;
  }
  return false;
}
