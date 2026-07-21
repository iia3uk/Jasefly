/**
 * Protect shared hosting: serial queue + min gap + per-minute cap + GET cache.
 */
export class HostingGuard {
  /**
   * @param {{
   *   minIntervalMs?: number,
   *   maxPerMinute?: number,
   *   cacheTtlMs?: number,
   *   backoffBaseMs?: number,
   * }} [opts]
   */
  constructor(opts = {}) {
    this.minIntervalMs = Math.max(500, opts.minIntervalMs ?? 2000);
    this.maxPerMinute = Math.max(3, opts.maxPerMinute ?? 15);
    this.cacheTtlMs = Math.max(0, opts.cacheTtlMs ?? 90_000);
    this.backoffBaseMs = opts.backoffBaseMs ?? 5000;

    /** @type {Promise<void>} */
    this.chain = Promise.resolve();
    this.lastStart = 0;
    /** @type {number[]} */
    this.timestamps = [];
    /** @type {Map<string, { at: number, value: unknown }>} */
    this.cache = new Map();
    this.stats = {
      remote: 0,
      cached: 0,
      throttled_ms: 0,
      rejected: 0,
    };
  }

  /** @returns {Record<string, unknown>} */
  status() {
    return {
      min_interval_ms: this.minIntervalMs,
      max_per_minute: this.maxPerMinute,
      cache_ttl_ms: this.cacheTtlMs,
      cache_entries: this.cache.size,
      stats: { ...this.stats },
      hint: 'Не долби хостинг: один cms_site_map, правки пачкой через cms_bulk, кэш GET ~TTL.',
    };
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * @param {string} method
   * @param {string} path
   */
  cacheKey(method, path) {
    return `${method.toUpperCase()} ${path}`;
  }

  /**
   * @param {string} method
   * @param {string} path
   */
  getCached(method, path) {
    if (this.cacheTtlMs <= 0) return null;
    if (method.toUpperCase() !== 'GET') return null;
    const key = this.cacheKey(method, path);
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }
    this.stats.cached++;
    return hit.value;
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} value
   */
  setCached(method, path, value) {
    if (this.cacheTtlMs <= 0) return;
    if (method.toUpperCase() !== 'GET') return;
    this.cache.set(this.cacheKey(method, path), { at: Date.now(), value });
  }

  /** Mutations invalidate all GET cache (simple + safe for small sites). */
  invalidateOnMutation(method) {
    const m = method.toUpperCase();
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
      this.cache.clear();
    }
  }

  /**
   * Run fn with hosting-safe pacing. Only one remote call at a time.
   * @template T
   * @param {() => Promise<T>} fn
   * @param {{ bypassCache?: boolean, method?: string, path?: string }} [meta]
   * @returns {Promise<T>}
   */
  schedule(fn, meta = {}) {
    const run = this.chain.then(async () => {
      const method = meta.method || 'GET';
      const path = meta.path || '';

      if (!meta.bypassCache && path) {
        const cached = this.getCached(method, path);
        if (cached !== null && cached !== undefined) {
          return /** @type {T} */ (cached);
        }
      }

      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
      if (this.timestamps.length >= this.maxPerMinute) {
        this.stats.rejected++;
        const wait = 60_000 - (now - this.timestamps[0]) + 200;
        const err = new Error(
          `Лимит хостинга: max ${this.maxPerMinute} запросов/мин. Подожди ~${Math.ceil(wait / 1000)}с. `
          + 'Используй кэш: cms_site_map один раз, не крути cms_list в цикле.',
        );
        // @ts-expect-error
        err.code = 'HOSTING_RATE_LIMIT';
        throw err;
      }

      const gap = this.minIntervalMs - (Date.now() - this.lastStart);
      if (gap > 0) {
        this.stats.throttled_ms += gap;
        await sleep(gap);
      }

      this.lastStart = Date.now();
      this.timestamps.push(this.lastStart);
      this.stats.remote++;

      try {
        const result = await fn();
        if (path) this.setCached(method, path, result);
        this.invalidateOnMutation(method);
        return result;
      } catch (e) {
        // @ts-expect-error
        const status = e?.status;
        if (status === 429 || status === 503 || status === 502) {
          const backoff = this.backoffBaseMs * (status === 429 ? 2 : 1);
          this.stats.throttled_ms += backoff;
          await sleep(backoff);
        }
        throw e;
      }
    });

    // Keep chain alive even if one call fails
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @returns {HostingGuard} */
export function guardFromEnv() {
  const safe = (process.env.CMS_HOSTING_SAFE || '1') !== '0';
  return new HostingGuard({
    minIntervalMs: safe
      ? num(process.env.CMS_MIN_INTERVAL_MS, 2000)
      : num(process.env.CMS_MIN_INTERVAL_MS, 200),
    maxPerMinute: safe
      ? num(process.env.CMS_MAX_PER_MINUTE, 15)
      : num(process.env.CMS_MAX_PER_MINUTE, 60),
    cacheTtlMs: num(process.env.CMS_CACHE_TTL_MS, 90_000),
  });
}

/** @param {string|undefined} v @param {number} d */
function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
}
