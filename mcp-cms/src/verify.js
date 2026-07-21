/**
 * Post-deploy alive check: API + site map + DB schema + diagnostics.
 * Returns a clear ready / not-ready verdict for the agent.
 */
import { writeGate, readGate } from './gate.js';

/**
 * @param {import('./client.js').CmsClient} cms
 * @param {{ settleMs?: number }} [opts]
 * @returns {Promise<{
 *   ready: boolean,
 *   message: string,
 *   problems: string[],
 *   verify: Record<string, unknown>,
 * }>}
 */
export async function postDeployVerify(cms, opts = {}) {
  const settleMs = opts.settleMs ?? 2000;
  if (settleMs > 0) {
    await new Promise((r) => setTimeout(r, settleMs));
  }

  /** @type {string[]} */
  const problems = [];
  /** @type {Record<string, unknown>} */
  const verify = {};

  // 1) Public API health (no auth) — site not totally dead
  try {
    await cms.ensureAuth();
    const health = await cms.raw('GET', '/health', undefined, { auth: false, bypassCache: true });
    const data = health?.data ?? health;
    const status = data?.status ?? data?.data?.status;
    const apiOk = status === 'ok' || data?.api_version != null || data?.time != null;
    verify.api = {
      ok: apiOk,
      status: status || 'unknown',
      time: data?.time ?? data?.data?.time ?? null,
      api_version: data?.api_version ?? data?.data?.api_version ?? null,
    };
    if (!apiOk) problems.push('API /health не ответил status=ok');
  } catch (e) {
    verify.api = { ok: false, error: e instanceof Error ? e.message : String(e) };
    problems.push(`API /health упал: ${verify.api.error}`);
  }

  // 2) Public site bootstrap JSON
  try {
    const site = await cms.raw('GET', '/site', undefined, { auth: false, bypassCache: true });
    const data = site?.data ?? site;
    const hasTheme = Boolean(data?.theme);
    const hasSettings = Boolean(data?.site_settings);
    const hasHome = Boolean(data?.home_page);
    const siteOk = hasTheme || hasSettings || hasHome;
    verify.site = {
      ok: siteOk,
      has_theme: hasTheme,
      has_site_settings: hasSettings,
      has_home_page: hasHome,
      has_navigation: Array.isArray(data?.navigation),
      maintenance_mode: data?.site_settings?.maintenance_mode ?? null,
    };
    if (!siteOk) problems.push('Публичный /site без theme/settings/home_page — API ядро сломано');
  } catch (e) {
    verify.site = { ok: false, error: e instanceof Error ? e.message : String(e) };
    problems.push(`Публичный /site упал: ${verify.site.error}`);
  }

  // 3) HTML shell (SPA index) — shared hosting didn't wipe frontend
  try {
    const html = await cms.fetchSiteRoot({ bypassCache: true });
    const looksLikeSpa = /<div[^>]+id=["']root["']/i.test(html.body)
      || /<div[^>]+id=["']app["']/i.test(html.body)
      || /assets\//i.test(html.body);
    const okHtml = html.status >= 200 && html.status < 400 && html.body.length > 200 && looksLikeSpa;
    verify.html = {
      ok: okHtml,
      status: html.status,
      bytes: html.body.length,
      spa_shell: looksLikeSpa,
    };
    if (!okHtml) {
      problems.push(
        html.status >= 500
          ? `Корень сайта HTTP ${html.status} — возможен fatal PHP`
          : 'Корень сайта не похож на SPA (нет root/assets) — фронт мог не залиться',
      );
    }
  } catch (e) {
    verify.html = { ok: false, error: e instanceof Error ? e.message : String(e) };
    problems.push(`HTTP корень сайта: ${verify.html.error}`);
  }

  // 4) DB schema snapshot
  try {
    const res = await cms.raw('GET', '/admin/mcp/schema', undefined, { bypassCache: true });
    const data = res?.data ?? res;
    const missing = Array.isArray(data?.expected?.missing) ? data.expected.missing : [];
    const dbOk = data?.ok !== false && missing.length === 0 && (data?.table_count ?? 0) > 0;
    verify.db = {
      ok: dbOk,
      driver: data?.driver ?? null,
      table_count: data?.table_count ?? 0,
      missing,
      hint: data?.hint ?? null,
    };
    if (!dbOk) {
      problems.push(
        missing.length
          ? `БД: нет таблиц ${missing.join(', ')}`
          : 'БД: schema snapshot не ok / table_count=0',
      );
    }
  } catch (e) {
    verify.db = { ok: false, error: e instanceof Error ? e.message : String(e) };
    problems.push(`БД schema: ${verify.db.error}`);
  }

  // 5) MCP diagnostics (logs / last_error / migrations)
  try {
    const res = await cms.raw('GET', '/admin/mcp/diagnostics', undefined, { bypassCache: true });
    const data = res?.data ?? res;
    const broken = Boolean(data?.broken);
    verify.diagnostics = {
      ok: !broken,
      broken,
      summary: data?.summary ?? null,
      hints: data?.hints ?? [],
      migrations_ok: data?.migrations?.ok !== false && !data?.migrations?.blocked,
      last_error: data?.last_error
        ? { message: data.last_error.message || data.last_error.error || 'есть last-error' }
        : null,
    };
    if (broken) {
      problems.push(`Diagnostics broken: ${data?.summary || 'см. last_error'}`);
    }
    if (data?.migrations?.blocked || data?.migrations?.error) {
      problems.push(`Миграции: ${data.migrations.error || 'blocked'}`);
    }
  } catch (e) {
    verify.diagnostics = { ok: false, error: e instanceof Error ? e.message : String(e) };
    problems.push(`Diagnostics: ${verify.diagnostics.error}`);
  }

  const ready = problems.length === 0;
  const message = ready
    ? 'Готово. Сайт, API и БД в порядке — деплой не положил прод.'
    : `Не готово: ${problems.join('; ')}`;

  const gate = readGate();
  writeGate({
    ...gate,
    step: ready ? 'verified' : 'verify_failed',
    verify_ok: ready,
    last_verify: {
      at: new Date().toISOString(),
      ready,
      message,
      problems,
      verify,
    },
  });

  return { ready, message, problems, verify };
}
