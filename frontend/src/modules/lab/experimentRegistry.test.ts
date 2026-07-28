/**
 * Every experimentRegistry key must resolve to an on-disk module.
 * Catches stale imports that break Linux CI (`tsc -b`) while local case-insensitive FS may hide them.
 * @vitest-environment node
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { listExperimentKeys } from './experimentRegistry'

const labDir = path.dirname(fileURLToPath(import.meta.url))

describe('lab experimentRegistry', () => {
  it('lists at least the starter entry', () => {
    expect(listExperimentKeys()).toContain('starter')
  })

  it('every registry key has experiments/<key>/index.ts(x)', () => {
    const keys = listExperimentKeys()
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      const dir = path.join(labDir, 'experiments', key)
      const indexTs = path.join(dir, 'index.ts')
      const indexTsx = path.join(dir, 'index.tsx')
      expect(
        existsSync(indexTs) || existsSync(indexTsx),
        `missing experiment module for registry key "${key}" (expected ${indexTs} or ${indexTsx})`,
      ).toBe(true)
    }
  })
})
