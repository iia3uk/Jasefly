/**
 * Match PHP PublicApiRegistry::exportManifest + CapabilityRegistry list/dump.
 */
import type { Database } from '../db/Database.js';

const SDK_CURRENT = 2;
const SDK_SUPPORTED = [1, 2];
const SDK_STABILITY: Record<number, string> = { 1: 'stable', 2: 'current' };

const CORE_CAP_DEFAULTS = [
  'mail.send',
  'scheduler.jobs',
  'storage.files',
  'builder.widgets',
  'builder.inspector',
  'notifications.send',
  'media.library',
  'users.roles',
  'events.publish',
  'events.subscribe',
  'http.client',
  'settings.global',
  'settings.module',
  'analytics.events',
  'permissions.check',
  'content.pages',
  'admin.pages',
  'public.routes',
  'api.routes',
  'users.current',
  'access.service',
] as const;

const PUBLIC_APIS = [
  'PlatformDatabaseInterface',
  'PlatformStorageInterface',
  'PlatformEventsInterface',
  'PlatformSchedulerInterface',
  'PlatformJobsInterface',
  'PlatformMailInterface',
  'PlatformNotificationsInterface',
  'PlatformSettingsInterface',
  'PlatformPermissionsInterface',
  'PlatformUsersInterface',
  'PlatformMediaInterface',
  'PlatformHttpInterface',
  'PlatformCacheInterface',
  'PlatformLoggerInterface',
  'PlatformConfigInterface',
  'PlatformTranslationsInterface',
  'PlatformAssetsInterface',
  'PlatformHealthInterface',
  'PlatformContentInterface',
  'PlatformBuilderInterface',
  'PlatformCapabilitiesInterface',
  'PlatformAccessInterface',
  'PlatformRequestInterface',
].map((c) => ({
  id: `App\\Platform\\Contracts\\${c}`,
  kind: 'contract',
  version: SDK_CURRENT,
}));

PUBLIC_APIS.push(
  { id: 'App\\Platform\\PlatformContext', kind: 'context', version: SDK_CURRENT },
  {
    id: 'App\\Platform\\Manifest\\PlatformModuleManifestInterface',
    kind: 'manifest',
    version: SDK_CURRENT,
  },
  { id: 'App\\Platform\\Package\\AbstractPackageModule', kind: 'base', version: SDK_CURRENT },
  {
    id: 'App\\Platform\\Package\\PlatformInstallContextInterface',
    kind: 'hook_context',
    version: SDK_CURRENT,
  },
  { id: 'frontend/src/platform', kind: 'frontend_sdk', version: SDK_CURRENT },
);

const PUBLIC_CATALOG: Record<string, string> = {
  db: 'App\\Platform\\Contracts\\PlatformDatabaseInterface',
  database: 'App\\Platform\\Contracts\\PlatformDatabaseInterface',
  storage: 'App\\Platform\\Contracts\\PlatformStorageInterface',
  events: 'App\\Platform\\Contracts\\PlatformEventsInterface',
  scheduler: 'App\\Platform\\Contracts\\PlatformSchedulerInterface',
  mail: 'App\\Platform\\Contracts\\PlatformMailInterface',
  notifications: 'App\\Platform\\Contracts\\PlatformNotificationsInterface',
  settings: 'App\\Platform\\Contracts\\PlatformSettingsInterface',
  permissions: 'App\\Platform\\Contracts\\PlatformPermissionsInterface',
  users: 'App\\Platform\\Contracts\\PlatformUsersInterface',
  media: 'App\\Platform\\Contracts\\PlatformMediaInterface',
  builder: 'App\\Platform\\Contracts\\PlatformBuilderInterface',
  http: 'App\\Platform\\Contracts\\PlatformHttpInterface',
  cache: 'App\\Platform\\Contracts\\PlatformCacheInterface',
  logger: 'App\\Platform\\Contracts\\PlatformLoggerInterface',
  config: 'App\\Platform\\Contracts\\PlatformConfigInterface',
  translations: 'App\\Platform\\Contracts\\PlatformTranslationsInterface',
  assets: 'App\\Platform\\Contracts\\PlatformAssetsInterface',
  health: 'App\\Platform\\Contracts\\PlatformHealthInterface',
  content: 'App\\Platform\\Contracts\\PlatformContentInterface',
  capabilities: 'App\\Platform\\Contracts\\PlatformCapabilitiesInterface',
  features: 'App\\Platform\\Manifest\\FeatureFlags',
  access: 'App\\Platform\\Contracts\\PlatformAccessInterface',
};

