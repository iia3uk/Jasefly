<?php
declare(strict_types=1);

namespace App\Platform\Manifest;

use App\Platform\SdkVersion;

/**
 * Registry of public Platform SDK surfaces for export-sdk / reports.
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
        ];
        $out = [];
        foreach ($contracts as $c) {
            $out[] = ['id' => 'App\\Platform\\Contracts\\' . $c, 'kind' => 'contract', 'version' => SdkVersion::CURRENT];
        }
        $out[] = ['id' => 'App\\Platform\\PlatformContext', 'kind' => 'context', 'version' => SdkVersion::CURRENT];
        $out[] = ['id' => 'App\\Platform\\Package\\AbstractPackageModule', 'kind' => 'base', 'version' => SdkVersion::CURRENT];
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
            'api_version' => 1,
            'generated_at' => gmdate(DATE_ATOM),
            'public_apis' => $this->listApis(),
            'capabilities' => [
                'mail.send', 'scheduler.jobs', 'storage.files', 'builder.widgets', 'builder.inspector',
                'notifications.send', 'media.library', 'users.roles', 'events.publish', 'events.subscribe',
                'http.client', 'settings.global', 'analytics.events', 'permissions.check', 'content.pages',
            ],
            'feature_flags' => (new FeatureFlags())->all(),
        ];
    }
}
