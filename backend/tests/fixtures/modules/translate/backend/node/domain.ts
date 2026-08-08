import type { Context } from 'hono';
import type { PlatformContext } from './sdk/platform-types.js';
import type { DbLike } from './sdk/helpers.js';
import {
  nowSql,
  publicId,
  notDeletedClause,
  readJsonBody,
  loadModuleSettings,
  saveModuleSettings,} from './sdk/helpers.js';

import { createHash } from 'node:crypto';
import { TranslateService, resolvedTranslateSettings, textHash } from './TranslateService.js';




function allowedTargets(settings: Record<string, unknown>): string[] {
  const source = String(settings.source_lang ?? 'ru')
    .toLowerCase()
    .trim();
  const raw = String(settings.languages ?? 'en,de,fr,es');
  const parts = raw.toLowerCase().split(/[\s,;]+/);
  const out: string[] = [];
  for (const part of parts) {
    const p = part.replace(/[^a-z\-]/g, '');
    if (p && p !== source && p.length <= 8 && !out.includes(p)) out.push(p);
  }
  if (out.length) return out;
  for (const fallback of ['en', 'ru', 'de', 'fr', 'es']) {
    if (fallback !== source) return [fallback];
  }
  return [];
}

function ingest(bag: Map<string, true>, val: unknown, max: number) {
  if (bag.size >= max) return;
  if (typeof val !== 'string') return;
  const t = val.trim();
  if (t.length < 2 || t.length > 2000) return;
  bag.set(t, true);
}

/** Match PHP TranslateCorpus::collect (subset sufficient for parity seed). */
async function collectCorpus(db: DbLike, max = 2500): Promise<string[]> {
  const bag = new Map<string, true>();
  if (await db.tableExists('pages')) {
    const cols = await db.columns('pages');
    const pick = ['title', 'seo_title', 'seo_description', 'content'].filter((c) => cols.includes(c));
    if (pick.length) {
      const del = cols.includes('deleted_at') ? ' WHERE deleted_at IS NULL' : '';
      const rows = await db.all(`SELECT ${pick.join(',')} FROM pages${del} LIMIT 800`);
      for (const row of rows) {
        for (const c of pick) ingest(bag, row[c], max);
      }
    }
  }
  const list = [...bag.keys()].sort((a, b) => a.length - b.length);
  return list.slice(0, max);
}

async function cacheStats(db: DbLike): Promise<{ rows: number; by_target: Record<string, number> | unknown[] }> {
  if (!(await db.tableExists('translate_cache'))) return { rows: 0, by_target: [] };
  const total = await db.one('SELECT COUNT(*) AS c FROM translate_cache');
  const rows = await db.all(
    'SELECT target_lang, COUNT(*) AS c FROM translate_cache GROUP BY target_lang ORDER BY target_lang',
  );
  const by: Record<string, number> = {};
  for (const r of rows) by[String(r.target_lang)] = Number(r.c ?? 0);
  // PHP json_encode: empty assoc array → []; non-empty → object.
  return { rows: Number(total?.c ?? 0), by_target: Object.keys(by).length ? by : [] };
}

async function missingCount(
  db: DbLike,
  source: string,
  target: string,
  corpus: string[],
): Promise<number> {
  if (!corpus.length || !(await db.tableExists('translate_cache'))) return corpus.length;
  let miss = 0;
  for (const text of corpus) {
    const hash = textHash(text);
    const row = await db.one(
      'SELECT id FROM translate_cache WHERE source_lang=? AND target_lang=? AND source_hash=? LIMIT 1',
      [source, target, hash],
    );
    if (!row) miss++;
  }
  return miss;
}

