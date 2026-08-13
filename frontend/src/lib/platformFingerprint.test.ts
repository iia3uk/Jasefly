import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLATFORM_GENERATOR } from './platformFingerprint'

describe('platform HTML generator', () => {
  it('is the public Jasefly token', () => {
    expect(PLATFORM_GENERATOR).toBe('Jasefly')
  })

  it('is present in the SPA shell', () => {
    const html = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html'),
      'utf8',
    )
    expect(html).toContain('<meta name="generator" content="Jasefly"')
  })
})
