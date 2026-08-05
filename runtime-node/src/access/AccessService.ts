import { createHash } from 'node:crypto';
import type { AuthService } from '../auth/AuthService.js';
import type { Database, Row } from '../db/Database.js';

export type AccessDecision = {
  allowed: boolean;
  reason: string | null;
  provider: string | null;
  meta?: Record<string, unknown>;
};

type ProviderMeta = {
  id: string;
  label: string;
  available: boolean;
  asserts: Array<Record<string, unknown>>;
};

function normalizeRoles(raw: unknown): string[] {
  if (typeof raw === 'string') {
    return raw.split(/[\s,]+/).map((s) => s.toLowerCase().trim()).filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    const s = String(r).toLowerCase().trim();
    if (s) out.push(s);
  }
  return [...new Set(out)];
}

function normalizeRule(rule: unknown): Record<string, unknown> | null {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null;
  const r = rule as Record<string, unknown>;
  if (r.provider && r.assert && !r.rules) {
    return {
      version: 1,
      op: 'all',
      rules: [{
        provider: String(r.provider),
        assert: String(r.assert),
        params: typeof r.params === 'object' && r.params !== null ? r.params : {},
      }],
    };
  }
  if (r.op && Array.isArray(r.rules)) return r;
  return null;
}

export class AccessService {
  constructor(
    private db: Database,
    private auth: AuthService,
  ) {}

  providers(): ProviderMeta[] {
    return [
      {
        id: 'auth',
        label: 'Авторизация',
        available: true,
        asserts: [
          { id: 'guest', label: 'Только гость' },
          { id: 'authenticated', label: 'Авторизован' },
        ],
      },
      {
        id: 'role',
        label: 'Роль',
        available: true,
        asserts: [
          {
            id: 'in',
            label: 'Одна из ролей',
            params: [{ key: 'roles', label: 'Роли', type: 'string_list' }],
          },
          {
            id: 'not_in',
            label: 'Не эти роли',
            params: [{ key: 'roles', label: 'Роли', type: 'string_list' }],
          },
        ],
      },
      {
        id: 'capability',
        label: 'Capability (ACL)',
        available: true,
        asserts: [
          {
            id: 'has',
            label: 'Имеет capability',
            params: [{ key: 'capability', label: 'Capability', type: 'text' }],
          },
          {
            id: 'missing',
            label: 'Не имеет capability',
            params: [{ key: 'capability', label: 'Capability', type: 'text' }],
          },
        ],
      },
    ];
  }

  async can(userId: number | null, rule: unknown): Promise<AccessDecision & { rule: Record<string, unknown> | null; user_id: number | null }> {
    const normalized = normalizeRule(rule);
    const decision = normalized ? await this.evaluateNode(userId, normalized) : { allowed: true, reason: null, provider: null, meta: { empty_rule: true } };
    return {
      ...decision,
      rule: normalized,
      user_id: userId,
    };
  }

  async batchCan(user: Row | 'mcp', capabilities: string[]): Promise<Record<string, boolean>> {
    const payload = await this.auth.mePayload(user);
    const caps = payload.capabilities as string[];
    const isSuper = Boolean(payload.is_super);
    const out: Record<string, boolean> = {};
    for (const cap of capabilities) {
      const slug = cap.trim();
      if (!slug) continue;
      out[slug] = isSuper || caps.includes('*') || caps.includes(slug);
    }
    return out;
  }

  async bootstrapPayload(user: Row | 'mcp') {
    const me = await this.auth.mePayload(user);
    const caps = me.capabilities as string[];
    return {
      capabilities: caps,
      roles: me.roles,
      is_super: me.is_super,
      version: String(me.caps_version ?? 1),
      nav: [],
      catalog: [],
      providers: this.providers(),
    };
  }

  async effectiveBundle(userId: number, user?: Row | null) {
    if (!userId || userId <= 0) {
      return { caps: [] as string[], is_super: false, roles: [] as string[], version: '0' };
    }
    const row = user ?? (await this.db.one('SELECT * FROM users WHERE id=?', [userId]));
    if (!row) return { caps: [] as string[], is_super: false, roles: [] as string[], version: '0' };
    const me = await this.auth.mePayload(row);
    return {
      caps: me.capabilities as string[],
      is_super: Boolean(me.is_super),
      roles: me.roles as string[],
      version: String(me.caps_version ?? 1),
    };
  }

