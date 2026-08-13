import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { googleFontsCssUrl } from './googleFonts'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('Google Fonts loading', () => {
  it('stylesheet URL uses display=swap', () => {
    expect(googleFontsCssUrl(['Sora'])).toContain('display=swap')
  })

  it('SPA shell preconnects Google Font hosts', () => {
    const html = readFileSync(resolve(frontendRoot, 'index.html'), 'utf8')
    expect(html).toContain('rel="preconnect" href="https://fonts.googleapis.com"')
    expect(html).toContain('href="https://fonts.gstatic.com" crossorigin')
    expect(html).toContain('display=swap')
  })
})
