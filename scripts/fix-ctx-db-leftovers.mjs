#!/usr/bin/env node
/**
 * Fix mechanical-migration leftovers: ctx.db, bare ok/fail, support gates, newsletter requireTable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixNewsletter() {
  const p = path.join(root, 'modules-src', 'newsletter', 'backend', 'node', 'domain.ts');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(
    /async function requireTable\(\s*ctx: PlatformContext,\s*c: [^,]+,\s*table: string,\s*\): Promise<Response \| null> \{[\s\S]*?return null;\s*\}/,
    `async function requireTable(
  ctx: PlatformContext,
  c: Context,
  table: string,
): Promise<Response | null> {
  if (!(await ctx.database().tableExists(table))) {
    return ctx.http().fail(c, 'capability_unavailable', 409);
  }
  return null;
}`,
  );
  // Job ownership
  if (!t.includes("jobs().registerHandler('newsletter.campaign.send'") && !t.includes('newsletter.campaign.send')) {
    t = t.replace(
      /export async function register\(ctx: PlatformContext\) \{\s*const http = ctx\.http\(\);\s*const db = ctx\.database\(\);\s*const events = ctx\.events\(\);/,
      `export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const jobs = ctx.jobs();

  jobs.registerHandler('newsletter.campaign.send', async (payload) => {
    // Package-owned campaign send — real work when campaigns table/payload present.
    if (!(await db.tableExists('newsletter_campaigns'))) return;
    const campaignId = Number(payload.campaign_id ?? payload.id ?? 0);
    if (!campaignId) return;
    const cols = await db.columns('newsletter_campaigns');
    if (cols.includes('status')) {
      await db.run(
        "UPDATE newsletter_campaigns SET status='sending', updated_at=? WHERE id=?",
        [nowSql(), campaignId],
      ).catch(() => undefined);
    }
    await events.publish('newsletter.campaign.send', { campaign_id: campaignId, ...payload });
  });`,
    );
  }
  fs.writeFileSync(p, t);
  console.log('newsletter ok');
}

function fixTranslate() {
  const p = path.join(root, 'modules-src', 'translate', 'backend', 'node', 'domain.ts');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(/ctx\.db\b/g, 'ctx.database()');
  fs.writeFileSync(p, t);
  console.log('translate ok');
}

function fixPayments() {
  const p = path.join(root, 'modules-src', 'payments', 'backend', 'node', 'domain.ts');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(/ctx\.db\b/g, 'ctx.database()');
  // bare fail/ok only when not already qualified
  t = t.replace(/(?<![\w.])fail\s*\(/g, 'ctx.http().fail(');
  t = t.replace(/(?<![\w.])ok\s*\(/g, 'ctx.http().ok(');
  t = t.replace(/ctx\.http\(\)\.ctx\.http\(\)\./g, 'ctx.http().');
  t = t.replace(
    /c: Parameters<ReturnType<PlatformContext\["http"\]>\["ok"\]>\[0\]/g,
    'c: Context',
  );
  t = t.replace(
    /function paymentsBareFail\(c: Parameters<ReturnType<PlatformContext\["http"\]>\["ok"\]>\[0\]/,
    'function paymentsBareFail(c: Context',
  );
  // local nowSql shadows import — remove local duplicate if import present
  if (t.includes('nowSql,') && /function nowSql\(\): string \{\s*return new Date/.test(t)) {
    t = t.replace(/function nowSql\(\): string \{\s*return new Date\(\)\.toISOString\(\)\.slice\(0, 19\)\.replace\('T', ' '\);\s*\}\s*/, '');
  }
  fs.writeFileSync(p, t);
  console.log('payments ok');
}

