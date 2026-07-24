/**
 * SVG → favicon.ico + apple-touch-icon.png + favicon.png
 *
 * deps: .tools/favicon-gen (gitignored)
 *   cd .tools/favicon-gen && npm i sharp png-to-ico
 *   node scripts/generate-favicon.mjs
 *
 * Transparent square + padded contain — logo not clipped at edges in tabs/snippets.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const toolsPkg = path.join(root, '.tools', 'favicon-gen', 'package.json')
if (!fs.existsSync(toolsPkg)) {
  console.error('Missing .tools/favicon-gen. Run: cd .tools/favicon-gen && npm i sharp png-to-ico')
  process.exit(1)
}

const require = createRequire(toolsPkg)
const sharp = require('sharp')
const pngToIcoMod = require('png-to-ico')
const pngToIco = typeof pngToIcoMod === 'function' ? pngToIcoMod : pngToIcoMod.default

const outDir = path.join(root, 'frontend', 'public')
const svg = fs.readFileSync(path.join(outDir, 'favicon-jasefly.svg'))
const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
const siteBg = { r: 6, g: 8, b: 12, alpha: 1 }

async function squarePng(size, padRatio = 0.14) {
  const inner = Math.max(1, Math.round(size * (1 - padRatio * 2)))
  const logo = await sharp(svg, { density: 512 })
    .trim({ threshold: 0 })
    .resize(inner, inner, { fit: 'contain', background: transparent })
    .ensureAlpha()
    .png()
    .toBuffer()
  const left = Math.floor((size - inner) / 2)
  const top = Math.floor((size - inner) / 2)
  return sharp({
    create: { width: size, height: size, channels: 4, background: transparent },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer()
}

const png16 = await squarePng(16)
const png32 = await squarePng(32)
const png48 = await squarePng(48)
const appleInner = await sharp(svg, { density: 512 })
  .trim({ threshold: 0 })
  .resize(140, 140, { fit: 'contain', background: transparent })
  .png()
  .toBuffer()
const png180 = await sharp({
  create: { width: 180, height: 180, channels: 4, background: siteBg },
})
  .composite([{ input: appleInner, left: 20, top: 20 }])
  .png()
  .toBuffer()

fs.writeFileSync(path.join(outDir, 'favicon.ico'), await pngToIco([png16, png32, png48]))
fs.writeFileSync(path.join(outDir, 'favicon.png'), png32)
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), png180)

console.log(JSON.stringify({
  ok: true,
  favicon_ico: fs.statSync(path.join(outDir, 'favicon.ico')).size,
  apple_touch: fs.statSync(path.join(outDir, 'apple-touch-icon.png')).size,
  favicon_png: fs.statSync(path.join(outDir, 'favicon.png')).size,
}, null, 2))
