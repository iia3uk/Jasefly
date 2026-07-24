<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

final class MediaService
{
    public function __construct(private Database $db, private array $app) {}

    public function upload(array $file, ?int $folderId = null, ?string $alt = null, ?string $caption = null): array
    {
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new \RuntimeException('Upload failed');
        }
        if (($file['size'] ?? 0) > $this->app['upload_max_mb'] * 1048576) {
            throw new \RuntimeException('File too large');
        }
        // Reject path traversal / overly long original names.
        $originalName = (string) ($file['name'] ?? '');
        if (strpbrk($originalName, "/\\\0") !== false || strlen($originalName) > 255) {
            throw new \RuntimeException('Invalid filename');
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: '';
        $clientExt = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $mime = $this->normalizeUploadMime($mime, $clientExt);
        $allowed = $this->allowedUploadTypes();
        if (!isset($allowed[$mime])) {
            throw new \RuntimeException('Unsupported file type');
        }
        $canonicalExt = $allowed[$mime];
        // Cross-validate extension (aliases: jpeg↔jpg, etc.)
        $extAliases = $this->extensionAliases($canonicalExt);
        if ($clientExt !== '' && !in_array($clientExt, $extAliases, true)) {
            throw new \RuntimeException('File extension does not match its content type');
        }

        $folderSlug = $this->folderSlug($folderId);
        [$pathRel, $filename, $width, $height, $thumbRel, $webpRel] = $this->storeFile($file, $mime, $canonicalExt, $folderSlug);

        $this->db->run(
            'INSERT INTO media(folder_id, filename, original_name, mime_type, extension, size_bytes, width, height, alt_text, caption, path, thumbnail_path, webp_path, uploaded_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
            [
                $folderId,
                $filename,
                $file['name'],
                $mime,
                $canonicalExt,
                (int) $file['size'],
                $width,
                $height,
                $alt,
                $caption,
                $pathRel,
                $thumbRel,
                $webpRel,
            ]
        );

        return $this->db->one('SELECT * FROM media WHERE id=?', [$this->db->id()]);
    }

    /** Replace file bytes while preserving media ID and all references. */
    public function replace(int $id, array $file, ?string $alt = null, ?string $caption = null): array
    {
        $existing = $this->db->one('SELECT * FROM media WHERE id=?', [$id]);
        if (!$existing) {
            throw new \RuntimeException('Media not found');
        }
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new \RuntimeException('Upload failed');
        }

        $this->removeFiles($existing);

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: '';
        $clientExt = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
        $mime = $this->normalizeUploadMime($mime, $clientExt);
        $allowed = $this->allowedUploadTypes();
        if (!isset($allowed[$mime])) {
            throw new \RuntimeException('Unsupported file type');
        }
        $canonicalExt = $allowed[$mime];
        $extAliases = $this->extensionAliases($canonicalExt);
        if ($clientExt !== '' && !in_array($clientExt, $extAliases, true)) {
            throw new \RuntimeException('File extension does not match its content type');
        }

        $folderSlug = $this->folderSlug(
            isset($existing['folder_id']) && $existing['folder_id'] !== null && $existing['folder_id'] !== ''
                ? (int) $existing['folder_id']
                : null
        );
        [$pathRel, $filename, $width, $height, $thumbRel, $webpRel] = $this->storeFile($file, $mime, $canonicalExt, $folderSlug);

        $this->db->run(
            'UPDATE media SET filename=?, original_name=?, mime_type=?, extension=?, size_bytes=?, width=?, height=?,
             alt_text=COALESCE(?, alt_text), caption=COALESCE(?, caption), path=?, thumbnail_path=?, webp_path=?,
             replaced_at=NOW(), deleted_at=NULL WHERE id=?',
            [
                $filename, $file['name'], $mime, $canonicalExt, (int) $file['size'], $width, $height,
                $alt, $caption, $pathRel, $thumbRel, $webpRel, $id,
            ]
        );