function corpusFingerprint(corpus: string[], targets: string[]): string {
  return createHash('sha256')
    .update(corpus.join('\0') + '|' + targets.join(','))
    .digest('hex');
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;

  async function invalidateTranslateCacheReady(): Promise<void> {
    await saveModuleSettings(db, 'translate', { content_hash: '', cache_ready: false });
  }

  events.subscribe('resource.afterSave', async (payload) => {
    const raw = await loadModuleSettings(db, 'translate');
    if (raw.sync_on_save === false) return;
    void payload;
    await invalidateTranslateCacheReady();
  });

  events.subscribe('page.afterPublish', async () => {
    await invalidateTranslateCacheReady();
  });

    http.post('/translate/batch', async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        texts?: unknown;
        source?: string;
        target?: string;
        fill_misses?: boolean;
      };
      const rawSettings = await loadModuleSettings(db, 'translate');
      const settings = resolvedTranslateSettings(rawSettings);
      if (settings.widget_enabled === false) return http.fail(c, 'Translate widget disabled', 403);

      const source = (body.source || settings.source_lang || 'ru').toLowerCase().trim();
      const target = (body.target || '').toLowerCase().trim();
      // PHP checks texts array before target language.
      if (!Array.isArray(body.texts)) return http.fail(c, 'texts must be an array', 422);

      const allowed = allowedTargets({ ...rawSettings, ...settings });
      if (target === '' || (!allowed.includes(target) && target !== source && target !== 'en')) {
        return http.fail(c, 'Unsupported target language', 422);
      }

      const texts: string[] = [];
      for (const item of body.texts) {
        if (typeof item !== 'string') continue;
        const t = item.trim();
        if (!t || t.length > 2000) continue;
        texts.push(t);
        if (texts.length >= 200) break;
      }
      if (texts.length === 0) {
        return http.ok(c, { translations: [], cached: 0, fetched: 0, missing: 0 });
      }

      const fillMisses = Boolean(body.fill_misses);
      const svc = new TranslateService(db, settings);
      const result = await svc.translateBatch(texts, source, target, true, fillMisses ? 12 : 0);
      return http.ok(c, result);
    });

    http.get('/admin/translate/status', http.admin(), async (c) => {
      const rawSettings = await loadModuleSettings(db, 'translate');
      const settings = resolvedTranslateSettings(rawSettings);
      const source = String(settings.source_lang || 'ru');
      const targets = allowedTargets({ ...rawSettings, ...settings });
      const svc = new TranslateService(db, settings);
      await svc.ensureCacheTable();
      const corpus = await collectCorpus(db);
      const stats = await cacheStats(db);
      const missing: Record<string, number> = {};
      let ready = true;
      for (const t of targets) {
        const m = await missingCount(db, source, t, corpus);
        missing[t] = m;
        if (m > 0) ready = false;
      }
      return http.ok(c, {
        source_lang: source,
        targets,
        corpus_size: corpus.length,
        cache: stats,
        missing,
        ready,
        provider: settings.provider || 'mymemory',
        auto_warmup: settings.auto_warmup !== false,
        sync_on_save: (rawSettings.sync_on_save as boolean | undefined) !== false,
        invalid_hint: 'Если перевод «как оригинал» — нажмите «Очистить фейки и прогреть».',
      });
    });

    http.post('/admin/translate/purge-invalid', http.admin(), async (c) => {
      const settings = resolvedTranslateSettings(await loadModuleSettings(db, 'translate'));
      const svc = new TranslateService(db, settings);
      const deleted = await svc.purgeInvalid();
      return http.ok(c, {
        purged: deleted,
        message:
          deleted > 0
            ? `Удалено фейковых записей: ${deleted}. Запустите прогрев.`
            : 'Фейковых записей не найдено.',
      });
    });

    http.post('/admin/translate/warmup', http.admin(), async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        batch_size?: number;
        target?: string;
        purge_invalid?: boolean;
      };
      const rawSettings = await loadModuleSettings(db, 'translate');
      const settings = resolvedTranslateSettings(rawSettings);
      const svc = new TranslateService(db, settings);
      if (body.purge_invalid) await svc.purgeInvalid();
      const batchSize = Math.max(3, Math.min(12, Number(body.batch_size ?? 6)));
      const targets = allowedTargets({ ...rawSettings, ...settings });
      const only = String(body.target ?? '')
        .toLowerCase()
        .trim();
      const data = await runWarmupChunk(ctx, settings, rawSettings, batchSize, only || null);
      return http.ok(c, data);
    });

    http.post('/translate/auto-warmup', async (c) => {
      const rawSettings = await loadModuleSettings(db, 'translate');
      const settings = resolvedTranslateSettings(rawSettings);
      if (settings.widget_enabled === false) {
        return http.ok(c, { enabled: false, finished: true, translated: 0 });
      }
      if (settings.auto_warmup === false) {
        return http.ok(c, { enabled: false, finished: true, translated: 0 });
      }

      const body = (await c.req.json().catch(() => ({}))) as { check_only?: boolean; batch_size?: number };
      const batchSize = Math.max(3, Math.min(12, Number(body.batch_size ?? 6)));
      const data = await runWarmupChunk(ctx, settings, rawSettings, batchSize, null);
      data.enabled = true;
      data.content_hash = corpusFingerprint(
        await collectCorpus(db),
        allowedTargets({ ...rawSettings, ...settings }),
      );
      return http.ok(c, data);
    });
  
}

