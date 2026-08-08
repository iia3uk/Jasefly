/**
 * Package-declared event metadata (discovery) — not a second event bus.
 * Parity with PHP App\Platform\Events\EventCatalog.
 */

export type DeclaredEvent = {
  id: string;
  owner: string;
  label: string;
  category: string;
  payload: Record<string, unknown>;
};

const events = new Map<string, DeclaredEvent>();

const EVENT_ID_RE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_-]*)+$/;
/** Align with ModulePaths slug rules */
const SLUG_RE = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

export const EventCatalog = {
  declare(id: string, ownerSlug: string, meta: { label?: string; category?: string; payload?: Record<string, unknown> } = {}): void {
    const eventId = id.trim();
    const owner = ownerSlug.trim();
    if (!EVENT_ID_RE.test(eventId)) {
      throw new Error(`Invalid public event id: ${id}`);
    }
    if (!SLUG_RE.test(owner)) {
      throw new Error(`Invalid event owner slug: ${ownerSlug}`);
    }
    const existing = events.get(eventId);
    if (existing && existing.owner !== owner) {
      throw new Error(`Event id already declared by another owner: ${eventId}`);
    }
    events.set(eventId, {
      id: eventId,
      owner,
      label: meta.label ?? eventId,
      category: meta.category ?? 'general',
      payload: meta.payload ?? {},
    });
  },

  clearOwner(slug: string): number {
    const owner = slug.trim();
    if (!owner) return 0;
    let n = 0;
    for (const [id, row] of events) {
      if (row.owner === owner) {
        events.delete(id);
        n++;
      }
    }
    return n;
  },

  has(id: string): boolean {
    return events.has(id.trim());
  },

  get(id: string): DeclaredEvent | null {
    return events.get(id.trim()) ?? null;
  },

  list(): DeclaredEvent[] {
    return [...events.values()].sort((a, b) => a.id.localeCompare(b.id));
  },

  /** Test helper */
  resetForTests(): void {
    events.clear();
  },
};