const CAP_MAP: Record<string, string | null> = {
  mail: 'mail.send',
  notifications: 'notifications.send',
  media: 'media.library',
  scheduler: 'scheduler.jobs',
  storage: 'storage.files',
  events: 'events.publish',
  http: 'http.client',
  settings: 'settings.module',
  permissions: 'permissions.check',
  users: 'users.current',
  builder: 'builder.widgets',
  content: 'content.pages',
  db: null,
  database: null,
  cache: null,
  logger: null,
  config: null,
  translations: null,
  assets: null,
  health: null,
  capabilities: null,
  features: null,
};

type CapRow = { provider: string; module_slug: string | null; priority: number };

export async function capabilityReport(db: Database): Promise<{
  capabilities: string[];
  providers: Record<string, CapRow[]>;
}> {
  const memory: Record<string, CapRow[]> = {};
  if (await db.tableExists('platform_capabilities')) {
    const cols = await db.columns('platform_capabilities');
    const active = cols.includes('is_active') ? ' WHERE is_active=1' : '';
    const rows = await db.all(
      `SELECT capability, provider, module_slug, priority FROM platform_capabilities${active}`,
    );
    for (const row of rows) {
      const cap = String(row.capability);
      memory[cap] ??= [];
      memory[cap].push({
        provider: String(row.provider),
        module_slug: row.module_slug != null ? String(row.module_slug) : null,
        priority: Number(row.priority ?? 100),
      });
    }
  }
  for (const cap of CORE_CAP_DEFAULTS) {
    if (!memory[cap]?.length) {
      memory[cap] = [
        {
          provider: `core.${cap.split('.')[0]}`,
          module_slug: null,
          priority: 100,
        },
      ];
    }
  }
  return {
    capabilities: Object.keys(memory),
    providers: memory,
  };
}

export function exportSdkManifest(): Record<string, unknown> {
  const public_services: Record<string, { contract: string; sdk_version: number; capability: string | null }> =
    {};
  for (const [id, contract] of Object.entries(PUBLIC_CATALOG)) {
    public_services[id] = {
      contract,
      sdk_version: SDK_CURRENT,
      capability: CAP_MAP[id] ?? null,
    };
  }
  return {
    name: 'jasefly-platform-sdk',
    sdk_version: SDK_CURRENT,
    supported_sdk_versions: SDK_SUPPORTED,
    stability: SDK_STABILITY,
    api_version: 1,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'),
    public_apis: PUBLIC_APIS,
    public_services,
    capabilities: [
      'access.service',
      'mail.send',
      'scheduler.jobs',
      'storage.files',
      'builder.widgets',
      'builder.inspector',
      'notifications.send',
      'media.library',
      'users.roles',
      'events.publish',
      'events.subscribe',
      'http.client',
      'settings.global',
      'settings.module',
      'analytics.events',
      'permissions.check',
      'content.pages',
      'admin.pages',
      'public.routes',
      'api.routes',
      'users.current',
    ],
    feature_flags: {
      'builder.widgets': true,
      'builder.inspector': true,
      'builder.toolbar': true,
      'admin.dashboard_cards': true,
      'admin.search_providers': true,
      'public.routes': true,
      'events.delay': true,
      'scheduler.jobs': true,
      'sdk.v2': true,
      'capabilities.resolve': true,
    },
  };
}