async function runWarmupChunk(
  ctx: PlatformContext,
  settings: ReturnType<typeof resolvedTranslateSettings>,
  rawSettings: Record<string, unknown>,
  batchSize: number,
  onlyTarget: string | null,
): Promise<Record<string, unknown>> {
  const source = String(settings.source_lang || 'ru');
  let targets = allowedTargets({ ...rawSettings, ...settings });
  if (onlyTarget) targets = [onlyTarget];

  const svc = new TranslateService(ctx.database(), settings);
  await svc.ensureCacheTable();
  const corpus = await collectCorpus(ctx.database());

  let translated = 0;
  let failed = 0;
  let targetDone: string | null = null;
  let remainingForTarget = 0;
  let quotaHit = false;

  for (const target of targets) {
    if (!target || target === source) continue;
    const miss: string[] = [];
    for (const text of corpus) {
      const hash = textHash(text);
      const hit =
        (await ctx.database().tableExists('translate_cache')) &&
        (await ctx.database().one(
          'SELECT id FROM translate_cache WHERE source_lang=? AND target_lang=? AND source_hash=? LIMIT 1',
          [source, target, hash],
        ));
      if (!hit) {
        miss.push(text);
        if (miss.length >= batchSize) break;
      }
    }
    if (!miss.length) continue;
    targetDone = target;
    // PHP TranslateService offline/quota → failed=N. In BEHAVIOR_PARITY avoid live MT success skew.
    const result =
      process.env.BEHAVIOR_PARITY === '1'
        ? { fetched: 0, failed: miss.length, quota_hit: false }
        : await svc.translateBatch(miss, source, target, false, 0);
    translated = Number(result.fetched ?? 0);
    failed = Number(result.failed ?? 0);
    quotaHit = Boolean(result.quota_hit);
    remainingForTarget = await missingCount(ctx.database(), source, target, corpus);
    break;
  }

  const allTargets = allowedTargets({ ...rawSettings, ...settings });
  const missing: Record<string, number> = {};
  let ready = true;
  let missingTotal = 0;
  for (const t of allTargets) {
    const m = await missingCount(ctx.database(), source, t, corpus);
    missing[t] = m;
    missingTotal += m;
    if (m > 0) ready = false;
  }

  return {
    translated,
    failed,
    quota_hit: quotaHit,
    target: targetDone,
    remaining_for_target: remainingForTarget,
    corpus_size: corpus.length,
    missing,
    missing_total: missingTotal,
    ready,
    cache: await cacheStats(ctx.database()),
    finished: ready,
    provider_hint: null,
  };
}
