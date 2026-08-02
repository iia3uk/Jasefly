<?php
declare(strict_types=1);

namespace App\Modules\Demo;

final class DemoSeedService
{
    public function __construct(
        private DemoOverlayStore $store,
        private string $seedDir,
    ) {}

    public function applyToSession(string $sessionId): void
    {
        $this->store->deleteSession($sessionId);
        foreach (['pages' => 'page', 'media' => 'media', 'blog' => 'blog'] as $file => $type) {
            $path = rtrim($this->seedDir, '/\\') . DIRECTORY_SEPARATOR . $file . '.json';
            if (!is_file($path)) {
                continue;
            }
            $rows = json_decode((string) file_get_contents($path), true);
            if (!is_array($rows)) {
                continue;
            }
            foreach ($rows as $row) {
                if (!is_array($row) || !isset($row['id'])) {
                    continue;
                }
                $this->store->put($sessionId, $type, (string) $row['id'], $row);
            }
        }
        $this->store->put($sessionId, 'meta', 'bootstrap', [
            'home_page_id' => 900001,
            'nav_modes' => [
                'dashboard' => 'interactive',
                'pages' => 'interactive',
                'builder' => 'interactive',
                'blog' => 'interactive',
                'media' => 'interactive',
            ],
            'notice' => 'Demo data. Production secrets and destructive actions are unavailable.',
        ]);
    }

    public function seedDir(): string
    {
        return $this->seedDir;
    }
}
