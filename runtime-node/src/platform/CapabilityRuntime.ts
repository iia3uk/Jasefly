/**
 * Process-local package-provided capabilities (runtime).
 * Complements static capabilities.v1.json baseline/extended catalogs.
 */

const provided = new Map<string, Set<string>>(); // cap → owners
const byOwner = new Map<string, Set<string>>(); // owner → caps

export const CapabilityRuntime = {
  provide(ownerSlug: string, capability: string): void {
    const owner = ownerSlug.trim();
    const cap = capability.trim();
    if (!owner || !cap) throw new Error('capability provide requires owner and name');
    if (!provided.has(cap)) provided.set(cap, new Set());
    provided.get(cap)!.add(owner);
    if (!byOwner.has(owner)) byOwner.set(owner, new Set());
    byOwner.get(owner)!.add(cap);
  },

  has(capability: string): boolean {
    const owners = provided.get(capability.trim());
    return !!owners && owners.size > 0;
  },

  listProvided(): string[] {
    return [...provided.keys()].filter((c) => (provided.get(c)?.size ?? 0) > 0).sort();
  },

  listByOwner(ownerSlug: string): string[] {
    return [...(byOwner.get(ownerSlug.trim()) ?? [])].sort();
  },

  revokeModule(ownerSlug: string): number {
    const owner = ownerSlug.trim();
    const caps = byOwner.get(owner);
    if (!caps) return 0;
    let n = 0;
    for (const cap of caps) {
      const owners = provided.get(cap);
      if (owners?.delete(owner)) n++;
      if (owners && owners.size === 0) provided.delete(cap);
    }
    byOwner.delete(owner);
    return n;
  },

  resetForTests(): void {
    provided.clear();
    byOwner.clear();
  },
};
