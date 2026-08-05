import { createHash } from 'node:crypto';
import type { Database } from '../db/Database.js';

export type TranslateBatchResult = {
  translations: string[];
  cached: number;
  fetched: number;
  provider: string;
  missing: number;
  failed: number;
  partial: boolean;
  quota_hit: boolean;
};

export type TranslateSettings = {
  provider: string;
  source_lang: string;
  languages?: string;
  widget_enabled?: boolean;
};

type TranslateProvider = {
  name: string;
  translate(texts: string[], source: string, target: string): Promise<Array<string | null>>;
};

const memCache = new Map<string, string>();

function cacheKey(source: string, target: string, text: string): string {
  return `${source}|${target}|${createHash('sha256').update(text).digest('hex')}`;
}

export function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function resolveProviderName(): string {
  return (process.env.TRANSLATE_PROVIDER || 'google').toLowerCase().trim();
}

function buildProvider(name: string): TranslateProvider {
  if (name === 'memory') {
    return {
      name: 'memory',
      async translate(texts, _source, target) {
        return texts.map((t) => `[${target}]${t.toUpperCase()}`);
      },
    };
  }
  return {
    name: 'google',
    async translate(texts, source, target) {
      const base = (process.env.TRANSLATE_API_URL || 'https://translate.googleapis.com/translate_a/single').replace(/\/$/, '');
      const out: Array<string | null> = [];
      for (const text of texts) {
        const url = `${base}?${new URLSearchParams({
          client: 'gtx',
          sl: source || 'auto',
          tl: target,
          dt: 't',
          dj: '1',
          q: text,
        })}`;
        try {
          const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(18000),
          });
          if (!res.ok) {
            out.push(null);
            continue;
          }
          const decoded = (await res.json()) as {
            sentences?: Array<{ trans?: string }>;
          };
          let joined = '';
          if (Array.isArray(decoded.sentences)) {
            for (const s of decoded.sentences) {
              if (s?.trans) joined += s.trans;
            }
          }
          joined = joined.trim();
          out.push(joined || null);
        } catch {
          out.push(null);
        }
      }
      return out;
    },
  };
}

export class TranslateService {
  private provider: TranslateProvider;

  constructor(
    private db: Database | null,
    private settings: TranslateSettings,
  ) {
    const configured = (settings.provider || resolveProviderName()).toLowerCase().trim();
    this.provider = buildProvider(configured === 'memory' ? 'memory' : configured === 'google' ? 'google' : configured);
  }

  providerName(): string {
    return this.provider.name;
  }

