<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Blog'), 'bundled Modules/Blog removed from discovery');
$pkg = jasefly_test_package_dir('blog');
assert_true(is_file($pkg . '/module.json'), 'blog module manifest exists');
assert_true(is_file($pkg . '/backend/BlogModule.php'), 'blog package entry exists');
assert_true(is_file($pkg . '/backend/BlogResourceHandler.php'), 'blog resource handler exists');

$module = (string) file_get_contents($pkg . '/backend/BlogModule.php');
assert_true(str_contains($module, 'AbstractPackageModule'), 'blog extends package module base');
assert_true(str_contains($module, 'resources()->register'), 'blog registers content resource');
assert_true(!str_contains($module, 'Controllers\\'), 'blog package does not import controllers');
assert_true(str_contains($module, 'publicList') && str_contains($module, 'publicGet'), 'blog public routes use resource API');
assert_true(str_contains($module, 'blog.post.created'), 'blog declares creation event');

$controller = (string) file_get_contents(dirname(__DIR__) . '/src/Controllers/AdminController.php');
assert_true(!str_contains($controller, "'blog' =>"), 'AdminController no longer maps blog resource');
assert_true(!str_contains($controller, 'FROM blog_posts') || str_contains($controller, 'dashboard'), 'AdminController blog SQL is dashboard debt only');
$public = (string) file_get_contents(dirname(__DIR__) . '/src/Controllers/PublicController.php');
assert_true(!str_contains($public, "function blog("), 'PublicController no longer owns blog projection');

$fe = (string) file_get_contents($pkg . '/frontend-dist/index.js');
assert_true(str_contains($fe, "type: 'blog-list'") && str_contains($fe, 'stableType: true'), 'blog FE owns frozen blog-list widget');
