/**
 * Regenerate contract governance snapshot JSON files (MCP tools, widgets, caps, perms, events).
 * Run: node backend/tests/gen-contract-snapshots.js
 * Then for API surface: php backend/bin/sdk.php api-snapshot
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')

function writeJson(rel, data) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log('wrote', rel)
}

// MCP tools
{
  const src = fs.readFileSync(path.join(root, 'mcp-cms/src/index.js'), 'utf8')
  const re = /server\.tool\(\s*['"]([^'"]+)['"]/g
  const names = new Set()
  let m
  while ((m = re.exec(src))) names.add(m[1])
  writeJson('mcp-cms/manifest/mcp-tools.v1.json', {
    schema_version: 1,
    tools: [...names].sort(),
  })
}

// Builder widget types (core widgets dir only)
{
  const dir = path.join(root, 'frontend/src/builder/widgets')
  const types = new Set()
  const re = /registerWidget\(\s*\{[\s\S]*?type:\s*['"]([^'"]+)['"]/g
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(tsx?)$/.test(f) || f === 'index.ts') continue
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    let m
    const local = new RegExp(re.source, 'g')
    while ((m = local.exec(src))) types.add(m[1])
  }
  writeJson('frontend/src/builder/manifest/widget-types.v1.json', {
    schema_version: 1,
    widgets: [...types].sort(),
  })
}

// Core capabilities (mirror CapabilityRegistry::ensureCoreDefaults)
{
  const caps = [
    'mail.send',
    'scheduler.jobs',
    'storage.files',
    'builder.widgets',
    'builder.inspector',
    'notifications.send',
    'media.library',
    'users.roles',
    'events.publish',
    'events.subscribe',
    'http.client',
    'settings.global',
    'settings.module',
    'analytics.events',
    'permissions.check',
    'content.pages',
    'admin.pages',
    'public.routes',
    'api.routes',
    'users.current',
  ]
  writeJson('backend/src/Platform/Manifest/capabilities.v1.json', {
    schema_version: 1,
    capabilities: caps.sort(),
  })
}

// Core permissions (FE admin/editor baseline that must remain stable)
{
  const perms = [
    'content.view',
    'content.create',
    'content.update',
    'content.delete',
    'content.publish',
    'content.restore',
    'content.force_delete',
    'media.manage',
    'settings.manage',
    'users.manage',
    'activity.view',
    'commerce.manage',
    'integrations.manage',
  ]
  writeJson('backend/src/Platform/Manifest/permissions-core.v1.json', {
    schema_version: 1,
    permissions: perms,
  })
}

// Core platform events (stable identifiers packages may subscribe to)
{
  const events = [
    'module.boot',
    'pages.seeded',
    'plugin.enabled',
    'plugin.disabled',
    'migration.after',
    'resource.beforeSave',
    'resource.afterSave',
    'resource.beforeDelete',
    'resource.afterDelete',
    'page.afterPublish',
    'form.submitted',
  ]
  writeJson('backend/src/Platform/Manifest/events-core.v1.json', {
    schema_version: 1,
    events,
  })
}

console.log('done')
