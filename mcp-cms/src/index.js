#!/usr/bin/env node
/**
 * Jasefly CMS MCP — local build/test FIRST, then remote deploy.
 * Site diagnostics (logs) only via mcp_api_token.
 *
 * Env:
 *   CMS_URL, CMS_MCP_TOKEN
 *   CMS_REPO_ROOT (optional, default: parent of mcp-cms)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { clientFromEnv, RESOURCES, SINGLETONS } from './client.js';
import { sanitizeLabPayload } from './lab.js';
import {
  assertDeployAllowed,
  markChangelog,
  markDeployed,
  pipelineHelp,
  readGate,
  repoRoot,
  clearGate,
  writeChangelogFile,
} from './gate.js';
import { localBuild, localTest } from './local.js';
import { loadMcpEnv } from './loadEnv.js';
import { postDeployVerify } from './verify.js';

// Secrets only from .env (or pre-set process env) — never hardcode in mcp.json
const envInfo = loadMcpEnv();

const server = new McpServer({
  name: 'jasefly-cms',
  version: '1.4.0',
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

function getClient() {
  return clientFromEnv();
}

// ─── Pipeline (обязательный порядок для кода) ───────────────────────────────

server.tool(
  'cms_pipeline',
  'ОБЯЗАТЕЛЬНО читай первым при деплое кода. Порядок: build → test → changelog → deploy → verify (сайт+БД+API) → «Готово». Или одним вызовом cms_release(summary, changes). Без changelog заливка запрещена.',
  {},
  async () => ok({
    repo: repoRoot(),
    env_files_loaded: envInfo.loaded,
    secrets_hint: 'CMS_URL / CMS_MCP_TOKEN только в mcp-cms/.env (не в чат и не в mcp.json).',
    hosting: (() => {
      try { return getClient().guard.status(); } catch { return null; }
    })(),
    preferred: 'cms_release({ summary, changes }) — одним вызовом весь пайплайн до «Готово».',
    ...pipelineHelp(),
  }),
);

server.tool(
  'cms_local_build',
  'ШАГ 1/5. Локальный билд: frontend npm run build + hosting update ZIP. Без этого деплой запрещён.',
  {},
  async () => {
    try {
      return ok(localBuild());
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
  {
    summary: z.string().min(8).describe('Краткий заголовок апдейта (1 строка), напр. «Мобильный логотип + журнал MCP»'),
    changes: z.array(z.string()).optional().describe('Список пунктов изменений (буллеты)'),
    body: z.string().optional().describe('Опционально подробный markdown'),
  },
  async ({ summary, changes, body }) => {
    try {
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
        const cms = getClient();
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
  'ШАГ 4/5. Залить update ZIP. После заливки автоматически ШАГ 5: снапшот сайта + БД + API → ready. Только после build+test+changelog (или force=true).',
  {
    force: z.boolean().optional().describe('Обойти гейт (только ЧП)'),
    zip_path: z.string().optional().describe('Явный путь к ZIP; иначе из гейта'),
    skip_verify: z.boolean().optional().describe('Не делать пост-проверку (не рекомендуется)'),
  },
  async ({ force, zip_path, skip_verify }) => {
    try {
      const gateCheck = assertDeployAllowed({ force: !!force });
      if (!gateCheck.ok) {
        return fail(new Error(`${gateCheck.reason}\nСейчас: cms_pipeline → cms_local_build → cms_local_test → cms_changelog → cms_deploy_update.`));
      }
      const zip = zip_path || String(gateCheck.gate.zip_path || '');
      const cms = getClient();
      const res = await cms.uploadUpdateZip(zip);
      const data = res?.data ?? res;
      markDeployed({ zip, result: data, changelog: gateCheck.gate.changelog || null });

      if (skip_verify) {
        return ok({
          ready: false,
          message: 'ZIP залит, но verify пропущен (skip_verify). Вызови cms_verify_alive.',
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
        const cms = getClient();
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
  'cms_verify_alive',
  'ШАГ 5/5 (можно отдельно). Снапшот после деплоя: API /health + публичный /site + HTML корень + БД schema + diagnostics. Ответ: ready + «Готово» или список проблем.',
  {
    settle_ms: z.number().optional().describe('Пауза перед проверкой (мс), по умолчанию 2000'),
  },
  async ({ settle_ms }) => {
    try {
      const cms = getClient();
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
  'Полный релиз одним вызовом: build → test → changelog → deploy → verify (сайт+БД+API). В конце ready=true и message «Готово» или список проблем. Предпочтительный способ заливки кода.',
  {
    summary: z.string().min(8).describe('Заголовок апдейта для журнала MCP'),
    changes: z.array(z.string()).optional().describe('Буллеты изменений'),
    body: z.string().optional().describe('Опционально подробный markdown'),
    force: z.boolean().optional().describe('Обойти гейт при деплое (ЧП)'),
  },
  async ({ summary, changes, body, force }) => {
    /** @type {Record<string, string>} */
    const steps = { build: 'pending', test: 'pending', changelog: 'pending', deploy: 'pending', verify: 'pending' };
    try {
      const built = localBuild();
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
      const cms = getClient();
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
      const res = await cms.uploadUpdateZip(zip);
      const deployed = res?.data ?? res;
      markDeployed({ zip, result: deployed, changelog: gateCheck.gate.changelog || null });
      steps.deploy = deployed?.ok === false ? 'fail' : 'ok';

      const check = await postDeployVerify(cms);
      steps.verify = check.ready ? 'ok' : 'fail';

      return ok({
        ready: check.ready,
        message: check.ready
          ? 'Готово. Релиз залит, сайт/API/БД живы.'
          : check.message,
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
  'Лимиты shared-хостинга: пауза между запросами, max/мин, кэш GET. Не долби сайт циклами cms_list — один cms_site_map, потом правки cms_bulk.',
  {
    clear_cache: z.boolean().optional().describe('Сбросить локальный GET-кэш'),
  },
  async ({ clear_cache }) => {
    try {
      const cms = getClient();
      if (clear_cache) cms.guard.clearCache();
      return ok(cms.guard.status());
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_site_diagnostics',
  'Логи сайта (MCP-токен). Зови РЕДКО: после деплоя или если сломано. Не в цикле — результат кэшируется ~90с.',
  {},
  async () => {
    try {
      const cms = getClient();
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
  {},
  async () => {
    try {
      const cms = getClient();
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
  'Карта сайта ОДНИМ запросом (страницы+nav+theme). Зови 1 раз перед правками; GET кэшируется ~90с. Не дублируй cms_pages_digest сразу после.',
  {},
  async () => {
    try {
      const cms = getClient();
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
  {
    table: z.string().optional().describe('Имя одной таблицы — вернёт колонки и индексы'),
    detail: z.enum(['names', 'full']).optional().describe('names = список имён (по умолчанию); full = колонки всех таблиц'),
    counts: z.boolean().optional().describe('Добавить row_count (SELECT COUNT) — по умолчанию false'),
  },
  async ({ table, detail, counts }) => {
    try {
      const cms = getClient();
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
  {},
  async () => {
    try {
      const cms = getClient();
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
  {
    id_or_slug: z.string().describe('id страницы или slug, например privacy или __home'),
  },
  async ({ id_or_slug }) => {
    try {
      const cms = getClient();
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
  {},
  async () => {
    try {
      const cms = getClient();
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
  'Список доступных CRUD-ресурсов и singleton-настроек CMS.',
  {},
  async () => ok({ resources: RESOURCES, singletons: SINGLETONS }),
);

server.tool(
  'cms_list',
  'Список записей ресурса. НЕ вызывай в цикле по многим ресурсам — лучше cms_site_map. Запросы троттлятся (~2с) и кэшируются.',
  {
    resource: z.string().describe(`Один из: ${RESOURCES.join(', ')}`),
  },
  async ({ resource }) => {
    try {
      const cms = getClient();
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
  {
    resource: z.string(),
    id: z.union([z.string(), z.number()]),
  },
  async ({ resource, id }) => {
    try {
      const cms = getClient();
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
  {
    resource: z.string(),
    data: z.record(z.unknown()).describe('Поля новой записи'),
  },
  async ({ resource, data }) => {
    try {
      const cms = getClient();
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
  {
    resource: z.string(),
    id: z.union([z.string(), z.number()]),
    data: z.record(z.unknown()),
  },
  async ({ resource, id, data }) => {
    try {
      const cms = getClient();
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
  {
    resource: z.string(),
    id: z.union([z.string(), z.number()]),
  },
  async ({ resource, id }) => {
    try {
      const cms = getClient();
      const res = await cms.delete(`/admin/${resource}/${id}`);
      return ok(res?.data ?? res ?? { deleted: true });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_publish',
  'Сменить статус публикации blog или projects.',
  {
    resource: z.enum(['blog', 'projects']),
    id: z.union([z.string(), z.number()]),
    status: z.enum(['published', 'draft', 'archived']).default('published'),
  },
  async ({ resource, id, status }) => {
    try {
      const cms = getClient();
      const res = await cms.post(`/admin/${resource}/${id}/publish`, { status });
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_get_singleton',
  'Прочитать singleton-настройки: profile, hero, site-settings, seo, theme, contact-info, footer.',
  {
    name: z.string().describe(`Один из: ${SINGLETONS.join(', ')}`),
  },
  async ({ name }) => {
    try {
      const cms = getClient();
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
  {
    name: z.string(),
    data: z.record(z.unknown()),
  },
  async ({ name, data }) => {
    try {
      const cms = getClient();
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
  {
    file_path: z.string().describe('Абсолютный или относительный путь к файлу на этом ПК'),
    alt_text: z.string().optional(),
    caption: z.string().optional(),
    folder_id: z.number().optional(),
  },
  async ({ file_path, alt_text, caption, folder_id }) => {
    try {
      const cms = getClient();
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
  {
    operations: z.array(z.object({
      op: z.enum(['create', 'update', 'delete', 'put_singleton', 'publish']),
      resource: z.string().optional(),
      singleton: z.string().optional(),
      id: z.union([z.string(), z.number()]).optional(),
      data: z.record(z.unknown()).optional(),
      status: z.enum(['published', 'draft', 'archived']).optional(),
    })).max(25).describe('Макс. 25 операций за раз (защита хостинга)'),
  },
  async ({ operations }) => {
    try {
      if (operations.length > 25) {
        return fail(new Error('Максимум 25 операций в cms_bulk — разбей на партии.'));
      }
      const cms = getClient();
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
  {
    pack: z.record(z.unknown()).optional().describe('Сам pack; если нет — читается file_path'),
    file_path: z.string().optional().describe('Локальный JSON pack'),
    confirm_replace: z.boolean().describe('Должно быть true для replace_content'),
  },
  async ({ pack, file_path, confirm_replace }) => {
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

      const cms = getClient();
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
  {},
  async () => {
    try {
      const cms = getClient();
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
  {
    id: z.union([z.string(), z.number()]),
  },
  async ({ id }) => {
    try {
      const cms = getClient();
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
  {
    data: z.record(z.unknown()).describe('name, slug, entry_key, status, is_public, noindex, render_mode, settings_json, content_json'),
  },
  async ({ data }) => {
    try {
      const cms = getClient();
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
  {
    id: z.union([z.string(), z.number()]),
    data: z.record(z.unknown()),
  },
  async ({ id, data }) => {
    try {
      const cms = getClient();
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
  {
    id: z.union([z.string(), z.number()]),
    action: z.enum(['activate', 'disable', 'archive']).default('activate'),
  },
  async ({ id, action }) => {
    try {
      const cms = getClient();
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
  {
    id: z.union([z.string(), z.number()]),
  },
  async ({ id }) => {
    try {
      const cms = getClient();
      const res = await cms.get(`/admin/lab/experiments/${id}/preview`);
      return ok(res?.data ?? res);
    } catch (e) {
      return fail(e);
    }
  },
);

// ─── Module Package Manager ─────────────────────────────────────────────────

server.tool('cms_modules_list', 'Список установленных package-модулей (installed_modules).', {}, async () => {
  try {
    return ok((await getClient().get('/admin/modules'))?.data ?? []);
  } catch (e) {
    return fail(e);
  }
});

server.tool(
  'cms_module_inspect',
  'Загрузить ZIP модуля в staging uploads и вернуть inspect plan (без установки).',
  { zip_path: z.string().min(1) },
  async ({ zip_path }) => {
    try {
      const cms = getClient();
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
  {
    package_id: z.string().min(1),
    slug: z.string().min(1),
    confirm: z.boolean(),
    content_mode: z.enum(['merge', 'skip', 'replace']).optional(),
  },
  async ({ package_id, slug, confirm, content_mode }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      const res = await getClient().post(`/admin/modules/${slug}/install`, {
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
  { package_id: z.string().min(1), slug: z.string().min(1), confirm: z.boolean() },
  async ({ package_id, slug, confirm }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      return ok((await getClient().post(`/admin/modules/${slug}/update`, { package_id }))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_enable',
  'Включить установленный модуль.',
  { slug: z.string().min(1), confirm: z.boolean() },
  async ({ slug, confirm }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      return ok((await getClient().post(`/admin/modules/${slug}/enable`, {}))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_disable',
  'Отключить модуль без удаления файлов/данных.',
  { slug: z.string().min(1), confirm: z.boolean() },
  async ({ slug, confirm }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      return ok((await getClient().post(`/admin/modules/${slug}/disable`, {}))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_health',
  'Health-check установленного модуля.',
  { slug: z.string().min(1) },
  async ({ slug }) => {
    try {
      return ok((await getClient().get(`/admin/modules/${slug}/health`))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_compatibility',
  'Compatibility Report (SDK score, forbidden imports, capabilities) для установленного модуля.',
  { slug: z.string().min(1) },
  async ({ slug }) => {
    try {
      return ok((await getClient().get(`/admin/modules/${slug}/compatibility`))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool('cms_sdk_report', 'Отчёт Platform SDK (версии, публичные API).', {}, async () => {
  try {
    return ok((await getClient().get('/admin/platform/sdk'))?.data);
  } catch (e) {
    return fail(e);
  }
});

server.tool('cms_capability_report', 'Capability Registry: возможности платформы и провайдеры.', {}, async () => {
  try {
    return ok((await getClient().get('/admin/platform/capabilities'))?.data);
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

server.tool('cms_module_operations', 'Журнал операций Module Package Manager.', {}, async () => {
  try {
    return ok((await getClient().get('/admin/module-operations'))?.data ?? []);
  } catch (e) {
    return fail(e);
  }
});

server.tool(
  'cms_module_rollback',
  'Rollback последнего update модуля (если есть snapshot). Требует confirm=true.',
  { slug: z.string().min(1), confirm: z.boolean() },
  async ({ slug, confirm }) => {
    if (!confirm) return fail(new Error('confirm=true required'));
    try {
      return ok((await getClient().post(`/admin/modules/${slug}/rollback`, {}))?.data);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'cms_module_release',
  'Собрать module ZIP локально (scripts/build-module.js). Не деплоит Core. Опционально upload+inspect.',
  {
    module: z.string().min(1),
    version: z.string().optional(),
    upload: z.boolean().optional(),
  },
  async ({ module, version, upload }) => {
    try {
      const { spawnSync } = await import('node:child_process');
      const args = [path.join(repoRoot(), 'scripts/build-module.js'), module, '--yes'];
      if (version) args.push(`--version=${version}`);
      const r = spawnSync(process.execPath, args, { cwd: repoRoot(), encoding: 'utf8' });
      if (r.status !== 0) {
        throw new Error(r.stderr || r.stdout || 'build-module failed');
      }
      const outDir = path.join(repoRoot(), 'release', 'modules');
      const zips = fs.existsSync(outDir)
        ? fs.readdirSync(outDir).filter((f) => f.startsWith(`jasefly-module-${module}-`) && f.endsWith('.zip'))
        : [];
      zips.sort();
      const zipPath = zips.length ? path.join(outDir, zips[zips.length - 1]) : null;
      let remote = null;
      if (upload && zipPath) {
        const cms = getClient();
        const up = await cms.uploadModuleZip(zipPath);
        const packageId = up?.data?.package_id ?? up?.package_id;
        const plan = packageId
          ? await cms.post('/admin/modules/inspect', { package_id: packageId })
          : null;
        remote = { package_id: packageId, plan: plan?.data ?? plan };
      }
      return ok({ built: zipPath, stdout: r.stdout, remote });
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
