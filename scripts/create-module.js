#!/usr/bin/env node
/** Scaffold modules-src/{slug}/ skeleton (Platform SDK) */
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
    jasefly: { min_version: '1.0.0', api_version: 1, sdk_version: 1 },
    php: { min_version: '8.1', extensions: [] },
    dependencies: { required: { system: '>=1.0.0' }, optional: {}, conflicts: {} },
    capabilities: {
      requires: ['http.client', 'permissions.check'],
      provides: [],
    },
    entrypoints: {
      backend: `backend/${studly}Module.php`,
      frontend_manifest: 'frontend-dist/manifest.json',
    },
    migrations: { path: 'migrations', namespace: slug, uninstall_path: 'migrations/uninstall' },
    permissions: [`${slug}.view`],
    install: { preserve_data_on_uninstall: true, allow_downgrade: false },
    hooks: { after_install: 'hooks/PostInstallHook.php' },
  },
  [`backend/${studly}Module.php`]: `<?php
declare(strict_types=1);

namespace App\\PackageModules\\${studly};

use App\\Platform\\Contracts\\PlatformRequestInterface;
use App\\Platform\\Package\\AbstractPackageModule;
use App\\Platform\\Package\\PlatformResponse;
use App\\Platform\\PlatformContext;

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

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);
        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];
        $http->get('/admin/${slug}/ping', static function (PlatformRequestInterface $r) use ($perms) {
            $perms->require($r->user() ?? [], '${slug}.view');
            PlatformResponse::json(['data' => [
                'ok' => true,
                'module' => '${slug}',
                'message' => 'pong',
                'time' => gmdate(DATE_ATOM),
            ]]);
        }, $protected);
    }
}
`,
  'hooks/PostInstallHook.php': `<?php
declare(strict_types=1);

namespace App\\PackageModules\\${studly}\\Hooks;

use App\\Platform\\Package\\ModuleHookInterface;
use App\\Platform\\Package\\PlatformInstallContextInterface;

final class PostInstallHook implements ModuleHookInterface
{
    public function run(PlatformInstallContextInterface $context): void
    {
        $marker = $context->storagePath('post_install.marker');
        @file_put_contents(
            $marker,
            gmdate(DATE_ATOM) . ' ${slug} after_install v' . $context->version() . PHP_EOL,
            FILE_APPEND
        );
        $context->log('PostInstallHook executed');
    }
}
`,
  'migrations/001_init.sql': `-- ${slug} schema\nCREATE TABLE IF NOT EXISTS \`${slug.replace(/-/g, '_')}_meta\` (\n  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,\n  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`,
  'migrations/uninstall/001_drop.sql': `-- Uninstall ${slug}\nDROP TABLE IF EXISTS \`${slug.replace(/-/g, '_')}_meta\`;\n`,
  'frontend-dist/manifest.json': {
    slug,
    version: '1.0.0',
    entry: 'index.js',
    assets: { js: ['index.js'], css: [] },
  },
  'frontend-dist/index.js': `export default {
  slug: '${slug}',
  version: '1.0.0',
  sdkVersion: 1,
  async register(ctx) {
    const nav = {
      group: 'Модули',
      path: '/admin/${slug}',
      label: '${studly}',
      permission: '${slug}.view',
    }
    const page = {
      path: '${slug}',
      label: '${studly}',
      group: 'Модули',
      permission: '${slug}.view',
    }
    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(nav)
      ctx.admin.registerPage(page)
    } else {
      ctx.registerAdminNavItem?.(nav)
      ctx.registerAdminRoute?.(page)
    }
  },
  async unregister() {
    /* host gates pages by module enable */
  },
};
`,
  'README.md': `# ${studly}

Scaffolded with Platform SDK (\`node scripts/create-module.js ${slug}\`).

Docs: \`docs/platform/MODULE-DEVELOPMENT.md\`, \`docs/platform/SDK-CERTIFICATION.md\`

Validate & certify:

\`\`\`bash
node scripts/validate-module.js ${slug}
php backend/bin/sdk.php certify modules-src/${slug}
node scripts/build-module.js ${slug} --yes
\`\`\`
`,
}

for (const [rel, content] of Object.entries(files)) {
  const abs = path.join(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n'
  fs.writeFileSync(abs, body)
}

console.log('Created', dir)
console.log('Next: implement logic, certify, then node scripts/build-module.js', slug, '--yes')
