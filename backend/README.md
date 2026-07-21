# Backend API

PHP 8.3 REST API for the Jasefly CMS.

## Local server

```bash
cd backend
php install.php --host=localhost --name=jasefly_cms --user=root --pass= --url=http://localhost:5173 --demo=1
php -S localhost:8080 router.php
```

## Key endpoints

- `GET /api/site` — bootstrap payload (theme, SEO, nav, hero, sections)
- `GET /api/projects`, `/api/blog`, `/api/profile`, …
- `POST /api/contact` — honeypot + rate limit + mail
- `POST /api/auth/login` — JWT access + refresh
- `GET|POST|PUT|DELETE /api/admin/*` — protected CMS operations
- `GET /api/sitemap.xml`, `/api/robots.txt`

## Storage

Writable directories under `storage/uploads`, `storage/thumbnails`, `storage/backups`.
