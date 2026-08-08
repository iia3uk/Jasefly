#!/usr/bin/env node
/**
 * Jasefly CMS MCP — local build/test FIRST, then remote deploy.
 * Site diagnostics (logs) only via mcp_api_token.
 *
 * Env:
 *   CMS_URL + CMS_MCP_TOKEN (single) OR CMS_SITES + CMS_SITE_{ID}_URL/TOKEN
 *   CMS_REPO_ROOT (optional, default: parent of mcp-cms)
 *   Remote tools: pass site=id|alias|domain when 2+ sites configured
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { clientForSite, hostingGuardStatus, sitesOverview, RESOURCES, SINGLETONS } from './client.js';
import { sanitizeLabPayload } from './lab.js';
import {
  assertDeployAllowed,
  markChangelog,
  markDeployed,
  markPendingTelegram,
  pipelineHelp,
  readGate,
  repoRoot,
  clearGate,
  writeChangelogFile,
} from './gate.js';
import { localBuild, localTest } from './local.js';
import { loadMcpEnv } from './loadEnv.js';
import { postDeployVerify } from './verify.js';
import { deployVpsAtomic, rollbackVps, vpsStatus } from './deploy/vps.js';
import { ensureVpsTelegramGate } from './deploy/telegramGate.js';
import { resolveSite } from './sites.js';

// Secrets only from .env (or pre-set process env) — never hardcode in mcp.json
const envInfo = loadMcpEnv();

const server = new McpServer({
  name: 'jasefly-cms',
  version: '1.6.0',
});

function ok(data) {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

function fail(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `Ошибка: ${msg}` }],
    isError: true,
  };
}

/** Optional site id / alias / domain — required when 2+ sites in env. */
const siteZ = z.string().optional().describe(
  'ID, alias или домен целевого сайта (обязателен при 2+ сайтах). Список: cms_sites.',
);

/** @param {Record<string, import('zod').ZodTypeAny>} [extra] */
function siteSchema(extra = {}) {
  return { site: siteZ, ...extra };
}

/** @param {string | undefined} [site] */
function getClient(site) {
  return clientForSite(site);
}

server.tool(
  'cms_sites',
  'Список сайтов, доступных этому MCP (id, host, aliases). Без токенов. При 2+ сайтах передавайте site=… во все remote-tools (деплой, контент, модули).',
  {},
  async () => {
    try {
      const overview = sitesOverview();
      return ok({
        ...overview,
        tip: overview.count > 1
          ? 'Укажите site (id или домен) в cms_release / cms_site_map / cms_bulk и т.д. Спросите пользователя, если неясно.'
          : 'Один сайт — параметр site можно не передавать.',
      });
    } catch (e) {
      return fail(e);
    }
  },
);

// ─── Pipeline (обязательный порядок для кода) ───────────────────────────────

server.tool(
  'cms_pipeline',
  'ОБЯЗАТЕЛЬНО читай первым при деплое кода. Порядок: build → test → changelog → deploy → verify → «Готово». Или cms_release(summary, changes, site). При 2+ сайтах сначала cms_sites / уточните site.',
  {},
  async () => ok({
    repo: repoRoot(),
    env_files_loaded: envInfo.loaded,
    secrets_hint: 'CMS_URL/TOKEN или CMS_SITES + CMS_SITE_* только в mcp-cms/.env (не в чат и не в mcp.json).',
    sites: (() => { try { return sitesOverview(); } catch { return null; } })(),
    hosting: (() => {
      try { return hostingGuardStatus(); } catch { return null; }
    })(),
    preferred: 'cms_release({ summary, changes, site }) — site обязателен при 2+ сайтах.',
    ...pipelineHelp(),
  }),
);

