-- Link blog posts to portfolio projects (admin content linking)
ALTER TABLE `blog_posts`
  ADD COLUMN `project_id` INT UNSIGNED NULL DEFAULT NULL AFTER `category_id`;

CREATE INDEX `idx_blog_posts_project` ON `blog_posts` (`project_id`);
