import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeReleaseStamp } from '../src/deploy/vps.js';

describe('assertSafeReleaseStamp', () => {
  it('accepts normal release ids', () => {
    assert.equal(assertSafeReleaseStamp('20260408_123456'), '20260408_123456');
    assert.equal(assertSafeReleaseStamp('release-1.2.3'), 'release-1.2.3');
  });

  it('rejects quote / semicolon / substitution / newline / backtick', () => {
    const bad = [
      "foo';rm -rf /",
      'foo;id',
      'foo$(whoami)',
      'foo`id`',
      'foo\nbar',
      'foo bar',
      '../etc',
      '',
    ];
    for (const v of bad) {
      assert.throws(() => assertSafeReleaseStamp(v), /unsafe/);
    }
  });
});
