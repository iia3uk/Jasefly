-- Page builder: Elementor-like layout document on pages
ALTER TABLE pages ADD COLUMN layout_json LONGTEXT NULL AFTER content;
ALTER TABLE pages ADD COLUMN is_home TINYINT(1) NOT NULL DEFAULT 0 AFTER template;

CREATE INDEX idx_pages_is_home ON pages (is_home);

-- System home page (layout filled on first builder open / migrate)
INSERT INTO pages (title, slug, status, template, is_home)
SELECT 'Главная', '__home', 'published', 'builder', 1
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE is_home = 1 LIMIT 1);