  private async evaluateNode(userId: number | null, node: Record<string, unknown>): Promise<AccessDecision> {
    const op = String(node.op ?? 'all');
    const rules = Array.isArray(node.rules) ? node.rules : [];
    if (rules.length === 0) {
      return { allowed: true, reason: null, provider: null, meta: { empty_rules: true } };
    }
    if (op === 'not') {
      const first = rules[0];
      const inner = typeof first === 'object' && first !== null && 'op' in (first as object)
        ? await this.evaluateNode(userId, first as Record<string, unknown>)
        : await this.evaluateLeaf(userId, (first ?? {}) as Record<string, unknown>);
      return inner.allowed
        ? { allowed: false, reason: 'Negated rule matched', provider: inner.provider }
        : { allowed: true, reason: null, provider: inner.provider, meta: { negated: true } };
    }
    let lastDeny: AccessDecision = { allowed: false, reason: 'Access denied', provider: null };
    let lastAllow: AccessDecision | null = null;
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') continue;
      const r = rule as Record<string, unknown>;
      const decision = r.op && r.rules
        ? await this.evaluateNode(userId, r)
        : await this.evaluateLeaf(userId, r);
      if (op === 'any' && decision.allowed) return decision;
      if (op === 'all' && !decision.allowed) return decision;
      if (decision.allowed) lastAllow = decision;
      if (!decision.allowed) lastDeny = decision;
    }
    if (op === 'any') return lastDeny;
    return lastAllow ?? { allowed: true, reason: null, provider: null };
  }

  private async evaluateLeaf(userId: number | null, leaf: Record<string, unknown>): Promise<AccessDecision> {
    const providerId = String(leaf.provider ?? '').trim();
    const assert = String(leaf.assert ?? '').trim();
    const params = (leaf.params && typeof leaf.params === 'object' ? leaf.params : {}) as Record<string, unknown>;
    if (!providerId || !assert) {
      return { allowed: false, reason: 'Invalid rule leaf', provider: null };
    }
    if (providerId === 'auth') return this.evalAuth(userId, assert);
    if (providerId === 'role') return this.evalRole(userId, assert, params);
    if (providerId === 'capability') return this.evalCapability(userId, assert, params);
    return { allowed: false, reason: `Unknown provider: ${providerId}`, provider: providerId };
  }

  private evalAuth(userId: number | null, assert: string): AccessDecision {
    const loggedIn = userId !== null && userId > 0;
    if (assert === 'guest') {
      return loggedIn
        ? { allowed: false, reason: 'User is authenticated', provider: 'auth' }
        : { allowed: true, reason: null, provider: 'auth' };
    }
    if (assert === 'authenticated') {
      return loggedIn
        ? { allowed: true, reason: null, provider: 'auth' }
        : { allowed: false, reason: 'Authentication required', provider: 'auth' };
    }
    return { allowed: false, reason: `Unknown auth assert: ${assert}`, provider: 'auth' };
  }

  private async evalRole(userId: number | null, assert: string, params: Record<string, unknown>): Promise<AccessDecision> {
    if (userId === null || userId <= 0) {
      return { allowed: false, reason: 'Authentication required', provider: 'role' };
    }
    const wanted = normalizeRoles(params.roles);
    if (wanted.length === 0) {
      return { allowed: false, reason: 'No roles configured', provider: 'role' };
    }
    const userRoles = await this.userRoles(userId);
    const overlap = userRoles.filter((r) => wanted.includes(r));
    const inRole = overlap.length > 0;
    if (assert === 'in') {
      return inRole
        ? { allowed: true, reason: null, provider: 'role', meta: { roles: userRoles, matched: overlap } }
        : { allowed: false, reason: 'Role not allowed', provider: 'role', meta: { roles: userRoles } };
    }
    if (assert === 'not_in') {
      return !inRole
        ? { allowed: true, reason: null, provider: 'role', meta: { roles: userRoles } }
        : { allowed: false, reason: 'Role excluded', provider: 'role', meta: { roles: userRoles, matched: overlap } };
    }
    return { allowed: false, reason: `Unknown role assert: ${assert}`, provider: 'role' };
  }

  private async evalCapability(userId: number | null, assert: string, params: Record<string, unknown>): Promise<AccessDecision> {
    const cap = String(params.capability ?? '').trim();
    if (!cap) {
      return { allowed: false, reason: 'capability param required', provider: 'capability' };
    }
    const allowed = await this.userHasCapability(userId, cap);
    if (assert === 'missing') {
      return allowed
        ? { allowed: false, reason: 'User has capability', provider: 'capability' }
        : { allowed: true, reason: null, provider: 'capability', meta: { negated: true } };
    }
    if (assert !== 'has') {
      return { allowed: false, reason: `Unknown capability assert: ${assert}`, provider: 'capability' };
    }
    return allowed
      ? { allowed: true, reason: null, provider: 'capability' }
      : { allowed: false, reason: 'Capability denied', provider: 'capability' };
  }

  private async userHasCapability(userId: number | null, capability: string): Promise<boolean> {
    if (userId === null || userId <= 0) return false;
    const user = await this.db.one('SELECT * FROM users WHERE id=?', [userId]);
    if (!user) return false;
    const me = await this.auth.mePayload(user);
    const caps = me.capabilities as string[];
    return Boolean(me.is_super) || caps.includes('*') || caps.includes(capability);
  }

  private async userRoles(userId: number): Promise<string[]> {
    try {
      if (await this.db.tableExists('user_roles') && await this.db.tableExists('roles')) {
        const rows = await this.db.all(
          `SELECT r.slug FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`,
          [userId],
        );
        const slugs = rows.map((r) => String(r.slug).toLowerCase().trim()).filter(Boolean);
        if (slugs.length) return [...new Set(slugs)];
      }
    } catch {
      // legacy fallback
    }
    const row = await this.db.one('SELECT role FROM users WHERE id=? LIMIT 1', [userId]);
    const role = String(row?.role ?? '').toLowerCase().trim();
    return role ? [role] : [];
  }
}

export function accessRuleHash(rule: unknown): string {
  return createHash('sha256').update(JSON.stringify(rule ?? {})).digest('hex').slice(0, 16);
}
