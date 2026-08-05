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

/** PHP AclCapabilityCatalog::registerCoreDefaults() */
const ACL_CORE_CAPABILITIES: Array<{
  slug: string;
  label: string;
  group: string;
  risk: string;
  scope_default?: string;
}> = [
  { slug: 'dashboard.view', label: 'View dashboard', group: 'dashboard', risk: 'low' },
  { slug: 'content.view', label: 'View content', group: 'content', risk: 'low' },
  { slug: 'content.create', label: 'Create content', group: 'content', risk: 'low' },
  { slug: 'content.update', label: 'Update content (legacy)', group: 'content', risk: 'medium' },
  { slug: 'content.edit_own', label: 'Edit own content', group: 'content', risk: 'low', scope_default: 'own' },
  { slug: 'content.edit_any', label: 'Edit any content', group: 'content', risk: 'medium', scope_default: 'any' },
  { slug: 'content.delete', label: 'Delete content (legacy)', group: 'content', risk: 'high' },
  { slug: 'content.delete_own', label: 'Delete own content', group: 'content', risk: 'medium', scope_default: 'own' },
  { slug: 'content.delete_any', label: 'Delete any content', group: 'content', risk: 'high', scope_default: 'any' },
  { slug: 'content.publish', label: 'Publish content', group: 'content', risk: 'medium' },
  { slug: 'content.publish_own', label: 'Publish own content', group: 'content', risk: 'medium', scope_default: 'own' },
  { slug: 'content.restore', label: 'Restore content', group: 'content', risk: 'medium' },
  { slug: 'content.force_delete', label: 'Force delete', group: 'content', risk: 'critical' },
  { slug: 'media.manage', label: 'Manage media', group: 'media', risk: 'medium' },
  { slug: 'builder.use', label: 'Use builder', group: 'builder', risk: 'medium' },
  { slug: 'builder.publish', label: 'Publish from builder', group: 'builder', risk: 'high' },
  { slug: 'pages.manage', label: 'Manage pages', group: 'pages', risk: 'medium' },
  { slug: 'navigation.manage', label: 'Manage navigation', group: 'navigation', risk: 'medium' },
  { slug: 'users.manage', label: 'Manage users (legacy)', group: 'users', risk: 'critical' },
  { slug: 'users.view', label: 'View users', group: 'users', risk: 'medium' },
  { slug: 'users.create', label: 'Create users', group: 'users', risk: 'high' },
  { slug: 'users.edit', label: 'Edit users', group: 'users', risk: 'high' },
  { slug: 'users.delete', label: 'Delete users', group: 'users', risk: 'critical' },
  { slug: 'roles.manage', label: 'Manage roles', group: 'roles', risk: 'critical', scope_default: 'platform' },
  { slug: 'access.manage', label: 'Manage access', group: 'access', risk: 'critical', scope_default: 'platform' },
  { slug: 'settings.manage', label: 'Manage settings', group: 'settings', risk: 'high' },
  { slug: 'settings.view', label: 'View settings', group: 'settings', risk: 'low' },
  { slug: 'seo.manage', label: 'Manage SEO', group: 'seo', risk: 'medium' },
  { slug: 'system.manage', label: 'System manage (legacy)', group: 'system', risk: 'critical', scope_default: 'platform' },
  { slug: 'system.diagnostics', label: 'Diagnostics', group: 'system', risk: 'high', scope_default: 'platform' },
  { slug: 'system.logs', label: 'System logs', group: 'system', risk: 'medium', scope_default: 'platform' },
  { slug: 'system.updates', label: 'System updates', group: 'system', risk: 'critical', scope_default: 'platform' },
  { slug: 'system.security', label: 'System security', group: 'system', risk: 'critical', scope_default: 'platform' },
  { slug: 'modules.view', label: 'View modules', group: 'modules', risk: 'medium', scope_default: 'platform' },
  { slug: 'modules.install', label: 'Install modules', group: 'modules', risk: 'critical', scope_default: 'platform' },
  { slug: 'modules.enable', label: 'Enable modules', group: 'modules', risk: 'high', scope_default: 'platform' },
  { slug: 'modules.update', label: 'Update modules', group: 'modules', risk: 'critical', scope_default: 'platform' },
  { slug: 'modules.delete', label: 'Delete modules', group: 'modules', risk: 'critical', scope_default: 'platform' },
  { slug: 'plugins.manage', label: 'Manage plugins', group: 'plugins', risk: 'high', scope_default: 'platform' },
  { slug: 'mcp.manage', label: 'Manage MCP', group: 'mcp', risk: 'critical', scope_default: 'platform' },
  { slug: 'deploy.execute', label: 'Execute deploy', group: 'deploy', risk: 'critical', scope_default: 'platform' },
  { slug: 'activity.view', label: 'View activity', group: 'system', risk: 'low' },
  { slug: 'commerce.manage', label: 'Manage commerce', group: 'commerce', risk: 'high' },
  { slug: 'orders.view', label: 'View orders', group: 'orders', risk: 'medium' },
  { slug: 'orders.manage', label: 'Manage orders', group: 'orders', risk: 'high' },
  { slug: 'integrations.manage', label: 'Manage integrations', group: 'integrations', risk: 'high' },
];

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
    const list: ProviderMeta[] = [
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
            params: [{ key: 'roles', label: 'Роли', type: 'string_list', placeholder: 'member, admin' }],
          },
          {
            id: 'not_in',
            label: 'Не эти роли',
            params: [{ key: 'roles', label: 'Роли', type: 'string_list' }],
          },
        ],
      },
      {
        id: 'purchase',
        label: 'Покупка',
        available: true,
        asserts: [
          {
            id: 'owns',
            label: 'Купленный товар',
            params: [
              { key: 'product_id', label: 'ID товара', type: 'number' },
              { key: 'service_id', label: 'ID услуги (опц.)', type: 'number' },
            ],
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
            params: [
              { key: 'capability', label: 'Capability', type: 'text', placeholder: 'content.publish' },
              { key: 'scope', label: 'Scope', type: 'text', placeholder: 'site|own|any|platform' },
              { key: 'resource_owner_id', label: 'Owner user id', type: 'number' },
            ],
          },
          {
            id: 'missing',
            label: 'Не имеет capability',
            params: [{ key: 'capability', label: 'Capability', type: 'text' }],
          },
        ],
      },
    ];
    return list.sort((a, b) => a.id.localeCompare(b.id));
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

  async allCapabilitySlugs(): Promise<string[]> {
    // Prefer live permissions table (PHP AclCapabilityCatalog sync) — exact set for version hash.
    if (await this.db.tableExists('permissions')) {
      const rows = await this.db.all('SELECT slug FROM permissions ORDER BY slug');
      const fromDb = rows.map((r) => String(r.slug ?? '').trim()).filter(Boolean);
      if (fromDb.length > 0) return [...new Set(fromDb)].sort();
    }
    return [
      'access.manage', 'activity.view', 'analytics.manage', 'analytics.view',
      'automations.manage', 'automations.run', 'automations.view',
      'builder.publish', 'builder.use', 'comments.manage', 'comments.moderate', 'comments.view',
      'commerce.manage', 'content.create', 'content.delete', 'content.delete_any', 'content.delete_own',
      'content.edit_any', 'content.edit_own', 'content.force_delete', 'content.publish', 'content.publish_own',
      'content.restore', 'content.update', 'content.view', 'dashboard.view', 'deploy.execute',
      'forms.export', 'forms.manage', 'forms.submissions.manage', 'forms.submissions.view', 'forms.view',
      'integrations.manage', 'lab.create', 'lab.delete', 'lab.manage', 'lab.preview', 'lab.publish',
      'lab.update', 'lab.view', 'mail.manage', 'mcp.manage', 'media.delete', 'media.manage', 'media.view',
      'modules.install', 'modules.manage', 'modules.view', 'newsletter.manage', 'newsletter.view',
      'notifications.manage', 'notifications.view', 'orders.manage', 'orders.view',
      'payments.manage', 'payments.view', 'products.manage', 'products.view',
      'projects.manage', 'projects.view', 'roles.manage', 'scheduler.manage', 'scheduler.run',
      'seo.manage', 'settings.manage', 'support.manage', 'support.reply', 'system.manage',
      'system.updates', 'translate.manage', 'users.create', 'users.delete', 'users.edit', 'users.view',
      'webhooks.manage',
    ].sort();
  }

  private capsVersion(caps: string[], isSuper: boolean): string {
    return createHash('sha256')
      .update(`${caps.join(',')}|${isSuper ? '1' : '0'}`)
      .digest('hex')
      .slice(0, 16);
  }

  async bootstrapPayload(user: Row | 'mcp') {
    if (user === 'mcp') {
      const caps = await this.allCapabilitySlugs();
      return {
        capabilities: caps,
        roles: ['super_admin'],
        is_super: true,
        version: this.capsVersion(caps, true),
        nav: [],
        catalog: await this.capabilityCatalog(),
      };
    }
    const bundle = await this.resolveEffective(Number(user.id));
    return {
      capabilities: bundle.caps,
      roles: bundle.roles,
      is_super: bundle.is_super,
      version: bundle.version,
      nav: [],
      catalog: await this.capabilityCatalog(),
    };
  }

  /** PHP AclEffectiveResolver::resolve — no AuthService.mePayload recursion. */
  async resolveEffective(userId: number): Promise<{
    caps: string[];
    is_super: boolean;
    roles: string[];
    version: string;
  }> {
    if (!userId || userId <= 0) {
      return { caps: [], is_super: false, roles: [], version: '0' };
    }
    const roles = await this.userRoleSlugs(userId);
    const isSuper = await this.userIsSuper(userId, roles);
    let fromRoles = isSuper ? await this.allCapabilitySlugs() : await this.capabilitiesForRoles(roles);
    const set = new Set(fromRoles);
    // Legacy bundles (PHP AclEffectiveResolver)
    if (set.has('users.manage')) {
      for (const u of ['users.view', 'users.create', 'users.edit', 'users.delete', 'roles.manage', 'access.manage']) {
        set.add(u);
      }
    }
    if (set.has('system.manage')) {
      for (const s of [
        'system.diagnostics', 'system.logs', 'system.updates', 'system.security', 'plugins.manage',
        'mcp.manage', 'modules.view', 'modules.install', 'modules.enable', 'modules.update', 'modules.delete',
        'deploy.execute',
      ]) {
        set.add(s);
      }
    }
    if (set.has('content.update')) set.add('content.edit_any');
    if (set.has('content.edit_any')) set.add('content.update');
    if (set.has('content.delete')) set.add('content.delete_any');
    if (set.has('content.delete_any')) set.add('content.delete');

    const caps = [...set].sort();
    return {
      caps,
      is_super: isSuper,
      roles,
      version: this.capsVersion(caps, isSuper),
    };
  }

  async effectiveBundle(userId: number, _user?: Row | null) {
    return this.resolveEffective(userId);
  }

  private async userRoleSlugs(userId: number): Promise<string[]> {
    try {
      if ((await this.db.tableExists('user_roles')) && (await this.db.tableExists('roles'))) {
        const rows = await this.db.all(
          `SELECT r.slug FROM user_roles ur
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = ?
           ORDER BY r.role_rank ASC, r.id ASC`,
          [userId],
        );
        const slugs = [...new Set(rows.map((r) => String(r.slug ?? '').trim()).filter(Boolean))];
        if (slugs.length) return slugs;
      }
    } catch {
      /* legacy */
    }
    const row = await this.db.one('SELECT role FROM users WHERE id=? LIMIT 1', [userId]);
    const role = String(row?.role ?? '').trim();
    return role ? [role] : [];
  }

  private async userIsSuper(userId: number, roles: string[]): Promise<boolean> {
    if (roles.includes('super_admin')) return true;
    try {
      if ((await this.db.tableExists('user_roles')) && (await this.db.tableExists('roles'))) {
        const row = await this.db.one(
          `SELECT 1 AS ok FROM user_roles ur
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = ? AND r.is_super = 1 LIMIT 1`,
          [userId],
        );
        if (row) return true;
      }
    } catch {
      /* ignore */
    }
    return roles.includes('super_admin');
  }

  private async capabilitiesForRoles(roles: string[]): Promise<string[]> {
    if (!roles.length) return [];
    if (!(await this.db.tableExists('permissions')) || !(await this.db.tableExists('role_permissions'))) {
      return [];
    }
    const placeholders = roles.map(() => '?').join(',');
    try {
      const rows = await this.db.all(
        `SELECT DISTINCT p.slug FROM permissions p
         INNER JOIN role_permissions rp ON rp.permission_id = p.id
         INNER JOIN roles r ON r.id = rp.role_id
         WHERE r.slug IN (${placeholders})`,
        roles,
      );
      return rows.map((r) => String(r.slug)).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * PHP AclCapabilityCatalog::list() —
   * core defaults (empty description, source=core) win; DB only fills unknown slugs.
   */
  async capabilityCatalog(): Promise<Array<Record<string, unknown>>> {
    const bySlug = new Map<string, Record<string, unknown>>();
    for (const d of ACL_CORE_CAPABILITIES) {
      bySlug.set(d.slug, {
        slug: d.slug,
        label: d.label,
        description: '',
        group: d.group,
        risk: d.risk,
        scope_default: d.scope_default ?? 'site',
        default_roles: [] as string[],
        source: 'core',
      });
    }
    if (await this.db.tableExists('permissions')) {
      try {
        let rows: Array<Record<string, unknown>> = [];
        try {
          rows = await this.db.all(
            'SELECT slug, name, group_name, description, risk_level, scope_default FROM permissions WHERE is_active = 1',
          );
        } catch {
          rows = await this.db.all(
            'SELECT slug, name, group_name, description, risk_level, scope_default FROM permissions',
          );
        }
        for (const r of rows) {
          const slug = String(r.slug ?? '');
          if (!slug || bySlug.has(slug)) continue;
          bySlug.set(slug, {
            slug,
            label: String(r.name ?? slug),
            description: String(r.description ?? ''),
            group: String(r.group_name ?? 'other'),
            risk: String(r.risk_level ?? 'low'),
            scope_default: String(r.scope_default ?? 'site'),
            default_roles: [] as string[],
            source: 'db',
          });
        }
      } catch {
        /* runtime only */
      }
    }
    return [...bySlug.values()].sort((a, b) => {
      const as = String(a.slug);
      const bs = String(b.slug);
      return as < bs ? -1 : as > bs ? 1 : 0;
    });
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
    if (providerId === 'purchase') return this.evalPurchase(userId, assert, params);
    return { allowed: false, reason: `Unknown provider: ${providerId}`, provider: providerId };
  }

  private async evalPurchase(
    userId: number | null,
    assert: string,
    params: Record<string, unknown>,
  ): Promise<AccessDecision> {
    if (assert !== 'owns') {
      return { allowed: false, reason: `Unknown purchase assert: ${assert}`, provider: 'purchase' };
    }
    if (userId === null || userId <= 0) {
      return { allowed: false, reason: 'Authentication required', provider: 'purchase' };
    }
    const productId = Number(params.product_id ?? 0);
    const serviceId = Number(params.service_id ?? 0);
    if (productId <= 0 && serviceId <= 0) {
      return { allowed: false, reason: 'product_id or service_id required', provider: 'purchase' };
    }
    if (!(await this.db.tableExists('orders')) || !(await this.db.tableExists('order_items'))) {
      return { allowed: false, reason: 'Purchase check failed', provider: 'purchase' };
    }
    const user = await this.db.one('SELECT email FROM users WHERE id=? LIMIT 1', [userId]);
    const email = String(user?.email ?? '').trim();
    if (productId > 0) {
      const row = await this.db.one(
        `SELECT oi.id FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id=? AND o.payment_status='paid'
           AND (o.user_id=?${email ? ' OR o.email=? OR o.customer_email=?' : ''})
         LIMIT 1`,
        email ? [productId, userId, email, email] : [productId, userId],
      );
      if (row) return { allowed: true, reason: null, provider: 'purchase', meta: { product_id: productId } };
    }
    return { allowed: false, reason: 'Purchase not found', provider: 'purchase' };
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
    const bundle = await this.resolveEffective(userId);
    return bundle.is_super || bundle.caps.includes(capability);
  }

  private async userRoles(userId: number): Promise<string[]> {
    return this.userRoleSlugs(userId);
  }
}

export function accessRuleHash(rule: unknown): string {
  return createHash('sha256').update(JSON.stringify(rule ?? {})).digest('hex').slice(0, 16);
}
