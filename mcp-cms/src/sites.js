/**
 * Multi-site registry for MCP: CMS_SITES + CMS_SITE_{ID}_* or legacy CMS_URL.
 * Secrets stay in env; this module never returns tokens in public listings.
 */

/**
 * @typedef {{
 *   id: string,
 *   url: string,
 *   host: string,
 *   aliases: string[],
 *   token: string,
 *   signingSecret: string,
 *   email: string,
 *   password: string,
 *   totpCode: string,
 *   runtime: 'php-shared' | 'node-vps',
 *   deployment: 'shared' | 'vps',
 *   deployPath: string,
 *   apiUrl: string,
 *   healthcheckUrl: string,
 *   sshHost: string,
 *   sshUser: string,
 *   sshKeyPath: string,
 *   restartCommand: string,
 *   processManager: string,
 *   buildCommand: string,
 * }} SiteConfig
 */

/** @type {SiteConfig[] | null} */
let cachedRegistry = null;

/** @param {string} s */
function normKey(s) {
  return String(s || '').trim().toLowerCase();
}

/** @param {string} url */
export function hostFromUrl(url) {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return String(url || '')
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .replace(/^www\./i, '')
      .toLowerCase();
  }
}

/** @param {string} id */
function envKey(id) {
  return String(id || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

/**
 * @param {string} id
 * @returns {SiteConfig | null}
 */
function siteFromPrefixedEnv(id) {
  const key = envKey(id);
  const url = (process.env[`CMS_SITE_${key}_URL`] || '').replace(/\/$/, '');
  if (!url) return null;
  const aliasesRaw = process.env[`CMS_SITE_${key}_ALIASES`] || '';
  const aliases = aliasesRaw
    .split(/[,;\s]+/)
    .map((a) => normKey(a))
    .filter(Boolean);
  const host = hostFromUrl(url);
  const www = host ? `www.${host}` : '';
  const allAliases = [...new Set([
    ...aliases,
    host,
    www,
    normKey(id),
  ].filter(Boolean))];

  const runtimeRaw = (process.env[`CMS_SITE_${key}_RUNTIME`] || 'php-shared').trim().toLowerCase();
  const runtime = runtimeRaw === 'node-vps' || runtimeRaw === 'node' || runtimeRaw === 'vps'
    ? 'node-vps'
    : 'php-shared';
  const deploymentRaw = (process.env[`CMS_SITE_${key}_DEPLOYMENT`] || (runtime === 'node-vps' ? 'vps' : 'shared')).trim().toLowerCase();
  const deployment = deploymentRaw === 'vps' ? 'vps' : 'shared';

  return {
    id: String(id).trim(),
    url,
    host,
    aliases: allAliases,
    token: process.env[`CMS_SITE_${key}_TOKEN`]
      || process.env[`CMS_SITE_${key}_MCP_TOKEN`]
      || '',
    signingSecret: process.env[`CMS_SITE_${key}_SIGNING_SECRET`]
      || process.env.CMS_MCP_SIGNING_SECRET
      || '',
    email: process.env[`CMS_SITE_${key}_EMAIL`] || '',
    password: process.env[`CMS_SITE_${key}_PASSWORD`] || '',
    totpCode: process.env[`CMS_SITE_${key}_TOTP_CODE`] || '',
    runtime,
    deployment,
    deployPath: process.env[`CMS_SITE_${key}_DEPLOY_PATH`] || '',
    apiUrl: (process.env[`CMS_SITE_${key}_API_URL`] || `${url}/api/v1`).replace(/\/$/, ''),
    healthcheckUrl: process.env[`CMS_SITE_${key}_HEALTHCHECK_URL`] || '',
    sshHost: process.env[`CMS_SITE_${key}_SSH_HOST`] || '',
    sshUser: process.env[`CMS_SITE_${key}_SSH_USER`] || '',
    sshKeyPath: process.env[`CMS_SITE_${key}_SSH_KEY_PATH`] || '',
    restartCommand: process.env[`CMS_SITE_${key}_RESTART_COMMAND`] || '',
    processManager: process.env[`CMS_SITE_${key}_PROCESS_MANAGER`] || '',
    buildCommand: process.env[`CMS_SITE_${key}_BUILD_COMMAND`] || '',
  };
}

/** @returns {SiteConfig[]} */
function legacySingleSite() {
  const url = (process.env.CMS_URL || process.env.CMS_BASE_URL || '').replace(/\/$/, '');
  if (!url) return [];
  const host = hostFromUrl(url);
  const id = host || 'default';
  return [{
    id,
    url,
    host,
    aliases: [...new Set([
      normKey(id),
      host,
      host ? `www.${host}` : '',
      'default',
      'official',
    ].filter(Boolean))],
    token: process.env.CMS_MCP_TOKEN || process.env.MCP_API_TOKEN || '',
    signingSecret: process.env.CMS_MCP_SIGNING_SECRET || process.env.MCP_SIGNING_SECRET || '',
    email: process.env.CMS_EMAIL || '',
    password: process.env.CMS_PASSWORD || '',
    totpCode: process.env.CMS_TOTP_CODE || '',
    runtime: 'php-shared',
    deployment: 'shared',
    deployPath: '',
    apiUrl: `${url}/api/v1`,
    healthcheckUrl: '',
    sshHost: '',
    sshUser: '',
    sshKeyPath: '',
    restartCommand: '',
    processManager: '',
    buildCommand: '',
  }];
}

/** @returns {SiteConfig[]} */
export function loadSites() {
  if (cachedRegistry) return cachedRegistry;

  const listRaw = (process.env.CMS_SITES || '').trim();
  /** @type {SiteConfig[]} */
  const sites = [];

  if (listRaw) {
    const ids = listRaw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      const cfg = siteFromPrefixedEnv(id);
      if (!cfg) {
        throw new Error(
          `CMS_SITES содержит «${id}», но нет CMS_SITE_${envKey(id)}_URL в mcp-cms/.env`,
        );
      }
      sites.push(cfg);
    }
  }

  // If CMS_SITES empty, fall back to legacy CMS_URL
  if (sites.length === 0) {
    const legacy = legacySingleSite();
    if (legacy.length === 0) {
      throw new Error(
        'Нет сайтов: задайте CMS_URL + CMS_MCP_TOKEN или CMS_SITES + CMS_SITE_{ID}_URL/TOKEN в mcp-cms/.env',
      );
    }
    cachedRegistry = legacy;
    return cachedRegistry;
  }

  // Optional: also register legacy CMS_URL if not already present (migration aid)
  const legacyUrl = (process.env.CMS_URL || process.env.CMS_BASE_URL || '').replace(/\/$/, '');
  if (legacyUrl) {
    const legacyHost = hostFromUrl(legacyUrl);
    const already = sites.some((s) => s.host === legacyHost || normKey(s.url) === normKey(legacyUrl));
    if (!already && sites.length === 1) {
      // Prefer explicit CMS_SITES entries; don't auto-duplicate.
    }
  }

  cachedRegistry = sites;
  return cachedRegistry;
}

/** Clear cached registry (tests / env reload). */
export function resetSitesCache() {
  cachedRegistry = null;
}

/** @returns {number} */
export function siteCount() {
  return loadSites().length;
}

/**
 * Public listing — no tokens / SSH keys / passwords.
 * @returns {Array<Record<string, unknown>>}
 */
export function listSitesPublic() {
  return loadSites().map((s) => ({
    id: s.id,
    host: s.host,
    url: s.url,
    aliases: s.aliases.filter((a) => a !== normKey(s.id)),
    runtime: s.runtime || 'php-shared',
    deployment: s.deployment || 'shared',
    deploy_path: s.deployPath || null,
    api_url: s.apiUrl || null,
    healthcheck_url: s.healthcheckUrl || null,
    process_manager: s.processManager || null,
    ssh_configured: Boolean(s.sshHost && s.sshUser),
    has_mcp_token: Boolean(s.token),
    has_signing_secret: Boolean(s.signingSecret),
  }));
}

/** Human-readable available sites for error messages. */
export function formatSitesHint() {
  return listSitesPublic()
    .map((s) => {
      const extra = s.aliases.filter((a) => a !== s.host && a !== `www.${s.host}`);
      const aliasPart = extra.length ? `, ${extra.join(', ')}` : '';
      return `${s.id} (${s.host}${aliasPart})`;
    })
    .join('; ');
}

/**
 * @param {string | undefined | null} query
 * @returns {SiteConfig}
 */
export function resolveSite(query) {
  const sites = loadSites();
  const q = normKey(query || '');

  if (!q) {
    if (sites.length === 1) return sites[0];
    throw new Error(
      `Укажите site: краткое имя или домен.\nДоступно: ${formatSitesHint()}\nСначала cms_sites или спросите пользователя.`,
    );
  }

  // 1) exact id
  const byId = sites.find((s) => normKey(s.id) === q);
  if (byId) return byId;

  // 2) alias / host / www
  const qHost = hostFromUrl(q.includes('://') ? q : `https://${q}`);
  for (const s of sites) {
    if (s.aliases.includes(q) || s.aliases.includes(qHost)) return s;
    if (s.host === q || s.host === qHost) return s;
    if (normKey(s.url) === q || normKey(s.url) === normKey(query || '')) return s;
  }

  throw new Error(
    `Неизвестный site «${query}».\nДоступно: ${formatSitesHint()}\nСначала cms_sites или спросите пользователя.`,
  );
}

/**
 * @param {string} url
 * @returns {string} API base ending with /api/v1 (or as given if already /api/)
 */
export function apiBaseFromSiteUrl(url) {
  const site = String(url || '').replace(/\/$/, '');
  if (!site) throw new Error('Пустой URL сайта');
  return site.includes('/api/')
    ? site.replace(/\/$/, '')
    : `${site}/api/v1`;
}
