#!/usr/bin/env node
/** Validate modules-src/{slug} structure + Platform SDK compliance */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const slug = process.argv[2]
if (!slug) {
  console.error('Usage: node scripts/validate-module.js <slug>')
  process.exit(1)
}
const dir = path.join(root, 'modules-src', slug)
const errors = []
if (!fs.existsSync(dir)) errors.push('missing source dir')
const mf = path.join(dir, 'module.json')
if (!fs.existsSync(mf)) errors.push('missing module.json')
else {
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'))
  if (m.schema_version !== 1) errors.push('schema_version')
  if (m.type !== 'jasefly-module') errors.push('type')
  if (m.slug !== slug) errors.push('slug mismatch')
  if (!m.entrypoints?.backend) errors.push('entrypoints.backend')
  if (m.jasefly?.sdk_version == null) errors.push('jasefly.sdk_version recommended/required for Platform SDK')
  const be = path.join(dir, m.entrypoints.backend)
  if (!fs.existsSync(be)) errors.push('backend entry missing')
}
if (errors.length) {
  console.error('FAIL', errors.join('; '))
  process.exit(1)
}

const sdk = spawnSync('php', [path.join(root, 'backend', 'bin', 'sdk.php'), 'verify-module', dir], { encoding: 'utf8' })
if (sdk.status !== 0) {
  console.error(sdk.stdout || sdk.stderr || 'sdk verify-module failed')
  process.exit(sdk.status || 2)
}
console.log('OK', slug)
