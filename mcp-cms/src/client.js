/**
 * Jasefly CMS HTTP client — JWT or long-lived MCP token.
 * All remote calls go through HostingGuard (throttle + GET cache).
 * Multi-site: clientForSite(query) → per-site CmsClient + HostingGuard.
 * Dual-secret: when signingSecret is set, MCP Bearer requests carry HMAC headers.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { guardFromEnv, HostingGuard } from './throttle.js';
import {
  apiBaseFromSiteUrl,
  listSitesPublic,
  loadSites,
  resolveSite,
  siteCount,
} from './sites.js';

/**
 * @param {string} signingSecret
 * @param {string} method
 * @param {string} signPath pathname + search as seen by the server
 * @param {string} bodyRaw raw JSON body or '' for empty/multipart
 * @returns {{ ts: string, nonce: string, sign: string }}
 */
export function buildMcpSignature(signingSecret, method, signPath, bodyRaw) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyHash = crypto.createHash('sha256').update(bodyRaw || '').digest('hex');
  const canonical = `v1\n${String(method).toUpperCase()}\n${signPath}\n${ts}\n${nonce}\n${bodyHash}`;
  const hex = crypto.createHmac('sha256', signingSecret).update(canonical).digest('hex');
  return { ts, nonce, sign: `v1=${hex}` };
}

export class CmsClient {
  /**
   * @param {{
   *   baseUrl: string,
   *   mcpToken?: string,
   *   signingSecret?: string,
   *   email?: string,
   *   password?: string,
   *   totpCode?: string,
   *   guard?: HostingGuard,
   * }} opts
   */
  constructor(opts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.mcpToken = opts.mcpToken || '';
    this.signingSecret = opts.signingSecret || '';
    this.email = opts.email || '';
    this.password = opts.password || '';
    this.totpCode = opts.totpCode || '';
    this.accessToken = '';
    this.refreshToken = '';
    this.guard = opts.guard || guardFromEnv();
  }

  /** @returns {Promise<void>} */
  async ensureAuth() {
    if (this.mcpToken) {
      this.accessToken = this.mcpToken;
      return;
    }
    if (this.accessToken) return;
    if (!this.email || !this.password) {
      throw new Error(
        'Задайте CMS_MCP_TOKEN в mcp-cms/.env (рекомендуется) или CMS_EMAIL + CMS_PASSWORD.',
      );
    }
    await this.login();
  }

  async login() {
    const res = await this.raw('POST', '/auth/login', {
      email: this.email,
      password: this.password,
    }, { auth: false });
    const data = res.data ?? res;
    if (data.requires_2fa) {
      if (!this.totpCode) {
        throw new Error(
          'На аккаунте включена 2FA. Задайте CMS_TOTP_CODE или лучше mcp_api_token на сайте.',
        );
      }
      const verified = await this.raw('POST', '/auth/2fa/verify', {
        challenge_token: data.challenge_token,
        code: String(this.totpCode),
      }, { auth: false });
      const v = verified.data ?? verified;
      this.accessToken = v.access_token;
      this.refreshToken = v.refresh_token || '';
      return;
    }
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token || '';
  }

  async refresh() {
    if (this.mcpToken || !this.refreshToken) {
      this.accessToken = '';
      await this.ensureAuth();
      return;
    }
    const res = await this.raw('POST', '/auth/refresh', {
      refresh_token: this.refreshToken,
    }, { auth: false });
    const data = res.data ?? res;
    this.accessToken = data.access_token;
  }

