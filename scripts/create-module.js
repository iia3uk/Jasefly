#!/usr/bin/env node
/** Scaffold modules-src/{slug}/ skeleton */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const slug = process.argv[2]
if (!slug || !/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
  console.error('Usage: node scripts/create-module.js <slug>')
  process.exit(1)
}

const studly = slug.split(/[-_]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
const dir = path.join(root, 'modules-src', slug)
if (fs.existsSync(dir)) {
  console.error('Already exists:', dir)
  process.exit(1)
}

const files = {
  'module.json': {
    schema_version: 1,
    type: 'jasefly-module',
    name: studly,
    slug,
    version: '1.0.0',
    description: `${studly} module`,
    author: { name: 'Jasefly CMS', url: 'https://jasefly.com' },
    license: 'proprietary',
    jasefly: { min_version: '1.0.0', api_version: 1 },
    php: { min_version: '8.1', extensions: [] },
    dependencies: { required: { system: '>=1.0.0' }, optional: {}, conflicts: {} },
    entrypoints: {
      backend: `backend/${studly}Module.php`,
      frontend_manifest: 'frontend-dist/manifest.json',
    },
    migrations: { path: 'migrations', namespace: slug },
    permissions: [`${slug}.view`],
    install: { preserve_data_on_uninstall: true, allow_downgrade: false },
  },
  [`backend/${studly}Module.php`]: `<?php
declare(strict_types=1);

namespace App\\PackageModules\\${studly};

use App\\Core\\Modules\\AbstractPackageModule;
use App\\Database;
use App\\Middleware\\AuthMiddleware;
use App\\Middleware\\PermissionMiddleware;
use App\\Request;
use App\\Response;
use App\\Router;
use App\\Services\\PermissionService;

final class ${studly}Module extends AbstractPackageModule
{
    public function name(): string { return '${slug}'; }
    public function label(): string { return '${studly}'; }
    public function priority(): int { return 80; }

    public function adminNav(): array
    {
        return [[
            'group' => 'Модули',
            'path' => '/admin/${slug}',
            'label' => '${studly}',
            'permission' => '${slug}.view',
        ]];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];
        $router->get($p('/admin/${slug}/ping'), function (Request $r) {
            Response::json(['data' => ['ok' => true, 'module' => '${slug}']]);
        }, $protected);
    }
}
`,
  'migrations/001_init.sql': `-- ${slug} schema\nCREATE TABLE IF NOT EXISTS \`${slug.replace(/-/g, '_')}_meta\` (\n  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,\n  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`,
  'frontend-dist/manifest.json': {
    slug,
    version: '1.0.0',
    entry: 'index.js',
    assets: { js: ['index.js'], css: [] },
  },
  'frontend-dist/index.js': `export default {
  slug: '${slug}',
  version: '1.0.0',
  async register(ctx) {
    console.info('[${slug}] frontend module registered', ctx.slug);
  },
};
`,
  'frontend/src/index.ts': `import type { JaseflyFrontendModule } from '@/core/packageModuleTypes'

const mod: JaseflyFrontendModule = {
  slug: '${slug}',
  version: '1.0.0',
  async register(ctx) {
    console.info('[${slug}] register', ctx.version)
  },
}
export default mod
`,
  'README.md': `# ${studly}\n\nScaffolded with \`node scripts/create-module.js ${slug}\`.\n\nBuild: \`node scripts/build-module.js ${slug} --yes\`\n`,
}

for (const [rel, content] of Object.entries(files)) {
  const abs = path.join(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n'
  fs.writeFileSync(abs, body)
}

console.log('Created', dir)
console.log('Next: implement logic, then node scripts/build-module.js', slug, '--yes')
