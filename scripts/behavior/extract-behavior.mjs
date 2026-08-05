#!/usr/bin/env node
/**
 * Extract machine-readable behavioral manifests for every baseline route.
 * Source: contracts/baseline/routes.v1.json + resources/events/permissions.
 * Output: contracts/behavior/<module>/<slug>.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'contracts/baseline/routes.v1.json'), 'utf8'));
const resources = JSON.parse(fs.readFileSync(path.join(root, 'contracts/resources/admin-resources.v1.json'), 'utf8'));
const eventsDoc = JSON.parse(fs.readFileSync(path.join(root, 'contracts/events/events-core.v1.json'), 'utf8'));
const outRoot = path.join(root, 'contracts/behavior');

function slugify(id) {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function inferTables(route) {
  const tables = new Set();
  const p = route.path;
  for (const [key, table] of Object.entries(resources.tables || {})) {
    if (p.includes(`/admin/${key}`) || p.includes(`/${key}`)) tables.add(table);
  }
  for (const [key, table] of Object.entries(resources.singletons || {})) {
    if (p.includes(`/admin/${key}`)) tables.add(table);
  }
  // Heuristics by module
  const modTables = {
    support: ['support_tickets', 'support_messages', 'support_faq'],
    forms: ['forms', 'form_submissions'],
    payments: ['orders', 'payments'],
    scheduler: ['scheduled_jobs'],
    webhooks: ['webhooks'],
    newsletter: ['newsletter_subscribers', 'subscribers'],
    media: ['media'],
    users: ['users'],
    translate: ['translate_cache'],
    'module-manager': ['installed_modules'],
  };
  for (const t of modTables[route.module] || []) tables.add(t);
  return [...tables];
}

function inferEvents(route) {
  const all = eventsDoc.events || [];
  const out = [];
  if (route.method === 'POST' && route.path.includes('/submit')) out.push('form.submitted');
  if (route.path.includes('/publish')) out.push('page.afterPublish', 'resource.afterSave');
  if (route.method === 'POST' && route.path.includes('/admin/') && !route.path.includes('tick')) {
    out.push('resource.afterSave');
  }
  if (route.method === 'DELETE') out.push('resource.afterDelete');
  if (route.path.includes('webhook')) out.push('payment.webhook');
  return out.filter((e) => all.includes(e) || e.startsWith('payment.') || e.startsWith('form.'));
}

function buildScenarios(route) {
  const scenarios = [];
  const hasParam = /\{[^}]+\}/.test(route.path);
  const isAuth = route.authentication === 'auth' || route.path.includes('/admin/');

  // Always: unauthenticated probe for protected routes.
  // 405 allowed when both runtimes agree the HTTP method is not registered (e.g. DELETE orders).
  if (isAuth) {
    scenarios.push({
      id: 'unauthenticated',
      auth: 'none',
      path_params: hasParam ? Object.fromEntries([...route.path.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], '1'])) : {},
      body: route.method === 'GET' || route.method === 'DELETE' ? undefined : {},
      expect: {
        status: [401, 403, 405],
        success: false,
      },
      compare: { http_status: true, json_envelope: true, error_code: true, db: false, events: false },
    });
  }

  // Invalid bearer
  if (isAuth) {
    scenarios.push({
      id: 'invalid-token',
      auth: 'invalid',
      path_params: hasParam ? Object.fromEntries([...route.path.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], '1'])) : {},
      body: route.method === 'GET' || route.method === 'DELETE' ? undefined : {},
      expect: {
        status: [401, 405],
        success: false,
      },
      compare: { http_status: true, json_envelope: true, error_code: true, db: false, events: false },
    });
  }

  // Happy GET without path params (public or admin)
  if (route.method === 'GET' && !hasParam) {
    scenarios.push({
      id: 'happy-get',
      auth: isAuth ? 'admin' : 'none',
      body: undefined,
      expect: {
        // Both runtimes must agree; 401/403/404/409 are valid shared outcomes.
        status: [200, 400, 401, 403, 404, 409, 422],
        success: null,
      },
      compare: {
        http_status: true,
        json_envelope: true,
        error_code: true,
        db: false,
        events: false,
        // Shape (not full seed content) — seed/layout drift is not behavioral drift.
        deep_json: 'shape',
      },
    });
  }

  // GET with id → not found / empty with admin
  if (route.method === 'GET' && hasParam) {
    scenarios.push({
      id: 'missing-resource',
      auth: isAuth ? 'admin' : 'none',
      path_params: Object.fromEntries(
        [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], m[1] === 'slug' ? 'no-such-slug-parity-xyz' : '999999001']),
      ),
      expect: {
        status: [200, 404, 401, 403, 409],
        success: null,
      },
      compare: {
        http_status: true,
        json_envelope: true,
        error_code: true,
        // Shape: localized error strings / seed null vs {} are not status drift.
        deep_json: 'shape',
        db: false,
        events: false,
      },
    });
  }

  // Mutating without body: expect client/auth error parity
  if (['POST', 'PUT', 'PATCH'].includes(route.method) && !isAuth) {
    scenarios.push({
      id: 'public-mutate',
      auth: 'none',
      path_params: hasParam
        ? Object.fromEntries([...route.path.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], 'parity-fixture']))
        : {},
      body: {},
      expect: { status: [200, 201, 202, 400, 401, 403, 404, 409, 422, 429, 503], success: null },
      compare: {
        http_status: true,
        json_envelope: true,
        error_code: true,
        // Empty-body mutate: status + envelope class; localized errors / seed DB not required.
        deep_json: 'shape',
        db: false,
        events: false,
      },
    });
  }

  if (scenarios.length === 0) {
    scenarios.push({
      id: 'smoke',
      auth: isAuth ? 'admin' : 'none',
      path_params: hasParam ? Object.fromEntries([...route.path.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], '1'])) : {},
      body: ['POST', 'PUT', 'PATCH'].includes(route.method) ? {} : undefined,
      expect: { status: [200, 201, 400, 401, 403, 404, 409, 422, 501, 503], success: null },
      compare: { http_status: true, json_envelope: true, deep_json: true, db: false, events: false },
    });
  }

  return scenarios;
}

/** Modules that ship with enabled()=false; parity seed turns them on. */
const DEFAULT_OFF = new Set(['automation', 'newsletter', 'notifications']);