server.tool(
  'cms_local_build',
  'ШАГ 1/5. Локальный билд. target=shared (default): FE + hosting ZIP. target=vps: Node runtime artifact. Без билда деплой запрещён.',
  {
    target: z.enum(['shared', 'vps']).optional().describe('Build target: shared (PHP ZIP) или vps (Node artifact)'),
  },
  async ({ target }) => {
    try {
      return ok(localBuild({ target: target || 'shared' }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_vps_build',
  'Сборка VPS Node artifact (alias cms_local_build target=vps).',
  {},
  async () => {
    try {
      return ok(localBuild({ target: 'vps' }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_shared_build',
  'Сборка shared PHP hosting ZIP (alias cms_local_build target=shared).',
  {},
  async () => {
    try {
      return ok(localBuild({ target: 'shared' }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_local_test',
  'ШАГ 2/5. Локальный тест: lint + проверка ZIP (spa.html, index.php, api Bootstrap). Только после cms_local_build. Дальше — cms_changelog.',
  {},
  async () => {
    try {
      return ok(localTest());
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_changelog',
  'ШАГ 3/5. ОБЯЗАТЕЛЬНО перед деплоем: нейронка пишет changelog (что изменилось). Пишет в CHANGELOG.md + на сайт в журнал MCP. Без этого cms_deploy_update не пустит.',
  siteSchema({
    summary: z.string().min(8).describe('Краткий заголовок апдейта (1 строка), напр. «Мобильный логотип + журнал MCP»'),
        changes: z.array(z.string()).optional().describe('Список пунктов изменений (буллеты)'),
        body: z.string().optional().describe('Опционально подробный markdown'),
  }),
  async ({ site, summary, changes, body }) => {
    try {
      getClient(site); // при 2+ сайтах нужен site (куда писать журнал MCP)
      const gate = readGate();
      if (!gate.build_ok || !gate.test_ok) {
        return fail(new Error('Сначала cms_local_build и cms_local_test, потом cms_changelog.'));
      }
      const entry = {
        summary: String(summary).trim(),
        changes: Array.isArray(changes) ? changes : [],
        body: body ? String(body) : '',
      };
      const file = writeChangelogFile(entry);
      const nextGate = markChangelog({ ...entry, file });

      let remote = null;
      try {
        const cms = getClient(site);
        const ch = nextGate.changelog || {};
        remote = await cms.post('/admin/mcp/changelog', {
          summary: entry.summary,
          changes: entry.changes,
          body: entry.body || null,
          package: ch.package || null,
          zip_sha256: ch.zip_sha256 || gate.zip_sha256 || null,
        });
      } catch (e) {
        remote = {
          warning: 'Локальный changelog записан, но на сайт не ушёл (нужен свежий код с /admin/mcp/changelog или токен).',
          error: e instanceof Error ? e.message : String(e),
        };
      }

      return ok({
        ok: true,
        changelog: nextGate.changelog,
        file,
        remote: remote?.data ?? remote,
        next: 'cms_deploy_update',
        gate: readGate(),
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_deploy_update',
  'ШАГ 4/5. Деплой артефакта. shared/php → ZIP SiteUpdater; node-vps → SSH atomic releases (confirm=true). Затем verify.',
  siteSchema({
    force: z.boolean().optional().describe('Обойти гейт (только ЧП)'),
    zip_path: z.string().optional().describe('Явный путь к артефакту; иначе из гейта'),
    skip_verify: z.boolean().optional().describe('Не делать пост-проверку (не рекомендуется)'),
    confirm: z.boolean().optional().describe('Обязателен для VPS SSH deploy'),
  }),
  async ({ site, force, zip_path, skip_verify, confirm }) => {
    try {
      const siteCfg = resolveSite(site);
      const gateCheck = assertDeployAllowed({ force: !!force });
      if (!gateCheck.ok) {
        return fail(new Error(`${gateCheck.reason}\nСейчас: cms_pipeline → cms_local_build → cms_local_test → cms_changelog → cms_deploy_update.`));
      }
      const zip = zip_path || String(gateCheck.gate.zip_path || '');

      if (siteCfg.runtime === 'node-vps' || siteCfg.deployment === 'vps') {
        const cms = getClient(site);
        const tg = await ensureVpsTelegramGate(cms, zip);
        if (tg.pending) {
          markPendingTelegram({ zip, deploy_id: tg.data?.deploy_id, result: tg.data });
          return ok({
            ready: false,
            pending_approval: true,
            deploy_id: tg.data?.deploy_id || null,
            message:
              'VPS deploy ждёт Approve в Telegram (или admin /admin/updates/pending/{id}/approve). '
              + 'После клика — снова cms_deploy_update(confirm=true).',
            runtime: 'node-vps',
            deployed: tg.data,
            changelog: gateCheck.gate.changelog || null,
            next: 'Approve в Telegram → cms_deploy_update(confirm=true)',
            gate: readGate(),
          });
        }
        const deployed = deployVpsAtomic(siteCfg, zip, { confirm: !!confirm });
        if (!deployed.ok) return fail(new Error(deployed.error || JSON.stringify(deployed)));
        markDeployed({ zip, result: deployed, changelog: gateCheck.gate.changelog || null, runtime: 'node-vps' });
        return ok({
          ready: Boolean(deployed.ok),
          message: 'VPS atomic deploy выполнен. Проверьте healthcheck / cms_verify_alive.',
          runtime: 'node-vps',
          telegram_gate: tg.skipped || 'redeemed',
          deployed,
          changelog: gateCheck.gate.changelog || null,
          gate: readGate(),
          next: 'cms_verify_alive',
        });
      }

      const cms = getClient(site);
      const res = await cms.uploadUpdateZip(zip);
      const data = res?.data ?? res;

      if (data?.pending_approval === true) {
        markPendingTelegram({ zip, deploy_id: data.deploy_id, result: data });
        return ok({
          ready: false,
          pending_approval: true,
          deploy_id: data.deploy_id || null,
          message:
            'Пакет на хосте, ждёт Approve в Telegram (или в админке Updates). После клика — cms_verify_alive.',
          runtime: 'php-shared',
          deployed: data,
          changelog: gateCheck.gate.changelog || null,
          next: 'cms_verify_alive после Telegram Approve',
          gate: readGate(),
        });
      }

      markDeployed({ zip, result: data, changelog: gateCheck.gate.changelog || null, runtime: 'php-shared' });

      if (skip_verify) {
        return ok({
          ready: false,
          message: 'ZIP залит, но verify пропущен (skip_verify). Вызови cms_verify_alive.',
          runtime: 'php-shared',
          deployed: data,
          changelog: gateCheck.gate.changelog || null,
          next: 'cms_verify_alive',
          gate: readGate(),
        });
      }

      const check = await postDeployVerify(cms);
      return ok({
        ready: check.ready,
        message: check.message,
        runtime: 'php-shared',
        steps: {
          build: 'ok',
          test: 'ok',
          changelog: 'ok',
          deploy: data?.ok === false ? 'fail' : 'ok',
          verify: check.ready ? 'ok' : 'fail',
        },
        deployed: data,
        changelog: gateCheck.gate.changelog || null,
        problems: check.problems,
        verify: check.verify,
        gate: readGate(),
      });
    } catch (e) {
      try {
        const cms = getClient(site);
        const check = await postDeployVerify(cms, { settleMs: 500 });
        return ok({
          ready: false,
          message: `Деплой упал. ${check.message}`,
          deploy_error: e instanceof Error ? e.message : String(e),
          problems: check.problems,
          verify: check.verify,
        });
      } catch {
        return fail(e);
      }
    }
  },
);

server.tool(
  'cms_rollback',
  'Откат VPS Node release (symlink на previous/to). Только node-vps. Требует site + confirm=true.',
  siteSchema({
    confirm: z.boolean().describe('Явное подтверждение destructive rollback'),
    to: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, 'release stamp: alphanumeric . _ - only')
      .optional()
      .describe('Имя release stamp; иначе предыдущий'),
  }),
  async ({ site, confirm, to }) => {
    try {
      const siteCfg = resolveSite(site);
      if (siteCfg.runtime !== 'node-vps' && siteCfg.deployment !== 'vps') {
        return fail(new Error('cms_rollback поддерживается только для runtime=node-vps. Shared: DB backup / ручной откат.'));
      }
      if (!confirm) return fail(new Error('Укажите confirm=true'));
      return ok(rollbackVps(siteCfg, { confirm: true, to }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_verify_alive',
  'ШАГ 5/5 (можно отдельно). Снапшот после деплоя: API /health + публичный /site + HTML корень + БД schema + diagnostics. Ответ: ready + «Готово» или список проблем.',
  siteSchema({
    settle_ms: z.number().optional().describe('Пауза перед проверкой (мс), по умолчанию 2000'),
  }),
  async ({ site, settle_ms }) => {
    try {
      const cms = getClient(site);
      if (!cms.mcpToken) {
        return fail(new Error('cms_verify_alive требует CMS_MCP_TOKEN'));
      }
      const check = await postDeployVerify(cms, { settleMs: settle_ms ?? 500 });
      return ok({
        ready: check.ready,
        message: check.message,
        problems: check.problems,
        verify: check.verify,
        gate: readGate(),
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_release',
  'Полный релиз одним вызовом: build → test → changelog → deploy → verify. При 2+ сайтах обязателен site (id/домен). Предпочтительный способ заливки кода.',
  siteSchema({
    summary: z.string().min(8).describe('Заголовок апдейта для журнала MCP'),
        changes: z.array(z.string()).optional().describe('Буллеты изменений'),
        body: z.string().optional().describe('Опционально подробный markdown'),
        force: z.boolean().optional().describe('Обойти гейт при деплое (ЧП)'),
  }),
  async ({ site, summary, changes, body, force }) => {
    /** @type {Record<string, string>} */
    const steps = { build: 'pending', test: 'pending', changelog: 'pending', deploy: 'pending', verify: 'pending' };
    try {
      const siteCfg = resolveSite(site); // fail-fast до долгого build: при 2+ сайтах нужен site
      const isVps = siteCfg.runtime === 'node-vps' || siteCfg.deployment === 'vps';
      const built = localBuild({ target: isVps ? 'vps' : 'shared' });
      if (!built.ok) {
        steps.build = 'fail';
        return ok({
          ready: false,
          message: 'Не готово: билд упал.',
          steps,
          build: built,
        });
      }
      steps.build = 'ok';

      const tested = localTest();
      if (!tested.ok) {
        steps.test = 'fail';
        return ok({
          ready: false,
          message: 'Не готово: тест упал.',
          steps,
          test: tested,
        });
      }
      steps.test = 'ok';

      const entry = {
        summary: String(summary).trim(),
        changes: Array.isArray(changes) ? changes : [],
        body: body ? String(body) : '',
      };
      const file = writeChangelogFile(entry);
      const nextGate = markChangelog({ ...entry, file });
      const cms = getClient(site);
      let remoteChangelog = null;
      try {
        const ch = nextGate.changelog || {};
        remoteChangelog = await cms.post('/admin/mcp/changelog', {
          summary: entry.summary,
          changes: entry.changes,
          body: entry.body || null,
          package: ch.package || null,
          zip_sha256: ch.zip_sha256 || nextGate.zip_sha256 || null,
        });
      } catch (e) {
        remoteChangelog = {
          warning: 'Changelog локально есть, на сайт не ушёл',
          error: e instanceof Error ? e.message : String(e),
        };
      }
      steps.changelog = 'ok';

      const gateCheck = assertDeployAllowed({ force: !!force });
      if (!gateCheck.ok) {
        steps.deploy = 'fail';
        return ok({
          ready: false,
          message: `Не готово: деплой запрещён гейтом — ${gateCheck.reason}`,
          steps,
          gate: gateCheck.gate,
        });
      }
      const zip = String(gateCheck.gate.zip_path || '');

      if (isVps) {
        const tg = await ensureVpsTelegramGate(cms, zip);
        if (tg.pending) {
          markPendingTelegram({ zip, deploy_id: tg.data?.deploy_id, result: tg.data });
          steps.deploy = 'pending_telegram';
          steps.verify = 'skipped';
          return ok({
            ready: false,
            pending_approval: true,
            deploy_id: tg.data?.deploy_id || null,
            message:
              'VPS deploy ждёт Approve в Telegram. После клика — cms_deploy_update(confirm=true) или снова cms_release.',
            runtime: 'node-vps',
            steps,
            changelog: nextGate.changelog,
            changelog_remote: remoteChangelog?.data ?? remoteChangelog,
            deployed: tg.data,
            next: 'Approve в Telegram → cms_deploy_update(confirm=true)',
            gate: readGate(),
          });
        }
        const deployed = deployVpsAtomic(siteCfg, zip, { confirm: true });
        if (!deployed.ok) {
          steps.deploy = 'fail';
          return fail(new Error(deployed.error || JSON.stringify(deployed)));
        }
        markDeployed({ zip, result: deployed, changelog: gateCheck.gate.changelog || null, runtime: 'node-vps' });
        steps.deploy = 'ok';
        const check = await postDeployVerify(cms);
        steps.verify = check.ready ? 'ok' : 'fail';
        return ok({
          ready: check.ready,
          message: check.ready
            ? 'Готово. VPS atomic deploy выполнен, сайт/API/БД живы.'
            : check.message,
          runtime: 'node-vps',
          steps,
          changelog: nextGate.changelog,
          changelog_remote: remoteChangelog?.data ?? remoteChangelog,
          deployed,
          problems: check.problems,
          verify: check.verify,
          gate: readGate(),
        });
      }

      const res = await cms.uploadUpdateZip(zip);
      const deployed = res?.data ?? res;

      if (deployed?.pending_approval === true) {
        markPendingTelegram({ zip, deploy_id: deployed.deploy_id, result: deployed });
        steps.deploy = 'pending_telegram';
        steps.verify = 'skipped';
        return ok({
          ready: false,
          pending_approval: true,
          deploy_id: deployed.deploy_id || null,
          message:
            'Пакет на хосте, ждёт Approve в Telegram (или в админке Updates). После клика — cms_verify_alive.',
          runtime: 'php-shared',
          steps,
          changelog: nextGate.changelog,
          changelog_remote: remoteChangelog?.data ?? remoteChangelog,
          deployed,
          next: 'cms_verify_alive после Telegram Approve',
          gate: readGate(),
        });
      }

      markDeployed({ zip, result: deployed, changelog: gateCheck.gate.changelog || null, runtime: 'php-shared' });
      steps.deploy = deployed?.ok === false ? 'fail' : 'ok';

      const check = await postDeployVerify(cms);
      steps.verify = check.ready ? 'ok' : 'fail';

      return ok({
        ready: check.ready,
        message: check.ready
          ? 'Готово. Релиз залит, сайт/API/БД живы.'
          : check.message,
        runtime: 'php-shared',
        steps,
        changelog: nextGate.changelog,
        changelog_remote: remoteChangelog?.data ?? remoteChangelog,
        deployed,
        problems: check.problems,
        verify: check.verify,
        gate: readGate(),
      });
    } catch (e) {
      return ok({
        ready: false,
        message: `Не готово: ${e instanceof Error ? e.message : String(e)}`,
        steps,
      });
    }
  },
);

server.tool(
  'cms_hosting_guard',
  'Лимиты shared-хостинга: пауза между запросами, max/мин, кэш GET. При multi — передайте site или получите status по всем. Не долби циклами cms_list.',
  siteSchema({
    clear_cache: z.boolean().optional().describe('Сбросить локальный GET-кэш выбранного сайта (или всех при multi без site)'),
  }),
  async ({ site, clear_cache }) => {
    try {
      if (clear_cache) {
        if (site) {
          getClient(site).guard.clearCache();
        } else {
          const overview = sitesOverview();
          for (const s of overview.sites) {
            getClient(s.id).guard.clearCache();
          }
        }
      }
      return ok(hostingGuardStatus(site));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_site_diagnostics',
  'Логи сайта (MCP-токен). Зови РЕДКО: после деплоя или если сломано. Не в цикле — результат кэшируется ~90с.',
  siteSchema(),
  async ({ site }) => {
    try {
      const cms = getClient(site);
      if (!cms.mcpToken) {
        return fail(new Error(
          'cms_site_diagnostics требует CMS_MCP_TOKEN (сайт отдаёт логи только своему MCP-агенту, не по паролю админа).',
        ));
      }
      await cms.ensureAuth();
      const res = await cms.get('/admin/mcp/diagnostics');
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_site_last_error',
  'Коротко: последняя ошибка API сайта (только MCP-токен).',
  siteSchema(),
  async ({ site }) => {
    try {
      const cms = getClient(site);
      if (!cms.mcpToken) {
        return fail(new Error('Нужен CMS_MCP_TOKEN в mcp-cms/.env'));
      }
      await cms.ensureAuth();
      const res = await cms.get('/admin/mcp/last-error');
      return ok(res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_site_map',
  'Карта сайта ОДНИМ запросом (страницы+nav+theme). При 2+ сайтах обязателен site. Зови 1 раз перед правками; GET кэшируется ~90с.',
  siteSchema(),
  async ({ site }) => {
    try {
      const cms = getClient(site);
      if (!cms.mcpToken) {
        return fail(new Error('Нужен CMS_MCP_TOKEN в mcp-cms/.env'));
      }
      await cms.ensureAuth();
      const res = await cms.get('/admin/mcp/site-map');
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_db_schema',
  'Снапшот схемы БД (только MCP-токен): какие таблицы есть, чего не хватает из модулей. После миграций/деплоя — проверить created. detail=names по умолчанию (лёгкий); detail=full или table=имя — колонки. counts=true — COUNT(*) (дорого на shared).',
  siteSchema({
    table: z.string().optional().describe('Имя одной таблицы — вернёт колонки и индексы'),
        detail: z.enum(['names', 'full']).optional().describe('names = список имён (по умолчанию); full = колонки всех таблиц'),
        counts: z.boolean().optional().describe('Добавить row_count (SELECT COUNT) — по умолчанию false'),
  }),
  async ({ site, table, detail, counts }) => {
    try {
      const cms = getClient(site);
      if (!cms.mcpToken) {
        return fail(new Error(
          'cms_db_schema требует CMS_MCP_TOKEN (схема БД только MCP-агенту, не по JWT админа).',
        ));
      }
      await cms.ensureAuth();
      const q = new URLSearchParams();
      if (table) q.set('table', table);
      if (detail) q.set('detail', detail);
      if (counts) q.set('counts', '1');
      const qs = q.toString();
      const res = await cms.get(`/admin/mcp/schema${qs ? `?${qs}` : ''}`);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_pages_digest',
  'Выжимки страниц. Если уже брал cms_site_map — обычно хватит его (pages внутри). Не долби оба подряд без нужды.',
  siteSchema(),
  async ({ site }) => {
    try {
      const cms = getClient(site);
      if (!cms.mcpToken) {
        return fail(new Error('Нужен CMS_MCP_TOKEN в mcp-cms/.env'));
      }
      await cms.ensureAuth();
      const res = await cms.get('/admin/mcp/pages-digest');
      const pages = res?.data ?? res;
      return ok({
        count: Array.isArray(pages) ? pages.length : 0,
        pages,
        how_to_edit: 'cms_page_digest(slug) → детали → cms_update resource=pages id=… data={ title, content, layout } или cms_put_singleton для theme/hero.',
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_page_digest',
  'Детальная выжимка одной страницы (id или slug): дерево layout, тексты виджетов, стили — чтобы править самостоятельно.',
  siteSchema({
    id_or_slug: z.string().describe('id страницы или slug, например privacy или __home'),
  }),
  async ({ site, id_or_slug }) => {
    try {
      const cms = getClient(site);
      if (!cms.mcpToken) {
        return fail(new Error('Нужен CMS_MCP_TOKEN в mcp-cms/.env'));
      }
      await cms.ensureAuth();
      const res = await cms.get(`/admin/mcp/pages-digest/${encodeURIComponent(id_or_slug)}`);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_gate_reset',
  'Сбросить локальный гейт build/test (если залип).',
  {},
  async () => {
    clearGate();
    return ok({ reset: true, gate: readGate() });
  },
);

// ─── Remote status / CRUD ───────────────────────────────────────────────────

server.tool(
  'cms_status',
  'Лёгкая проверка связи (1 запрос /auth/me). Без diagnostics — их зови отдельно и редко. Показывает лимиты хостинга.',
  siteSchema(),
  async ({ site }) => {
    try {
      const cms = getClient(site);
      await cms.ensureAuth();
      const me = await cms.get('/auth/me').catch(() => null);
      return ok({
        baseUrl: cms.baseUrl,
        auth: cms.mcpToken ? 'mcp_token' : 'jwt',
        repo: repoRoot(),
        hosting: cms.guard.status(),
        me: me?.data ?? me,
        tip: 'Карта сайта: cms_site_map один раз. Не крути cms_list/cms_get в цикле.',
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_list_resources',
  'CRUD-ресурсы: host hints ∪ runtime package surfaces.content_acl (не lifecycle whitelist).',
  siteSchema(),
  async ({ site }) => {
    const hints = RESOURCES;
    const discovered = [];
    try {
      const rows = (await getClient(site).get('/admin/modules'))?.data ?? [];
      for (const row of Array.isArray(rows) ? rows : []) {
        if (String(row.status ?? '') !== 'enabled') continue;
        let mf = row.manifest ?? row.manifest_json ?? null;
        if (typeof mf === 'string') {
          try {
            mf = JSON.parse(mf);
          } catch {
            mf = null;
          }
        }
        const acl = mf?.surfaces?.content_acl;
        if (!Array.isArray(acl)) continue;
        for (const item of acl) {
          const r = String(item?.resource ?? '').trim();
          if (r) discovered.push(r);
        }
      }
    } catch {
      // offline / auth — return hints only
    }
    const resources = [...new Set([...hints, ...discovered])];
    return ok({
      resources,
      singletons: SINGLETONS,
      hints,
      discovered,
      authoritative: false,
      note: 'hints + runtime surfaces; CRUD still validates via host/package routes',
    });
  },
);

server.tool(
  'cms_list',
  'Список записей ресурса. НЕ вызывай в цикле по многим ресурсам — лучше cms_site_map. Запросы троттлятся (~2с) и кэшируются.',
  siteSchema({
    resource: z.string().describe(`Один из: ${RESOURCES.join(', ')}`),
  }),
  async ({ site, resource }) => {
    try {
      const cms = getClient(site);
      const res = await cms.get(`/admin/${resource}`);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_get',
  'Получить одну запись по id.',
  siteSchema({
    resource: z.string(),
        id: z.union([z.string(), z.number()]),
  }),
  async ({ site, resource, id }) => {
    try {
      const cms = getClient(site);
      const res = await cms.get(`/admin/${resource}/${id}`);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_create',
  'Создать запись в ресурсе. data — поля таблицы (title, slug, content, status, …).',
  siteSchema({
    resource: z.string(),
        data: z.record(z.unknown()).describe('Поля новой записи'),
  }),
  async ({ site, resource, data }) => {
    try {
      const cms = getClient(site);
      const res = await cms.post(`/admin/${resource}`, data);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_update',
  'Обновить запись по id (частичные поля ок).',
  siteSchema({
    resource: z.string(),
        id: z.union([z.string(), z.number()]),
        data: z.record(z.unknown()),
  }),
  async ({ site, resource, id, data }) => {
    try {
      const cms = getClient(site);
      const res = await cms.put(`/admin/${resource}/${id}`, data);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_delete',
  'Удалить запись (soft-delete где поддерживается).',
  siteSchema({
    resource: z.string(),
        id: z.union([z.string(), z.number()]),
  }),
  async ({ site, resource, id }) => {
    try {
      const cms = getClient(site);
      const res = await cms.delete(`/admin/${resource}/${id}`);
      return ok(res?.data ?? res ?? { deleted: true });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_publish',
  'Сменить статус публикации ресурса через POST /admin/{resource}/{id}/publish (slug-agnostic; resource must expose that route).',
  siteSchema({
    resource: z.string().min(1).describe('Admin resource key, e.g. blog, projects, pages'),
    id: z.union([z.string(), z.number()]),
    status: z.enum(['published', 'draft', 'archived']).default('published'),
  }),
  async ({ site, resource, id, status }) => {
    try {
      const cms = getClient(site);
      const key = String(resource || '')
        .trim()
        .replace(/^\/+|\/+$/g, '');
      if (!key || key.includes('..') || key.includes('/') || key.includes('\\')) {
        return fail(new Error('Invalid resource'));
      }
      const res = await cms.post(`/admin/${key}/${id}/publish`, { status });
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_get_singleton',
  'Прочитать singleton-настройки: profile, hero, site-settings, seo, theme, contact-info, footer.',
  siteSchema({
    name: z.string().describe(`Один из: ${SINGLETONS.join(', ')}`),
  }),
  async ({ site, name }) => {
    try {
      const cms = getClient(site);
      const res = await cms.get(`/admin/${name}`);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_put_singleton',
  'Обновить singleton-настройки (частичный PATCH через PUT).',
  siteSchema({
    name: z.string(),
        data: z.record(z.unknown()),
  }),
  async ({ site, name, data }) => {
    try {
      const cms = getClient(site);
      const res = await cms.put(`/admin/${name}`, data);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_upload_media',
  'Загрузить локальный файл в медиатеку сайта.',
  siteSchema({
    file_path: z.string().describe('Абсолютный или относительный путь к файлу на этом ПК'),
        alt_text: z.string().optional(),
        caption: z.string().optional(),
        folder_id: z.number().optional(),
  }),
  async ({ site, file_path, alt_text, caption, folder_id }) => {
    try {
      const cms = getClient(site);
      const res = await cms.uploadMedia(file_path, { alt_text, caption, folder_id });
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_bulk',
  'Пачка create/update/delete за один tool-вызов (на хост уходит по 1 запросу с паузой). Лучше чем 20 отдельных cms_update.',
  siteSchema({
    operations: z.array(z.object({
          op: z.enum(['create', 'update', 'delete', 'put_singleton', 'publish']),
          resource: z.string().optional(),
          singleton: z.string().optional(),
          id: z.union([z.string(), z.number()]).optional(),
          data: z.record(z.unknown()).optional(),
          status: z.enum(['published', 'draft', 'archived']).optional(),
        })).max(25).describe('Макс. 25 операций за раз (защита хостинга)'),
  }),
  async ({ site, operations }) => {
    try {
      if (operations.length > 25) {
        return fail(new Error('Максимум 25 операций в cms_bulk — разбей на партии.'));
      }
      const cms = getClient(site);
      const results = [];
      for (let i = 0; i < operations.length; i++) {
        const o = operations[i];
        try {
          let res;
          if (o.op === 'create') {
            res = await cms.post(`/admin/${o.resource}`, o.data || {});
          } else if (o.op === 'update') {
            res = await cms.put(`/admin/${o.resource}/${o.id}`, o.data || {});
          } else if (o.op === 'delete') {
            res = await cms.delete(`/admin/${o.resource}/${o.id}`);
          } else if (o.op === 'put_singleton') {
            res = await cms.put(`/admin/${o.singleton || o.resource}`, o.data || {});
          } else if (o.op === 'publish') {
            res = await cms.post(`/admin/${o.resource}/${o.id}/publish`, {
              status: o.status || 'published',
            });
          }
          results.push({ index: i, ok: true, data: res?.data ?? res });
        } catch (e) {
          results.push({
            index: i,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
          // @ts-expect-error
          if (e?.code === 'HOSTING_RATE_LIMIT') break;
        }
      }
      return ok({
        total: operations.length,
        ok: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        hosting: cms.guard.status(),
        results,
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_write_content_pack',
  'Сохранить content pack JSON локально (контент, не код — гейт билда не нужен).',
  {
    pack: z.record(z.unknown()).describe('Content pack version:1'),
    file_path: z.string().optional().describe('Куда сохранить; default: content/content-pack.json'),
  },
  async ({ pack, file_path }) => {
    try {
      const body = { ...pack };
      if (!body.version) body.version = 1;
      if (!body.mode) body.mode = 'replace_content';
      const out = path.resolve(file_path || path.join(process.cwd(), 'content/content-pack.json'));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(body, null, 2), 'utf8');
      return ok({ written: out, bytes: fs.statSync(out).size });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_apply_content_pack',
  'Применить content pack на сайт (контент). Гейт билда не требуется. После ошибок зови cms_site_diagnostics.',
  siteSchema({
    pack: z.record(z.unknown()).optional().describe('Сам pack; если нет — читается file_path'),
        file_path: z.string().optional().describe('Локальный JSON pack'),
        confirm_replace: z.boolean().describe('Должно быть true для replace_content'),
  }),
  async ({ site, pack, file_path, confirm_replace }) => {
    try {
      if (!confirm_replace) {
        return fail(new Error('Передайте confirm_replace: true — иначе сервер отклонит replace.'));
      }
      let payload = pack;
      if (!payload && file_path) {
        const abs = path.resolve(file_path);
        payload = JSON.parse(fs.readFileSync(abs, 'utf8'));
      }
      if (!payload && fs.existsSync(path.resolve(process.cwd(), 'content/content-pack.json'))) {
        payload = JSON.parse(
          fs.readFileSync(path.resolve(process.cwd(), 'content/content-pack.json'), 'utf8'),
        );
      }
      if (!payload || typeof payload !== 'object') {
        return fail(new Error('Нет pack: передайте pack или file_path.'));
      }
      if (!payload.version) payload.version = 1;
      if (!payload.mode) payload.mode = 'replace_content';

      const cms = getClient(site);
      const res = await cms.post('/admin/content-pack/apply', {
        pack: payload,
        confirm_replace: true,
      });
      let diagnostics = null;
      if (cms.mcpToken) {
        try {
          const d = await cms.get('/admin/mcp/diagnostics');
          diagnostics = d?.data ?? d;
        } catch { /* optional */ }
      }
      return ok({ applied: res?.data ?? res, diagnostics });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_read_local_pack',
  'Прочитать локальный content/content-pack.json (или указанный путь).',
  {
    file_path: z.string().optional(),
  },
  async ({ file_path }) => {
    try {
      const abs = path.resolve(file_path || path.join(process.cwd(), 'content/content-pack.json'));
      if (!fs.existsSync(abs)) {
        return fail(new Error(`Файл не найден: ${abs}`));
      }
      const pack = JSON.parse(fs.readFileSync(abs, 'utf8'));
      return ok({ path: abs, pack });
    } catch (e) {
      return fail(e);
    }
  },
);

// ─── Jasefly Lab (metadata/content only; no code upload) ─────────────────────

server.tool(
  'list_lab_experiments',
  'Список экспериментов Jasefly Lab (метаданные). Код экспериментов не отдаётся.',
  siteSchema(),
  async ({ site }) => {
    try {
      const cms = getClient(site);
      const res = await cms.get('/admin/lab/experiments');
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'get_lab_experiment',
  'Получить эксперимент Lab по id (settings/content JSON, без исходников).',
  siteSchema({
    id: z.union([z.string(), z.number()]),
  }),
  async ({ site, id }) => {
    try {
      const cms = getClient(site);
      const res = await cms.get(`/admin/lab/experiments/${id}`);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'create_lab_experiment',
  'Создать эксперимент Lab. entry_key только из whitelist (GET /admin/lab/entries). Нельзя писать код.',
  siteSchema({
    data: z.record(z.unknown()).describe('name, slug, entry_key, status, is_public, noindex, render_mode, settings_json, content_json'),
  }),
  async ({ site, data }) => {
    try {
      const cms = getClient(site);
      const payload = sanitizeLabPayload(data);
      const res = await cms.post('/admin/lab/experiments', payload);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'update_lab_experiment',
  'Обновить эксперимент Lab (метаданные и JSON-контент). Без загрузки JS/PHP.',
  siteSchema({
    id: z.union([z.string(), z.number()]),
        data: z.record(z.unknown()),
  }),
  async ({ site, id, data }) => {
    try {
      const cms = getClient(site);
      const payload = sanitizeLabPayload(data);
      const res = await cms.put(`/admin/lab/experiments/${id}`, payload);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'publish_lab_experiment',
  'Активировать / отключить / архивировать эксперимент Lab.',
  siteSchema({
    id: z.union([z.string(), z.number()]),
        action: z.enum(['activate', 'disable', 'archive']).default('activate'),
  }),
  async ({ site, id, action }) => {
    try {
      const cms = getClient(site);
      const res = await cms.post(`/admin/lab/experiments/${id}/${action}`, {});
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'preview_lab_experiment',
  'Получить payload preview эксперимента Lab (для проверки content/settings).',
  siteSchema({
    id: z.union([z.string(), z.number()]),
  }),
  async ({ site, id }) => {
    try {
      const cms = getClient(site);
      const res = await cms.get(`/admin/lab/experiments/${id}/preview`);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

// ─── Module Package Manager ─────────────────────────────────────────────────

server.tool('cms_modules_list', 'Список установленных package-модулей (installed_modules).', siteSchema(),
  async ({ site }) => {
  try {
    return ok((await getClient(site).get('/admin/modules'))?.data ?? []);
  } catch (e) {
    return fail(e);
  }
});

server.tool(
  'cms_module_inspect',
  'Загрузить ZIP модуля в staging uploads и вернуть inspect plan (без установки).',
  siteSchema({
    zip_path: z.string().min(1)
  }),
  async ({ site, zip_path }) => {
    try {
      const cms = getClient(site);
      const up = await cms.uploadModuleZip(zip_path);
      const packageId = up?.data?.package_id ?? up?.package_id;
      if (!packageId) throw new Error('package_id missing from upload');
      const plan = await cms.post('/admin/modules/inspect', { package_id: packageId });
      return ok({ package_id: packageId, plan: plan?.data ?? plan });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_install',
  'Установить модуль из уже загруженного package_id. Требует confirm=true.',
  siteSchema({
    package_id: z.string().min(1),
        slug: z.string().min(1),
        confirm: z.boolean(),
        content_mode: z.enum(['merge', 'skip', 'replace']).optional(),
  }),
  async ({ site, package_id, slug, confirm, content_mode }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      const res = await getClient(site).post(`/admin/modules/${slug}/install`, {
        package_id,
        content_mode: content_mode || 'merge',
      });
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_update',
  'Обновить модуль из package_id. Требует confirm=true.',
  siteSchema({
    package_id: z.string().min(1), slug: z.string().min(1), confirm: z.boolean()
  }),
  async ({ site, package_id, slug, confirm }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      return ok((await getClient(site).post(`/admin/modules/${slug}/update`, { package_id }))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_enable',
  'Включить установленный модуль.',
  siteSchema({
    slug: z.string().min(1), confirm: z.boolean()
  }),
  async ({ site, slug, confirm }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      return ok((await getClient(site).post(`/admin/modules/${slug}/enable`, {}))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_disable',
  'Отключить модуль без удаления файлов/данных.',
  siteSchema({
    slug: z.string().min(1), confirm: z.boolean()
  }),
  async ({ site, slug, confirm }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      return ok((await getClient(site).post(`/admin/modules/${slug}/disable`, {}))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_health',
  'Health-check установленного модуля.',
  siteSchema({
    slug: z.string().min(1)
  }),
  async ({ site, slug }) => {
    try {
      return ok((await getClient(site).get(`/admin/modules/${slug}/health`))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_compatibility',
  'Compatibility Report (SDK score, forbidden imports, capabilities) для установленного модуля.',
  siteSchema({
    slug: z.string().min(1)
  }),
  async ({ site, slug }) => {
    try {
      return ok((await getClient(site).get(`/admin/modules/${slug}/compatibility`))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool('cms_sdk_report', 'Отчёт Platform SDK (версии, публичные API).', siteSchema(),
  async ({ site }) => {
  try {
    return ok((await getClient(site).get('/admin/platform/sdk'))?.data);
  } catch (e) {
    return fail(e);
  }
});

server.tool('cms_capability_report', 'Capability Registry: возможности платформы и провайдеры.', siteSchema(),
  async ({ site }) => {
  try {
    return ok((await getClient(site).get('/admin/platform/capabilities'))?.data);
  } catch (e) {
    return fail(e);
  }
});

server.tool('cms_export_sdk', 'Экспорт platform.manifest.json (локально через bin/sdk.php export-sdk).', {}, async () => {
  try {
    const { spawnSync } = await import('node:child_process');
    const php = path.join(repoRoot(), 'backend', 'bin', 'sdk.php');
    const r = spawnSync('php', [php, 'export-sdk'], { cwd: repoRoot(), encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'export-sdk failed');
    return ok({ message: r.stdout?.trim() || 'exported' });
  } catch (e) {
    return fail(e);
  }
});

async function sdkCliSpawn(args) {
  const { spawnSync } = await import('node:child_process');
  const php = path.join(repoRoot(), 'backend', 'bin', 'sdk.php');
  const r = spawnSync('php', [php, ...args], { cwd: repoRoot(), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout || '{}');
  } catch {
    parsed = { raw: r.stdout, stderr: r.stderr };
  }
  if (r.status !== 0) {
    const err = new Error(r.stderr || r.stdout || `sdk.php ${args.join(' ')} failed`);
    err.result = parsed;
    throw err;
  }
  return parsed;
}

server.tool(
  'cms_module_certify',
  'Certify module package (php bin/sdk.php certify). Path or slug under modules-src/.',
  { path_or_slug: z.string().min(1) },
  async ({ path_or_slug }) => {
    try {
      return ok(await sdkCliSpawn(['certify', path_or_slug]));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool('cms_sdk_api_diff', 'Platform SDK public API diff (php bin/sdk.php api-diff).', {}, async () => {
  try {
    return ok(await sdkCliSpawn(['api-diff']));
  } catch (e) {
    return fail(e);
  }
});

server.tool('cms_public_services', 'List public Platform SDK service catalog (list-public-services).', {}, async () => {
  try {
    return ok(await sdkCliSpawn(['list-public-services']));
  } catch (e) {
    return fail(e);
  }
});

server.tool('cms_sdk_deprecations', 'Platform SDK deprecation report (php bin/sdk.php deprecations).', {}, async () => {
  try {
    return ok(await sdkCliSpawn(['deprecations']));
  } catch (e) {
    return fail(e);
  }
});

server.tool('cms_module_operations', 'Журнал операций Module Package Manager.', siteSchema(),
  async ({ site }) => {
  try {
    return ok((await getClient(site).get('/admin/module-operations'))?.data ?? []);
  } catch (e) {
    return fail(e);
  }
});

server.tool(
  'cms_module_rollback',
  'Rollback последнего update модуля (если есть snapshot). Требует confirm=true.',
  siteSchema({
    slug: z.string().min(1), confirm: z.boolean()
  }),
  async ({ site, slug, confirm }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      return ok((await getClient(site).post(`/admin/modules/${slug}/rollback`, {}))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_release',
  'Собрать module ZIP локально (scripts/build-module.js). Не деплоит Core. upload/install → нужен site при 2+ сайтах. install=true+confirm → upload + install/update + enable.',
  siteSchema({
    module: z.string().min(1),
        version: z.string().optional(),
        upload: z.boolean().optional(),
        install: z.boolean().optional().describe('После upload: установить или обновить модуль на сайте и включить'),
        confirm: z.boolean().optional().describe('Обязателен при install=true'),
        content_mode: z.enum(['merge', 'skip', 'replace']).optional(),
  }),
  async ({ site, module, version, upload, install, confirm, content_mode }) => {
    try {
      if (install && !confirm) {
        return fail(new Error('install=true требует confirm=true'));
      }
      const doUpload = !!(upload || install);
      const { spawnSync } = await import('node:child_process');
      const args = [path.join(repoRoot(), 'scripts/build-module.js'), module, '--yes'];
      if (version) args.push(`--version=${version}`);
      const r = spawnSync(process.execPath, args, { cwd: repoRoot(), encoding: 'utf8' });
      if (r.status !== 0) {
        throw new Error(r.stderr || r.stdout || 'build-module failed');
      }
      const outDir = path.join(repoRoot(), 'release', 'modules');
      // Exact slug match: "forms" must not pick "forms-sdk-reference".
      const esc = String(module).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const zipRe = new RegExp(`^jasefly-module-${esc}-\\d+\\.\\d+\\.\\d+\\.zip$`);
      const zips = fs.existsSync(outDir)
        ? fs.readdirSync(outDir).filter((f) => zipRe.test(f))
        : [];
      zips.sort();
      const zipPath = zips.length ? path.join(outDir, zips[zips.length - 1]) : null;
      let remote = null;
      if (doUpload && zipPath) {
        const cms = getClient(site);
        const up = await cms.uploadModuleZip(zipPath);
        const packageId = up?.data?.package_id ?? up?.package_id;
        const plan = packageId
          ? await cms.post('/admin/modules/inspect', { package_id: packageId })
          : null;
        remote = { package_id: packageId, plan: plan?.data ?? plan };

        if (install && packageId) {
          const listRes = await cms.get('/admin/modules');
          const rows = unwrapModuleList(listRes?.data ?? listRes);
          const existing = rows.find((row) => String(row.slug || '') === module);
          let lifecycle = null;
          if (existing) {
            const upd = await cms.post(`/admin/modules/${module}/update`, { package_id: packageId });
            lifecycle = upd?.data ?? upd;
            remote.operation = 'update';
          } else {
            const ins = await cms.post(`/admin/modules/${module}/install`, {
              package_id: packageId,
              content_mode: content_mode || 'merge',
            });
            lifecycle = ins?.data ?? ins;
            remote.operation = 'install';
          }
          remote.lifecycle = lifecycle;
          try {
            remote.enable = (await cms.post(`/admin/modules/${module}/enable`, {}))?.data ?? { ok: true };
          } catch (e) {
            remote.enable = { warning: e instanceof Error ? e.message : String(e) };
          }
        }
      }
      return ok({ built: zipPath, stdout: r.stdout, remote });
    } catch (e) {
      return fail(e);
    }
  },
);

/** @param {unknown} data */
function unwrapModuleList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.modules)) return obj.modules;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

function normalizeAdminPath(raw) {
  let p = String(raw || '').trim();
  if (!p) throw new Error('path required');
  if (/^https?:\/\//i.test(p)) throw new Error('Только относительный путь /admin/…, не абсолютный URL');
  if (!p.startsWith('/')) p = `/${p}`;
  // Allow /api/v1/admin/... → /admin/...
  p = p.replace(/^\/api\/v\d+/i, '');
  if (!p.startsWith('/admin/') && p !== '/admin') {
    throw new Error('Разрешены только пути под /admin/');
  }
  if (p.includes('..') || p.includes('\\')) {
    throw new Error('Небезопасный path');
  }
  return p;
}

// ─── Plugins (bundled + mirrored package modules) ───────────────────────────

server.tool(
  'cms_plugins_list',
  'Каталог плагинов/модулей сайта (GET /admin/plugins): name, enabled, settings schema, missing deps. До выключения/включения — cms_plugin_toggle.',
  siteSchema({
    enabled_only: z.boolean().optional().describe('Вернуть только включённые'),
  }),
  async ({ site, enabled_only }) => {
    try {
      const res = await getClient(site).get('/admin/plugins');
      let list = res?.data ?? res;
      if (!Array.isArray(list)) list = [];
      if (enabled_only) {
        list = list.filter((p) => p && (p.is_enabled === true || p.enabled === true));
      }
      const summary = list.map((p) => ({
        name: p.name ?? p.slug ?? null,
        label: p.label ?? p.title ?? null,
        is_enabled: !!(p.is_enabled ?? p.enabled),
        source: p.source ?? null,
        group: p.group ?? null,
        missing_requires: p.missing_requires ?? [],
      }));
      return ok({ count: list.length, plugins: summary, raw: list });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_plugin_toggle',
  'Включить/выключить плагин (POST /admin/plugins/{name}/toggle). Ядро system/users отключить нельзя. Требует confirm=true.',
  siteSchema({
    name: z.string().min(1).describe('slug плагина, напр. portfolio, translate, overload'),
        enabled: z.boolean(),
        confirm: z.boolean(),
        auto_enable_deps: z.boolean().optional().describe('Авто-включить зависимости (default true)'),
  }),
  async ({ site, name, enabled, confirm, auto_enable_deps }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      const res = await getClient(site).post(`/admin/plugins/${encodeURIComponent(name)}/toggle`, {
        enabled: !!enabled,
        auto_enable_deps: auto_enable_deps !== false,
      });
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

// ─── Generic authenticated admin API (package modules, settings, …) ─────────

server.tool(
  'cms_admin_request',
  'Произвольный авторизованный запрос к /admin/* (модули IndexNow/Optimizer, settings плагинов, health). Мутации (POST/PUT/PATCH/DELETE) требуют confirm=true. Не для публичных URL.',
  siteSchema({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
        path: z.string().min(1).describe('Относительный путь, напр. /admin/indexnow/setup или /admin/plugins/translate/settings'),
        body: z.record(z.unknown()).optional().describe('JSON body для POST/PUT/PATCH'),
        confirm: z.boolean().optional().describe('Обязателен для не-GET'),
  }),
  async ({ site, method, path: adminPath, body, confirm }) => {
    try {
      const m = String(method || 'GET').toUpperCase();
      if (m !== 'GET' && !confirm) {
        return fail(new Error(`${m} требует confirm=true`));
      }
      const p = normalizeAdminPath(adminPath);
      const cms = getClient(site);
      let res;
      if (m === 'GET') res = await cms.get(p);
      else if (m === 'POST') res = await cms.post(p, body ?? {});
      else if (m === 'PUT') res = await cms.put(p, body ?? {});
      else if (m === 'DELETE') res = await cms.delete(p);
      else if (m === 'PATCH') {
        // CmsClient has no patch — use raw
        await cms.ensureAuth();
        res = await cms.raw('PATCH', p, body ?? {});
      } else {
        return fail(new Error(`Unsupported method ${m}`));
      }
      return ok({ method: m, path: p, data: res?.data ?? res });
    } catch (e) {
      return fail(e);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('portfolio-mcp-cms: ready — pipeline: build → test → changelog → deploy → verify → Готово (или cms_release)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
