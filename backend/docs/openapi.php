<?php
declare(strict_types=1);

/** Lightweight API documentation for /api/v1/docs */
return [
    'version' => 'v1',
    'base_url' => '/api/v1',
    'response_format' => [
        'success' => 'boolean',
        'data' => 'mixed|null',
        'error' => 'string|null',
        'meta' => ['api_version' => 'v1'],
    ],
    'endpoints' => [
        ['GET', '/health', 'Health check'],
        ['GET', '/site', 'Site bootstrap payload'],
        ['GET', '/profile', 'Profile'],
        ['GET', '/projects', 'List published projects'],
        ['GET', '/projects/{slug}', 'Project by slug (301 redirect on old slug)'],
        ['GET', '/blog', 'List published posts'],
        ['GET', '/blog/{slug}', 'Post by slug (301 redirect on old slug)'],
        ['GET', '/pages/{slug}', 'Page by slug'],
        ['POST', '/contact', 'Contact form submission'],
        ['POST', '/auth/login', 'Authenticate'],
        ['GET', '/auth/me', 'Current user (auth)'],
        ['GET', '/admin/dashboard', 'Dashboard stats (auth)'],
        ['GET', '/admin/search?q=', 'Global admin search (auth)'],
        ['GET', '/admin/trash', 'List trashed items (auth)'],
        ['POST', '/admin/trash/{resource}/{id}/restore', 'Restore item (auth)'],
        ['DELETE', '/admin/trash/{resource}/{id}?confirm=1', 'Permanently delete (auth)'],
        ['POST', '/admin/trash/{resource}/empty?confirm=1', 'Empty resource trash (auth)'],
        ['POST', '/admin/trash/empty-all?confirm=1', 'Empty all trash (auth)'],
        ['GET', '/admin/activity', 'Activity log (auth)'],
        ['GET', '/admin/system/status', 'System health (auth)'],
        ['GET', '/admin/media/unused', 'Unused media detection (auth)'],
        ['POST', '/admin/media/{id}/replace', 'Replace file keeping ID (auth)'],
        ['GET|POST|PUT|DELETE', '/admin/{resource}', 'CRUD for CMS resources (auth)'],
    ],
    'soft_delete_resources' => array_keys(\App\Services\SoftDeleteService::TRASHABLE),
    'roles' => ['super_admin', 'admin', 'editor'],
];