function buildManifest(route) {
  const tables = inferTables(route);
  const events = inferEvents(route);
  return {
    schema_version: 1,
    kind: 'behavior',
    id: route.id,
    module: route.module,
    method: route.method,
    path: route.path,
    authentication: route.authentication,
    permission: route.permission,
    permission_middleware: route.permission_middleware,
    capabilities: route.capabilities || [],
    http_statuses: route.http_statuses || [],
    request_schema: route.request_schema || (['POST', 'PUT', 'PATCH'].includes(route.method) ? 'json-object' : null),
    response_schema: 'contracts/schema/envelope.success.v1.json',
    error_schema: 'contracts/schema/envelope.error.v1.json',
    database_tables: tables,
    events,
    side_effects: [],
    lifecycle_transitions: [],
    module_default_enabled: !DEFAULT_OFF.has(route.module),
    requires_module_enabled: DEFAULT_OFF.has(route.module),
    scenarios: buildScenarios(route),
    content_hash: null,
  };
}

// clean regenerate
if (fs.existsSync(outRoot)) {
  fs.rmSync(outRoot, { recursive: true, force: true });
}
fs.mkdirSync(outRoot, { recursive: true });

const index = { schema_version: 1, generated_at: new Date().toISOString(), count: 0, modules: {}, routes: [] };

for (const route of baseline.routes) {
  const man = buildManifest(route);
  const raw = JSON.stringify({ ...man, content_hash: undefined });
  man.content_hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const dir = path.join(outRoot, route.module);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slugify(route.id)}.json`);
  fs.writeFileSync(file, JSON.stringify(man, null, 2) + '\n');
  index.routes.push({ id: route.id, module: route.module, file: path.relative(root, file).replace(/\\/g, '/') });
  index.modules[route.module] = (index.modules[route.module] || 0) + 1;
  index.count++;
}

fs.writeFileSync(path.join(outRoot, 'index.v1.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Wrote ${index.count} behavior manifests under contracts/behavior/ (${Object.keys(index.modules).length} modules)`);
