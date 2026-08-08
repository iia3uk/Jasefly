/**
 * Process-local package surface declarations for host consumers.
 * Parity with PHP App\Platform\Surfaces\PackageSurfaceRegistry.
 */

export type PackageSurfaces = {
  trash?: Array<{ resource: string; table: string }>;
  dashboard?: Array<Record<string, unknown> & { table: string; key?: string }>;
  sitemap?: Array<Record<string, unknown> & { table: string }>;
  media?: Array<Record<string, unknown> & { table: string }>;
  content_acl?: Array<{ resource: string }>;
  schema?: Array<{ table: string; role?: 'owner' | 'alter' | 'consumer' }>;
};

const byOwner = new Map<string, PackageSurfaces>();
const SLUG_RE = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
const IDENT_RE = /^[a-z][a-z0-9_]{0,63}$/;

function safeIdent(name: string): string | null {
  const n = name.trim();
  return IDENT_RE.test(n) ? n : null;
}

function sanitize(surfaces: PackageSurfaces): PackageSurfaces {
  const out: PackageSurfaces = {};
  for (const key of ['trash', 'dashboard', 'sitemap', 'media', 'content_acl', 'schema'] as const) {
    const rows = surfaces[key];
    if (!Array.isArray(rows) || !rows.length) continue;
    (out as Record<string, unknown>)[key] = rows.filter((r) => r && typeof r === 'object');
  }
  return out;
}

function merge(a: PackageSurfaces, b: PackageSurfaces): PackageSurfaces {
  const out: PackageSurfaces = { ...a };
  for (const key of ['trash', 'dashboard', 'sitemap', 'media', 'content_acl', 'schema'] as const) {
    const next = b[key];
    if (!next?.length) continue;
    const prev = (out[key] as unknown[]) ?? [];
    (out as Record<string, unknown>)[key] = [...prev, ...next];
  }
  return out;
}

export const PackageSurfaceRegistry = {
  register(ownerSlug: string, surfaces: PackageSurfaces): void {
    const owner = ownerSlug.trim();
    if (!SLUG_RE.test(owner)) throw new Error(`Invalid surface owner slug: ${ownerSlug}`);
    const prev = byOwner.get(owner) ?? {};
    byOwner.set(owner, merge(prev, sanitize(surfaces)));
  },

  clearOwner(ownerSlug: string): number {
    const owner = ownerSlug.trim();
    if (!owner || !byOwner.has(owner)) return 0;
    byOwner.delete(owner);
    return 1;
  },

  trashable(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [, surfaces] of byOwner) {
      for (const row of surfaces.trash ?? []) {
        const table = safeIdent(String(row.table ?? ''));
        const resource = String(row.resource ?? '').trim();
        if (resource && table) out[resource] = table;
      }
    }
    return out;
  },

  dashboardMetrics(): Array<Record<string, unknown> & { owner: string; table: string }> {
    const out: Array<Record<string, unknown> & { owner: string; table: string }> = [];
    for (const [owner, surfaces] of byOwner) {
      for (const row of surfaces.dashboard ?? []) {
        const table = safeIdent(String(row.table ?? ''));
        if (!table) continue;
        out.push({ ...row, owner, table });
      }
    }
    return out;
  },

  sitemapEntries(): Array<Record<string, unknown> & { owner: string; table: string }> {
    const out: Array<Record<string, unknown> & { owner: string; table: string }> = [];
    for (const [owner, surfaces] of byOwner) {
      for (const row of surfaces.sitemap ?? []) {
        const table = safeIdent(String(row.table ?? ''));
        if (!table) continue;
        out.push({ ...row, owner, table });
      }
    }
    return out;
  },

  mediaCollectors(): Array<Record<string, unknown> & { owner: string; table: string }> {
    const out: Array<Record<string, unknown> & { owner: string; table: string }> = [];
    for (const [owner, surfaces] of byOwner) {
      for (const row of surfaces.media ?? []) {
        const table = safeIdent(String(row.table ?? ''));
        if (!table) continue;
        out.push({ ...row, owner, table });
      }
    }
    return out;
  },

  contentAclResources(): string[] {
    const out = new Set<string>();
    for (const [, surfaces] of byOwner) {
      for (const row of surfaces.content_acl ?? []) {
        const resource = String(row.resource ?? '').trim();
        if (resource) out.add(resource);
      }
    }
    return [...out];
  },

  schemaOwners(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [owner, surfaces] of byOwner) {
      for (const row of surfaces.schema ?? []) {
        const table = safeIdent(String(row.table ?? ''));
        const role = String(row.role ?? 'owner');
        if (table && role === 'owner') out[table] = owner;
      }
    }
    return out;
  },

  owners(): string[] {
    return [...byOwner.keys()];
  },

  forOwner(ownerSlug: string): PackageSurfaces | null {
    return byOwner.get(ownerSlug.trim()) ?? null;
  },

  resetForTests(): void {
    byOwner.clear();
  },
};