function fixSupport() {
  const p = path.join(root, 'modules-src', 'support', 'backend', 'node', 'domain.ts');
  let t = fs.readFileSync(p, 'utf8');

  // Remove AuthService-based gates (host import); use Platform permissionAny
  t = t.replace(
    /async function canSupport\(auth: AuthService, user: Row \| 'mcp', cap: string\): Promise<boolean> \{[\s\S]*?\n\}\n\nfunction agentGate\(auth: AuthService\) \{[\s\S]*?\n\}\n\nfunction manageGate\(auth: AuthService\) \{[\s\S]*?\n\}\n*/,
    '',
  );

  // Fix broken helpers import formatting + remove duplicate nowSql
  t = t.replace(
    /saveModuleSettings,\} from '\.\/sdk\/helpers\.js';/,
    "saveModuleSettings,\n} from './sdk/helpers.js';",
  );
  if (t.includes('nowSql,') && /function nowSql\(\): string \{\s*return new Date/.test(t)) {
    t = t.replace(/function nowSql\(\): string \{\s*return new Date\(\)\.toISOString\(\)\.slice\(0, 19\)\.replace\('T', ' '\);\s*\}\s*/, '');
  }

  t = t.replace(
    /const admin = http\.admin\(\);\s*const crud = ctx\.adminResources\(\);\s*void admin;\s*void crud;/,
    `const authMw = http.auth();
  const agentPerm = http.permissionAny(['support.agent', 'support.manage']);
  const managePerm = http.permission('support.manage');
  const agent = [authMw, agentPerm];
  const manage = [authMw, managePerm];
  const crud = ctx.adminResources();
  void crud;`,
  );

  fs.writeFileSync(p, t);
  console.log('support ok');
}

function fixAnalytics() {
  const p = path.join(root, 'modules-src', 'analytics', 'backend', 'node', 'domain.ts');
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes("analytics.retention") && t.includes('registerHandler')) {
    console.log('analytics jobs already present');
    return;
  }
  if (!t.includes("jobs.registerHandler('analytics.retention'")) {
    t = t.replace(
      /export async function register\(ctx: PlatformContext\) \{\s*const http = ctx\.http\(\);\s*const db = ctx\.database\(\);\s*const events = ctx\.events\(\);/,
      `export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const jobs = ctx.jobs();

  jobs.registerHandler('analytics.retention', async (payload) => {
    if (!(await db.tableExists('analytics_events'))) return;
    const days = Math.max(1, Number(payload.days ?? payload.retention_days ?? 90));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const cols = await db.columns('analytics_events');
    if (!cols.includes('created_at')) return;
    await db.run('DELETE FROM analytics_events WHERE created_at < ?', [cutoff]).catch(() => undefined);
  });

  jobs.registerHandler('analytics.aggregate', async (payload) => {
    if (!(await db.tableExists('analytics_events'))) return;
    if (!(await db.tableExists('analytics_daily_stats'))) return;
    const day = String(payload.date ?? new Date().toISOString().slice(0, 10));
    const rows = await db.all(
      "SELECT COUNT(*) AS c FROM analytics_events WHERE substr(created_at,1,10)=?",
      [day],
    ).catch(() => []);
    const count = Number(rows?.[0]?.c ?? 0);
    await db.run(
      "INSERT INTO analytics_daily_stats (stat_date, event_count) VALUES (?, ?) ON CONFLICT(stat_date) DO UPDATE SET event_count=excluded.event_count",
      [day, count],
    ).catch(() => undefined);
    await events.publish('analytics.aggregated', { date: day, event_count: count });
  });`,
    );
  }
  fs.writeFileSync(p, t);
  console.log('analytics ok');
}

function fixAutomation() {
  const p = path.join(root, 'modules-src', 'automation', 'backend', 'node', 'domain.ts');
  if (!fs.existsSync(p)) return;
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes("automation.resume") && t.includes('registerHandler')) {
    console.log('automation jobs already present');
    return;
  }
  if (!t.includes("jobs.registerHandler('automation.resume'")) {
    t = t.replace(
      /export async function register\(ctx: PlatformContext\) \{\s*const http = ctx\.http\(\);\s*const db = ctx\.database\(\);\s*const events = ctx\.events\(\);/,
      `export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const jobs = ctx.jobs();

  jobs.registerHandler('automation.resume', async (payload) => {
    await events.publish('automation.resume', { ...payload });
  });`,
    );
    fs.writeFileSync(p, t);
    console.log('automation ok');
  }
}

fixNewsletter();
fixTranslate();
fixPayments();
fixSupport();
fixAnalytics();
fixAutomation();
