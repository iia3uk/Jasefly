<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Projects'), 'bundled Modules/Projects removed from discovery');
$pkg = jasefly_test_package_dir('projects');
assert_true(is_file($pkg . '/module.json'), 'projects module manifest exists');
assert_true(is_file($pkg . '/backend/ProjectsModule.php'), 'projects package entry exists');
assert_true(is_file($pkg . '/backend/ProjectResourceHandler.php'), 'projects resource handler exists');
assert_true(is_file($pkg . '/backend/ProjectCategoryResourceHandler.php'), 'project categories handler exists');

$module = (string) file_get_contents($pkg . '/backend/ProjectsModule.php');
assert_true(str_contains($module, 'AbstractPackageModule'), 'projects extends package module base');
assert_true(str_contains($module, 'registersRoutesWhenDisabled'), 'projects retains soft-route registration');
assert_true(substr_count($module, 'resources()->register') >= 2, 'projects registers project and category resources');
assert_true(str_contains($module, "publicList('projects") && str_contains($module, "publicGet('projects"), 'projects public routes use resource API');
assert_true(!str_contains($module, 'Controllers\\'), 'projects package does not import controllers');

$public = (string) file_get_contents(dirname(__DIR__) . '/src/Controllers/PublicController.php');
assert_true(!str_contains($public, "function projects("), 'PublicController no longer owns projects projection');
$content = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Content/ContentModule.php');
assert_true(!str_contains($content, "'/projects'"), 'ContentModule no longer wires /projects routes');

$fe = (string) file_get_contents($pkg . '/frontend-dist/index.js');
assert_true(str_contains($fe, "type: 'projects-grid'") && str_contains($fe, 'stableType: true'), 'projects FE owns frozen projects-grid widget');
