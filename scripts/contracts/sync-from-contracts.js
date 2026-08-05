#!/usr/bin/env node
'use strict';

/**
 * Sync contracts/ SoT → legacy PHP/FE/MCP snapshot locations (compatibility copies).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function copy(fromRel, toRel) {
  const from = path.join(ROOT, fromRel);
  const to = path.join(ROOT, toRel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`sync ${fromRel} → ${toRel}`);
}

function main() {
  copy('contracts/permissions/permissions-core.v1.json', 'backend/src/Platform/Manifest/permissions-core.v1.json');
  copy('contracts/events/events-core.v1.json', 'backend/src/Platform/Manifest/events-core.v1.json');
  copy('contracts/platform/api-snapshot.v1.json', 'backend/src/Platform/Manifest/api-snapshot.v1.json');
  copy('contracts/mcp/mcp-tools.v1.json', 'mcp-cms/manifest/mcp-tools.v1.json');
  copy('contracts/builder/widget-types.v1.json', 'frontend/src/builder/manifest/widget-types.v1.json');

  // PHP capabilities snapshot keeps flat list (governance); baseline+extended live only in contracts/
  const caps = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts/capabilities/capabilities.v1.json'), 'utf8'),
  );
  const flat = {
    schema_version: 1,
    capabilities: [...new Set([...(caps.capabilities || []), ...(caps.baseline || [])])]
      .filter((c) => !(caps.extended || []).includes(c))
      .sort(),
  };
  // Keep original platform service caps for PHP governance (subset)
  const phpCapsPath = path.join(ROOT, 'backend/src/Platform/Manifest/capabilities.v1.json');
  const existing = JSON.parse(fs.readFileSync(phpCapsPath, 'utf8'));
  // Preserve PHP list if it is the platform-service set; do not wipe with runtime caps
  if (Array.isArray(existing.capabilities) && existing.capabilities.includes('access.service')) {
    console.log('sync skip capabilities.v1.json (PHP platform service list preserved)');
  } else {
    fs.writeFileSync(phpCapsPath, JSON.stringify(flat, null, 2) + '\n');
  }

  console.log('sync-from-contracts OK');
}

main();
