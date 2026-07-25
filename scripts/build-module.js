#!/usr/bin/env node
/**
 * Build a Jasefly module package ZIP from modules-src/{slug}/
 * Usage: node scripts/build-module.js <slug> [--version=x.y.z] [--output=release/modules] [--yes]
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
const yes = args.includes('--yes')
const versionArg = args.find((a) => a.startsWith('--version='))?.slice('--version='.length)
const outDir = args.find((a) => a.startsWith('--output='))?.slice('--output='.length)
  || path.join(root, 'release', 'modules')

if (!slug) {
  console.error('Usage: node scripts/build-module.js <slug> [--version=x.y.z] [--output=dir] [--yes]')
  process.exit(1)
}

const src = path.join(root, 'modules-src', slug)
if (!fs.existsSync(src)) {
  console.error('Module source not found:', src)
  process.exit(1)
}

const manifestPath = path.join(src, 'module.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
if (versionArg) {
  manifest.version = versionArg
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}

const stage = path.join(root, 'release', '.module-stage', `${slug}-${manifest.version}`)
fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })

const banned = new Set(['.env', 'config.local.php', 'node_modules', '.git', 'src maps'])
function copyFiltered(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (banned.has(ent.name) || ent.name === 'frontend' || ent.name.startsWith('.')) continue
    const s = path.join(from, ent.name)
    const d = path.join(to, ent.name)
    if (ent.isDirectory()) copyFiltered(s, d)
    else fs.copyFileSync(s, d)
  }
}

copyFiltered(src, stage)

// Platform SDK gate — fail build if package imports internal Core
const sdkPhp = path.join(root, 'backend', 'bin', 'sdk.php')
if (fs.existsSync(sdkPhp)) {
  const gate = spawnSync('php', [sdkPhp, 'certify', src], { encoding: 'utf8' })
  if (gate.status !== 0) {
    console.error(gate.stdout || '')
    console.error(gate.stderr || '')
    console.error('SDK certification failed — fix Platform SDK violations before packaging')
    process.exit(gate.status || 2)
  }
  console.log('SDK certify: OK')
}

// Prefer prebuilt frontend-dist; optionally build from frontend/ via vite lib if present
const feSrc = path.join(src, 'frontend')
const feDistSrc = path.join(src, 'frontend-dist')
const feDistStage = path.join(stage, 'frontend-dist')
if (fs.existsSync(feDistSrc)) {
  fs.cpSync(feDistSrc, feDistStage, { recursive: true })
} else if (fs.existsSync(feSrc)) {
  console.log('Note: no frontend-dist — copy frontend/src as stub not supported; add frontend-dist/')
}

// Rebuild checksums.json
const files = {}
function walk(dir, base = '') {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(base.replace(/\\/g, '/'), ent.name)
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(abs, rel)
    else if (ent.name !== 'checksums.json' && ent.name !== 'signature.json') {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
      files[rel.replace(/\\/g, '/')] = `sha256:${hash}`
    }
  }
}
walk(stage)
fs.writeFileSync(path.join(stage, 'checksums.json'), JSON.stringify({ algorithm: 'sha256', files }, null, 2) + '\n')
fs.writeFileSync(path.join(stage, 'module.json'), JSON.stringify(manifest, null, 2) + '\n')
// refresh checksum for module.json
const mh = crypto.createHash('sha256').update(fs.readFileSync(path.join(stage, 'module.json'))).digest('hex')
files['module.json'] = `sha256:${mh}`
fs.writeFileSync(path.join(stage, 'checksums.json'), JSON.stringify({ algorithm: 'sha256', files }, null, 2) + '\n')

fs.mkdirSync(outDir, { recursive: true })
const zipName = `jasefly-module-${slug}-${manifest.version}.zip`
const zipPath = path.join(outDir, zipName)

if (fs.existsSync(zipPath) && !yes) {
  console.error('Exists (pass --yes to overwrite):', zipPath)
  process.exit(1)
}
fs.rmSync(zipPath, { force: true })

const isWin = process.platform === 'win32'
if (isWin) {
  const ps = `Compress-Archive -Path '${stage.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status || 1)
} else {
  const r = spawnSync('zip', ['-r', zipPath, '.'], { cwd: stage, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status || 1)
}

console.log('Built', zipPath)
console.log('Files', Object.keys(files).length)