        return $this->db->one('SELECT * FROM media WHERE id=?', [$id]);
    }

    public function delete(int $id): void
    {
        $media = $this->db->one('SELECT * FROM media WHERE id=?', [$id]);
        if (!$media) {
            return;
        }
        $this->removeFiles($media);
        $this->db->run('DELETE FROM media WHERE id=?', [$id]);
    }

    public function absoluteUploadPath(array $media): string
    {
        return $this->app['storage'] . '/uploads/' . ($media['path'] ?? '');
    }

    public function existsOnDisk(array $media): bool
    {
        $path = $this->absoluteUploadPath($media);
        return $path !== '' && is_file($path);
    }

    /** @return array{missing:bool}|array */
    public function withDiskStatus(array $media): array
    {
        $media['missing'] = !$this->existsOnDisk($media);
        return $media;
    }

    /** @return list<array> */
    public function findMissing(?bool $onlyActive = true): array
    {
        $soft = new SoftDeleteService($this->db);
        $sql = 'SELECT * FROM media WHERE 1=1';
        if ($onlyActive) {
            $sql .= ' AND ' . $soft->notDeletedClause('media');
        }
        $sql .= ' ORDER BY id DESC';
        $out = [];
        foreach ($this->db->all($sql) as $row) {
            if (!$this->existsOnDisk($row)) {
                $out[] = $this->withDiskStatus($row);
            }
        }
        return $out;
    }

    /**
     * Remove DB rows (and leftover thumbs/webp) for files that no longer exist on disk.
     * @return array{removed:int, ids:list<int>}
     */
    public function purgeMissing(): array
    {
        $ids = [];
        foreach ($this->findMissing(false) as $row) {
            $id = (int) $row['id'];
            $this->removeFiles($row);
            $this->db->run('DELETE FROM media WHERE id=?', [$id]);
            $ids[] = $id;
        }
        return ['removed' => count($ids), 'ids' => $ids];
    }

    public function stream(int $id, bool $allowPrivate = false): never
    {
        $soft = new SoftDeleteService($this->db);
        $alive = $soft->notDeletedClause('media');
        $media = $this->db->one("SELECT * FROM media WHERE id=? AND {$alive}", [$id]);
        $path = $media ? $this->absoluteUploadPath($media) : '';
        if (!$media || !is_file($path)) {
            http_response_code(404);
            exit;
        }

        if (!$allowPrivate) {
            $usage = new MediaUsageService($this->db);
            if (!$usage->isPubliclyAccessible($id)) {
                http_response_code(403);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode([
                    'success' => false,
                    'error' => 'Forbidden',
                    'message' => 'Этот файл недоступен по прямой ссылке',
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        $isPublic = (new MediaUsageService($this->db))->isPubliclyAccessible($id);
        header('Content-Type: ' . $media['mime_type']);
        header('Content-Length: ' . (string) filesize($path));
        header('Cache-Control: ' . ($isPublic
            ? 'public, max-age=31536000, immutable'
            : 'private, no-store'));
        header('X-Content-Type-Options: nosniff');
        // Harden SVG delivery: no scripts/network from the document itself.
        if (($media['mime_type'] ?? '') === 'image/svg+xml' || str_ends_with(strtolower((string) ($media['path'] ?? '')), '.svg')) {
            header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
        }
        readfile($path);
        exit;
    }

    /** @return array<string, string> mime => canonical extension */
    private function allowedUploadTypes(): array
    {
        return [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'image/avif' => 'avif',
            'image/svg+xml' => 'svg',
            'image/x-icon' => 'ico',
            'image/vnd.microsoft.icon' => 'ico',
            'image/bmp' => 'bmp',
            'image/x-ms-bmp' => 'bmp',
            'application/pdf' => 'pdf',
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
        ];
    }

    /** @return list<string> */
    private function extensionAliases(string $canonicalExt): array
    {
        return match ($canonicalExt) {
            'jpg' => ['jpg', 'jpeg', 'jpe'],
            'ico' => ['ico'],
            'bmp' => ['bmp'],
            default => [$canonicalExt],
        };
    }

    private function normalizeUploadMime(string $mime, string $clientExt): string
    {
        // Some clients / finfo variants.
        if ($mime === 'image/jpg') {
            return 'image/jpeg';
        }
        // SVG often sniffed as xml/text; trust .svg extension only for those families.
        if (
            in_array($mime, ['text/xml', 'application/xml', 'text/plain', 'text/html'], true)
            && $clientExt === 'svg'
        ) {
            return 'image/svg+xml';
        }
        if ($mime === 'image/ico' || ($mime === 'application/octet-stream' && $clientExt === 'ico')) {
            return 'image/x-icon';
        }
        return $mime;
    }

    /** Strip obvious script vectors from SVG before storing. */
    private function sanitizeSvgFile(string $absolutePath): void
    {
        $raw = @file_get_contents($absolutePath);
        if ($raw === false || $raw === '') {
            return;
        }
        $clean = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $raw) ?? $raw;
        $clean = preg_replace('#<foreignObject\b[^>]*>.*?</foreignObject>#is', '', $clean) ?? $clean;
        $clean = preg_replace('#\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $clean) ?? $clean;
        $clean = preg_replace('#javascript\s*:#i', '', $clean) ?? $clean;
        $clean = preg_replace('#data:\s*text/html#i', 'data:text/plain', $clean) ?? $clean;
        @file_put_contents($absolutePath, $clean);
    }

    private function folderSlug(?int $folderId): ?string
    {
        if (!$folderId) {
            return null;
        }
        $folder = $this->db->one('SELECT slug FROM media_folders WHERE id=?', [$folderId]);
        $slug = $folder['slug'] ?? null;
        if ($slug) {
            $this->ensurePhysicalFolder((string) $slug);
        }
        return $slug ? (string) $slug : null;
    }

    private function storeFile(array $file, string $mime, string $ext, ?string $folderSlug = null): array
    {
        $this->ensureUploadsHardening();
        // Grouped folders on disk: storage/uploads/folders/{slug}/…
        // Uncategorized keeps dated dump: storage/uploads/YYYY/MM/…
        $sub = $folderSlug ? ('folders/' . trim($folderSlug, '/')) : date('Y/m');
        $dir = $this->app['storage'] . "/uploads/$sub";
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Could not create upload directory');
        }

        $filename = bin2hex(random_bytes(16)) . '.' . $ext;
        $absolute = "$dir/$filename";
        if (!move_uploaded_file($file['tmp_name'], $absolute)) {
            throw new \RuntimeException('Could not save upload');
        }

        if ($mime === 'image/svg+xml' || $ext === 'svg') {
            $this->sanitizeSvgFile($absolute);
        }

        $width = $height = null;
        $thumbRel = $webpRel = null;

        if (str_starts_with($mime, 'image/') && $mime !== 'image/svg+xml' && $ext !== 'svg' && $ext !== 'ico') {
            $info = @getimagesize($absolute);
            if ($info) {
                [$width, $height] = $info;
            }
            $thumbDir = $this->app['storage'] . "/thumbnails/$sub";
            if (!is_dir($thumbDir)) {
                mkdir($thumbDir, 0755, true);
            }
            $thumbName = pathinfo($filename, PATHINFO_FILENAME) . '.jpg';
            if (ImageService::thumbnail($absolute, "$thumbDir/$thumbName")) {
                $thumbRel = "$sub/$thumbName";
            }
            $webpPath = "$dir/" . pathinfo($filename, PATHINFO_FILENAME) . '.webp';
            if ($ext !== 'webp' && $ext !== 'avif' && ImageService::toWebp($absolute, $webpPath)) {
                $webpRel = "$sub/" . basename($webpPath);
            }
        }

        return ["$sub/$filename", $filename, $width, $height, $thumbRel, $webpRel];
    }

    public function ensurePhysicalFolder(string $slug): void
    {
        $slug = trim($slug, '/');
        if ($slug === '') {
            return;
        }
        foreach (['uploads', 'thumbnails'] as $root) {
            $dir = $this->app['storage'] . "/$root/folders/$slug";
            if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
                throw new \RuntimeException('Could not create media folder on disk');
            }
        }
    }

    /** Ensure uploads/.htaccess disables PHP execution (defense in depth). */
    private function ensureUploadsHardening(): void
    {
        $ht = $this->app['storage'] . '/uploads/.htaccess';
        if (is_file($ht)) {
            return;
        }
        $body = <<<'HT'
# Deny directory listing and PHP execution in uploads.
Options -Indexes -ExecCGI
<IfModule mod_php.c>
  php_flag engine off
</IfModule>
<IfModule mod_php7.c>
  php_flag engine off
</IfModule>
<IfModule mod_php8.c>
  php_flag engine off
</IfModule>
<IfModule mod_mime.c>
  RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .cgi .pl .py
  RemoveType .php .phtml .php3 .php4 .php5 .php7 .php8 .phar
  AddType text/plain .php .phtml .php3 .php4 .php5 .php7 .php8 .phar
</IfModule>
<FilesMatch "\.(?i:php|phtml|php[3-8]|phar|cgi|pl|py|exe|sh)$">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
  <IfModule !mod_authz_core.c>
    Deny from all
  </IfModule>
</FilesMatch>
HT;
        @file_put_contents($ht, $body);
    }

    private function removeFiles(array $media): void
    {
        @unlink($this->app['storage'] . '/uploads/' . $media['path']);
        if (!empty($media['thumbnail_path'])) {
            @unlink($this->app['storage'] . '/thumbnails/' . $media['thumbnail_path']);
        }
        if (!empty($media['webp_path'])) {
            @unlink($this->app['storage'] . '/uploads/' . $media['webp_path']);
        }
    }
}
