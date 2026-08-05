import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { TranslateService, resolvedTranslateSettings } from '../translate/TranslateService.js';

export const name = 'translate';

async function moduleSettings(db: ModuleContext['db']): Promise<Record<string, unknown>> {
  if (!(await db.tableExists('modules'))) return {};
  try {
    const row = await db.one('SELECT settings FROM modules WHERE name=? LIMIT 1', ['translate']);
    if (!row?.settings) return {};
    const raw = row.settings;
    if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>;
    if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // optional
  }
  return {};
}

export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/translate/batch`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        texts?: unknown;
        source?: string;
        target?: string;
        fill_misses?: boolean;
      };
      const settings = resolvedTranslateSettings(await moduleSettings(ctx.db));
      if (settings.widget_enabled === false) return fail(c, 'Translate widget disabled', 403);

      const source = (body.source || settings.source_lang || 'ru').toLowerCase().trim();
      const target = (body.target || '').toLowerCase().trim();
      if (!target || target === source) return fail(c, 'Unsupported target language', 422);

      const raw = Array.isArray(body.texts) ? body.texts : [];
      const texts: string[] = [];
      for (const item of raw) {
        if (typeof item !== 'string') continue;
        const t = item.trim();
        if (!t || t.length > 2000) continue;
        texts.push(t);
        if (texts.length >= 200) break;
      }
      if (texts.length === 0) {
        return ok(c, { translations: [], cached: 0, fetched: 0, missing: 0, provider: settings.provider });
      }

      const fillMisses = Boolean(body.fill_misses);
      const svc = new TranslateService(ctx.db, settings);
      const result = await svc.translateBatch(texts, source, target, true, fillMisses ? 12 : 0);
      return ok(c, result);
    });

    ctx.app.get(`${p}/admin/translate/status`, requireAdmin(ctx.auth), async (c) => {
      const settings = resolvedTranslateSettings(await moduleSettings(ctx.db));
      const svc = new TranslateService(ctx.db, settings);
      await svc.ensureCacheTable();
      let cacheStats = { rows: 0 };
      if (await ctx.db.tableExists('translate_cache')) {
        const row = await ctx.db.one('SELECT COUNT(*) AS c FROM translate_cache');
        cacheStats = { rows: Number(row?.c ?? 0) };
      }
      return ok(c, {
        source_lang: settings.source_lang,
        provider: svc.providerName(),
        targets: (settings.languages || 'en').split(/[\s,;]+/).filter(Boolean),
        cache: cacheStats,
        ready: false,
        auto_warmup: true,
        sync_on_save: true,
      });
    });

    ctx.app.post(`${p}/admin/translate/purge-invalid`, requireAdmin(ctx.auth), async (c) => {
      const settings = resolvedTranslateSettings(await moduleSettings(ctx.db));
      const svc = new TranslateService(ctx.db, settings);
      const deleted = await svc.purgeInvalid();
      return ok(c, {
        purged: deleted,
        message: deleted > 0
          ? `Удалено фейковых записей: ${deleted}. Запустите прогрев.`
          : 'Фейковых записей не найдено.',
      });
    });

    ctx.app.post(`${p}/admin/translate/warmup`, requireAdmin(ctx.auth), async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        batch_size?: number;
        target?: string;
        purge_invalid?: boolean;
      };
      const settings = resolvedTranslateSettings(await moduleSettings(ctx.db));
      const svc = new TranslateService(ctx.db, settings);
      if (body.purge_invalid) await svc.purgeInvalid();
      const batchSize = Math.max(3, Math.min(12, Number(body.batch_size ?? 6)));
      const target = String(body.target ?? '').toLowerCase().trim();
      const targets = (settings.languages || 'en').split(/[\s,;]+/).filter(Boolean);
      const warmupTarget = target && targets.includes(target) ? target : targets[0] ?? 'en';
      const sampleTexts = ['Главная', 'Контакты', 'О нас', 'Услуги', 'Портфолио', 'Блог'].slice(0, batchSize);
      const result = await svc.translateBatch(
        sampleTexts,
        settings.source_lang || 'ru',
        warmupTarget,
        false,
        batchSize,
      );
      return ok(c, {
        finished: result.failed === 0,
        translated: result.fetched,
        target: warmupTarget,
        batch_size: batchSize,
        ready: result.failed === 0 && result.missing === 0,
      });
    });

    ctx.app.post(`${p}/translate/auto-warmup`, async (c) => {
      const settings = resolvedTranslateSettings(await moduleSettings(ctx.db));
      if (settings.widget_enabled === false) {
        return ok(c, { enabled: false, finished: true, translated: 0 });
      }
      const body = (await c.req.json().catch(() => ({}))) as { check_only?: boolean; batch_size?: number };
      if (body.check_only) {
        return ok(c, { enabled: true, finished: false, translated: 0 });
      }
      const svc = new TranslateService(ctx.db, settings);
      const batchSize = Math.max(3, Math.min(12, Number(body.batch_size ?? 6)));
      const targets = (settings.languages || 'en').split(/[\s,;]+/).filter(Boolean);
      const target = targets[0] ?? 'en';
      const sampleTexts = ['Главная', 'Контакты', 'О нас'].slice(0, batchSize);
      const result = await svc.translateBatch(
        sampleTexts,
        settings.source_lang || 'ru',
        target,
        true,
        batchSize,
      );
      return ok(c, {
        enabled: true,
        finished: result.partial !== true && result.failed === 0,
        translated: result.fetched,
        target,
      });
    });
  }
}
