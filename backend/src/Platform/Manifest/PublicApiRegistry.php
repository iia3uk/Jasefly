<?php
declare(strict_types=1);

namespace App\Platform\Manifest;

use App\Platform\Capabilities\ServiceRegistry;
use App\Platform\SdkVersion;

/**
 * Registry of public Platform SDK surfaces for export-sdk / reports / snapshots.
 */
final class PublicApiRegistry
{
    /** @return list<array{id:string, kind:string, version:int}> */
    public function listApis(): array
    {
        $contracts = [
            'PlatformDatabaseInterface', 'PlatformStorageInterface', 'PlatformEventsInterface',
            'PlatformSchedulerInterface', 'PlatformJobsInterface', 'PlatformMailInterface',
            'PlatformNotificationsInterface', 'PlatformSettingsInterface', 'PlatformPermissionsInterface',
            'PlatformUsersInterface', 'PlatformMediaInterface', 'PlatformHttpInterface',
            'PlatformCacheInterface', 'PlatformLoggerInterface', 'PlatformConfigInterface',
            'PlatformTranslationsInterface', 'PlatformAssetsInterface', 'PlatformHealthInterface',
            'PlatformContentInterface', 'PlatformBuilderInterface', 'PlatformCapabilitiesInterface',
            'PlatformAccessInterface', 'PlatformRequestInterface',
        ];
        $out = [];
        foreach ($contracts as $c) {
            $out[] = ['id' => 'App\\Platform\\Contracts\\' . $c, 'kind' => 'contract', 'version' => SdkVersion::CURRENT];
        }
        $out[] = ['id' => 'App\\Platform\\PlatformContext', 'kind' => 'context', 'version' => SdkVersion::CURRENT];
        $out[] = ['id' => 'App\\Platform\\Manifest\\PlatformModuleManifestInterface', 'kind' => 'manifest', 'version' => SdkVersion::CURRENT];
        $out[] = ['id' => 'App\\Platform\\Package\\AbstractPackageModule', 'kind' => 'base', 'version' => SdkVersion::CURRENT];
        $out[] = ['id' => 'App\\Platform\\Package\\PlatformInstallContextInterface', 'kind' => 'hook_context', 'version' => SdkVersion::CURRENT];
        $out[] = ['id' => 'frontend/src/platform', 'kind' => 'frontend_sdk', 'version' => SdkVersion::CURRENT];
        return $out;
    }

    /** @return array<string, mixed> */
    public function exportManifest(): array
    {
        return [
            'name' => 'jasefly-platform-sdk',
            'sdk_version' => SdkVersion::CURRENT,
            'supported_sdk_versions' => SdkVersion::SUPPORTED,
            'stability' => SdkVersion::STABILITY,
            'api_version' => 1,
            'generated_at' => gmdate(DATE_ATOM),
            'public_apis' => $this->listApis(),
            'public_services' => ServiceRegistry::catalog(),
            'capabilities' => [
                'access.service', 'mail.send', 'scheduler.jobs', 'storage.files', 'builder.widgets', 'builder.inspector',
                'notifications.send', 'media.library', 'users.roles', 'events.publish', 'events.subscribe',
                'http.client', 'settings.global', 'settings.module', 'analytics.events', 'permissions.check',
                'content.pages', 'content.resources', 'admin.pages', 'public.routes', 'api.routes', 'users.current',
            ],
            'feature_flags' => (new FeatureFlags())->all(),
        ];
    }
}