  /**
   * @param {string} method
   * @param {string} apiPath
   * @param {unknown} [body]
   * @param {{ auth?: boolean, form?: FormData, bypassCache?: boolean }} [opts]
   */
  async raw(method, apiPath, body, opts = {}) {
    const { auth = true, form, bypassCache = false } = opts;
    const pathKey = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;

    return this.guard.schedule(async () => {
      const url = `${this.baseUrl}${pathKey}`;
      /** @type {Record<string, string>} */
      const headers = {
        Accept: 'application/json',
        'User-Agent': 'portfolio-mcp-cms/1.3 (hosting-safe)',
      };
      if (auth && this.accessToken) {
        headers.Authorization = `Bearer ${this.accessToken}`;
      }
      /** @type {RequestInit} */
      const init = { method, headers };
      /** @type {string} */
      let bodyRaw = '';
      if (form) {
        init.body = form;
        bodyRaw = ''; // multipart: server hashes empty body
      } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        bodyRaw = JSON.stringify(body);
        init.body = bodyRaw;
      }
      // Proof-of-possession for MCP Bearer (not JWT login sessions).
      if (auth && this.mcpToken && this.signingSecret) {
        const u = new URL(url);
        const signPath = `${u.pathname}${u.search || ''}`;
        const signed = buildMcpSignature(this.signingSecret, method, signPath, bodyRaw);
        headers['X-Jasefly-Ts'] = signed.ts;
        headers['X-Jasefly-Nonce'] = signed.nonce;
        headers['X-Jasefly-Sign'] = signed.sign;
      }
      const response = await fetch(url, init);
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      if (!response.ok) {
        const msg = json?.error || json?.message || `HTTP ${response.status}`;
        const err = new Error(String(msg));
        // @ts-expect-error
        err.status = response.status;
        // @ts-expect-error
        err.payload = json;
        throw err;
      }
      return json;
    }, { method, path: pathKey, bypassCache });
  }

  /**
   * @param {string} method
   * @param {string} apiPath
   * @param {unknown} [body]
   */
  async request(method, apiPath, body) {
    await this.ensureAuth();
    try {
      return await this.raw(method, apiPath, body);
    } catch (e) {
      // @ts-expect-error
      if (e?.status === 401 && !this.mcpToken) {
        await this.refresh();
        return await this.raw(method, apiPath, body, { bypassCache: true });
      }
      throw e;
    }
  }

  get(apiPath) {
    return this.request('GET', apiPath);
  }

  post(apiPath, body) {
    return this.request('POST', apiPath, body);
  }

  /** Site origin without /api/v1 (for HTML shell check). */
  siteOrigin() {
    return this.baseUrl
      .replace(/\/api\/v1\/?$/i, '')
      .replace(/\/api\/?$/i, '')
      .replace(/\/$/, '');
  }

  /**
   * Fetch public HTML root (SPA shell). Bypasses API base.
   * @param {{ bypassCache?: boolean }} [opts]
   * @returns {Promise<{ status: number, body: string }>}
   */
  async fetchSiteRoot(opts = {}) {
    const origin = this.siteOrigin();
    if (!origin) throw new Error('CMS_URL пуст — некуда ходить за HTML');
    return this.guard.schedule(async () => {
      const response = await fetch(`${origin}/`, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'portfolio-mcp-cms/1.3 (post-deploy-verify)',
        },
        redirect: 'follow',
      });
      const body = await response.text();
      return { status: response.status, body };
    }, { method: 'GET', path: '/', bypassCache: opts.bypassCache !== false });
  }

  put(apiPath, body) {
    return this.request('PUT', apiPath, body);
  }

  delete(apiPath) {
    return this.request('DELETE', apiPath);
  }

  /**
   * @param {string} filePath
   * @param {{ folder_id?: number|null, alt_text?: string, caption?: string }} [meta]
   */
  async uploadMedia(filePath, meta = {}) {
    await this.ensureAuth();
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Файл не найден: ${abs}`);
    }
    const buf = fs.readFileSync(abs);
    const blob = new Blob([buf]);
    const form = new FormData();
    form.append('file', blob, path.basename(abs));
    if (meta.folder_id != null) form.append('folder_id', String(meta.folder_id));
    if (meta.alt_text) form.append('alt_text', meta.alt_text);
    if (meta.caption) form.append('caption', meta.caption);

    try {
      return await this.raw('POST', '/admin/media', undefined, { form });
    } catch (e) {
      // @ts-expect-error
      if (e?.status === 401 && !this.mcpToken) {
        await this.refresh();
        return await this.raw('POST', '/admin/media', undefined, { form, bypassCache: true });
      }
      throw e;
    }
  }

  /**
   * Upload hosting update ZIP to in-panel updater.
   * @param {string} zipPath
   */
  async uploadUpdateZip(zipPath) {
    await this.ensureAuth();
    const abs = path.resolve(zipPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`ZIP не найден: ${abs}`);
    }
    const buf = fs.readFileSync(abs);
    const form = new FormData();
    form.append('package', new Blob([buf], { type: 'application/zip' }), path.basename(abs));
    try {
      return await this.raw('POST', '/admin/updates', undefined, { form });
    } catch (e) {
      // @ts-expect-error
      if (e?.status === 401 && !this.mcpToken) {
        await this.refresh();
        return await this.raw('POST', '/admin/updates', undefined, { form, bypassCache: true });
      }
      throw e;
    }
  }

  /** Upload module package ZIP to Module Package Manager. */
  async uploadModuleZip(zipPath) {
    await this.ensureAuth();
    const abs = path.resolve(zipPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Module ZIP не найден: ${abs}`);
    }
    const buf = fs.readFileSync(abs);
    const form = new FormData();
    form.append('package', new Blob([buf], { type: 'application/zip' }), path.basename(abs));
    try {
      return await this.raw('POST', '/admin/modules/upload', undefined, { form });
    } catch (e) {
      // @ts-expect-error
      if (e?.status === 401 && !this.mcpToken) {
        await this.refresh();
        return await this.raw('POST', '/admin/modules/upload', undefined, { form, bypassCache: true });
      }
      throw e;
    }
  }
}

