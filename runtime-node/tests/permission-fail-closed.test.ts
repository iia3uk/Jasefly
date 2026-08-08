import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../src/config.js';

function read(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('Package permission middleware fail-closed', () => {
  it('sdk permission() resolves user capabilities (no admin-role bypass)', () => {
    const src = read('runtime-node/src/platform/sdk.ts');
    expect(src).toMatch(/hasUserCapability\(payload\.capabilities/);
    const permissionBlock = src.slice(src.indexOf('const permissionMw'));
    expect(permissionBlock.slice(0, 800)).not.toMatch(/ADMIN_ROLES\.has\(role\)/);
  });

  it('permissionAny also requires explicit capabilities', () => {
    const src = read('runtime-node/src/platform/sdk.ts');
    expect(src).toMatch(/permissionAny[\s\S]*hasUserCapability\(userCaps/);
  });
});