  async ensureCacheTable(): Promise<void> {
    if (!this.db) return;
    if (await this.db.tableExists('translate_cache')) return;
    try {
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS translate_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_lang VARCHAR(8) NOT NULL,
          target_lang VARCHAR(8) NOT NULL,
          source_hash CHAR(64) NOT NULL,
          source_text TEXT NOT NULL,
          translated_text TEXT NOT NULL,
          provider VARCHAR(40) NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(source_lang, target_lang, source_hash)
        )`);
    } catch {
      // table may exist with different dialect DDL from migrations
    }
  }

  async translateBatch(
    texts: string[],
    source: string,
    target: string,
    cacheOnly = false,
    fillMissCap = 0,
  ): Promise<TranslateBatchResult> {
    source = source.toLowerCase().trim();
    target = target.toLowerCase().trim();
    const provider = this.provider.name;
    fillMissCap = Math.max(0, Math.min(24, fillMissCap));

    if (!source || !target || source === target || texts.length === 0) {
      return {
        translations: texts,
        cached: texts.length,
        fetched: 0,
        missing: 0,
        failed: 0,
        partial: false,
        quota_hit: false,
        provider,
      };
    }

    await this.ensureCacheTable();
    const out: Record<number, string> = {};
    const missIndex: number[] = [];
    const missTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const hit = await this.getCached(source, target, text);
      if (hit) {
        out[i] = hit;
      } else {
        missIndex.push(i);
        missTexts.push(text);
      }
    }

    let fetched = 0;
    let failed = 0;
    let partial = false;
    const freshMap = new Map<string, string>();

    if (missTexts.length > 0) {
      if (cacheOnly && fillMissCap <= 0) {
        for (const i of missIndex) out[i] = texts[i];
        failed = missTexts.length;
      } else {
        const uniqueMiss = [...new Set(missTexts)];
        let toFetch = uniqueMiss;
        if (cacheOnly && fillMissCap > 0 && uniqueMiss.length > fillMissCap) {
          toFetch = uniqueMiss.slice(0, fillMissCap);
          partial = true;
        }
        if (toFetch.length > 0) {
          const translated = await this.provider.translate(toFetch, source, target);
          for (let j = 0; j < toFetch.length; j++) {
            const srcText = toFetch[j];
            const tr = translated[j];
            if (typeof tr === 'string' && tr.trim()) {
              freshMap.set(srcText, tr);
              await this.putCached(source, target, srcText, tr, provider);
              fetched++;
            }
          }
        }
        for (const i of missIndex) {
          const srcText = texts[i];
          if (freshMap.has(srcText)) out[i] = freshMap.get(srcText)!;
          else {
            out[i] = srcText;
            failed++;
          }
        }
        if (cacheOnly && fillMissCap > 0) {
          for (const t of uniqueMiss) {
            if (!freshMap.has(t)) {
              partial = true;
              break;
            }
          }
        }
      }
    }

    const ordered = Object.keys(out)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => out[i]);

    return {
      translations: ordered,
      cached: texts.length - missTexts.length,
      fetched,
      missing: missTexts.length,
      failed,
      partial,
      quota_hit: false,
      provider,
    };
  }

  async purgeInvalid(): Promise<number> {
    if (!this.db || !(await this.db.tableExists('translate_cache'))) return 0;
    try {
      await this.db.run(
        'DELETE FROM translate_cache WHERE source_lang <> target_lang AND source_text = translated_text',
      );
      const row = await this.db.one('SELECT changes() AS c').catch(() => ({ c: 0 }));
      return Number(row?.c ?? 0);
    } catch {
      return 0;
    }
  }

  private async getCached(source: string, target: string, text: string): Promise<string | null> {
    const key = cacheKey(source, target, text);
    if (memCache.has(key)) return memCache.get(key)!;
    if (!this.db || !(await this.db.tableExists('translate_cache'))) return null;
    try {
      const hash = textHash(text);
      const row = await this.db.one(
        'SELECT translated_text FROM translate_cache WHERE source_lang=? AND target_lang=? AND source_hash=? LIMIT 1',
        [source, target, hash],
      );
      const val = row?.translated_text != null ? String(row.translated_text) : null;
      if (val) memCache.set(key, val);
      return val;
    } catch {
      return null;
    }
  }

  private async putCached(source: string, target: string, text: string, translated: string, provider: string): Promise<void> {
    const key = cacheKey(source, target, text);
    memCache.set(key, translated);
    if (!this.db || !(await this.db.tableExists('translate_cache'))) return;
    try {
      const hash = textHash(text);
      if (this.db.driver() === 'sqlite') {
        await this.db.run(
          `INSERT INTO translate_cache (source_lang, target_lang, source_hash, source_text, translated_text, provider)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(source_lang, target_lang, source_hash) DO UPDATE SET
             translated_text=excluded.translated_text, provider=excluded.provider, updated_at=datetime('now')`,
          [source, target, hash, text, translated, provider],
        );
      } else {
        await this.db.run(
          `INSERT INTO translate_cache (source_lang, target_lang, source_hash, source_text, translated_text, provider)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE translated_text=VALUES(translated_text), provider=VALUES(provider)`,
          [source, target, hash, text, translated, provider],
        );
      }
    } catch {
      // cache optional
    }
  }
}

export function resolvedTranslateSettings(dbSettings: Record<string, unknown> | null): TranslateSettings {
  const envProvider = resolveProviderName();
  return {
    provider: String(dbSettings?.provider ?? envProvider),
    source_lang: String(dbSettings?.source_lang ?? 'ru'),
    languages: String(dbSettings?.languages ?? 'en,de,fr,es'),
    widget_enabled: dbSettings?.widget_enabled !== false && dbSettings?.widget_enabled !== 0,
  };
}
