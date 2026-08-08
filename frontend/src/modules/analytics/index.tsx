/**
 * Analytics FE moved to installable package: modules-src/analytics/frontend-dist.
 * Host loads it via packageModuleLoader when the package is enabled.
 * Admin UI remains host-bound via provideHostAdminPage (analytics.admin).
 * Beacon mounts via host slot site.body.end (no static SiteLayout import).
 */
export {}