/** @type {Map<string, CmsClient>} */
const clientsById = new Map();

/**
 * @param {import('./sites.js').SiteConfig} cfg
 * @returns {CmsClient}
 */
function buildClient(cfg) {
  return new CmsClient({
    baseUrl: apiBaseFromSiteUrl(cfg.url),
    mcpToken: cfg.token,
    signingSecret: cfg.signingSecret || '',
    email: cfg.email,
    password: cfg.password,
    totpCode: cfg.totpCode,
    // Fresh guard per site so throttle/cache do not mix across hosts
    guard: guardFromEnv(),
  });
}

/**
 * Resolve site (id / alias / domain) and return cached CmsClient.
 * Omit query only when exactly one site is configured (legacy compat).
 * @param {string | undefined | null} [query]
 * @returns {CmsClient}
 */
export function clientForSite(query) {
  const cfg = resolveSite(query);
  const cached = clientsById.get(cfg.id);
  if (cached) return cached;
  const client = buildClient(cfg);
  /** @type {string | undefined} */
  client.siteId = cfg.id;
  /** @type {string | undefined} */
  client.siteHost = cfg.host;
  clientsById.set(cfg.id, client);
  return client;
}

/**
 * Legacy helper: same as clientForSite() with no query (single-site only).
 * @returns {CmsClient}
 */
export function clientFromEnv() {
  return clientForSite(undefined);
}

/** @returns {{ sites: ReturnType<typeof listSitesPublic>, count: number }} */
export function sitesOverview() {
  return { count: siteCount(), sites: listSitesPublic() };
}

/**
 * Hosting guard status for one site or all registered sites (no extra HTTP).
 * @param {string | undefined | null} [query]
 */
export function hostingGuardStatus(query) {
  const q = query != null && String(query).trim() !== '' ? String(query) : '';
  if (q || siteCount() === 1) {
    const cms = clientForSite(q || undefined);
    return {
      site: cms.siteId || resolveSite(q || undefined).id,
      host: cms.siteHost || null,
      ...cms.guard.status(),
    };
  }
  // Multi: status for each site (creates clients lazily for accurate cache stats)
  const sites = loadSites();
  return {
    multi: true,
    hint: 'Передайте site для одного хоста. Список: cms_sites.',
    sites: sites.map((s) => {
      const cms = clientForSite(s.id);
      return {
        site: s.id,
        host: s.host,
        ...cms.guard.status(),
      };
    }),
  };
}

export { listSitesPublic, siteCount, resolveSite, loadSites };

/**
 * Host/core CRUD resource hints for MCP UX only.
 * Not authoritative — cms_list_resources merges runtime package surfaces.content_acl.
 * Lifecycle MCP tools remain slug-agnostic via installed_modules.
 */
export const HOST_RESOURCE_HINTS = [
  'pages',
  'services',
  'navigation',
  'homepage-sections',
  'testimonials',
  'experience',
  'education',
  'skills',
  'skill-categories',
  'statistics',
  'social-links',
  'media',
];

/** @deprecated Use HOST_RESOURCE_HINTS + runtime discovery */
export const RESOURCES = [
  ...HOST_RESOURCE_HINTS,
  // Package domains kept as UX hints until operators call cms_list_resources (site-aware).
  'blog',
  'blog-categories',
  'blog-tags',
  'projects',
  'project-categories',
  'products',
];

export const SINGLETONS = [
  'profile',
  'hero',
  'site-settings',
  'seo',
  'theme',
  'contact-info',
  'footer',
  'email-settings',
];
